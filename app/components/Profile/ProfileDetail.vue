<script setup lang="ts">
import type { Tables } from '@/types/database.overrides'
import { Button, CopyClipboard, Flex, Tooltip } from '@dolanske/vui'
import { nextTick } from 'vue'
import FriendsModal from '@/components/Profile/FriendsModal.vue'
import ProfileBadges from '@/components/Profile/ProfileBadges.vue'
import ProfileBanStatus from '@/components/Profile/ProfileBanStatus.vue'
import ProfileForm from '@/components/Profile/ProfileForm.vue'
import ProfileFriends from '@/components/Profile/ProfileFriends.vue'
import ProfileGames from '@/components/Profile/ProfileGames.vue'
import ProfileHeader from '@/components/Profile/ProfileHeader.vue'
import ComplaintsManager from '@/components/Shared/ComplaintsManager.vue'
import ErrorAlert from '@/components/Shared/ErrorAlert.vue'
import { useAvatarBus } from '@/composables/useAvatarBus'
import { useCachedFetch } from '@/composables/useCache'
import { useDataUser } from '@/composables/useDataUser'
import { useFriendship } from '@/composables/useFriendship'
import { useSessionReady } from '@/composables/useSessionReady'
import Discussion from '../Discussions/Discussion.vue'
import ProfileActivity from './ProfileActivity.vue'
import ProfileDiscussions from './ProfileDiscussions.vue'
import ProfileTheme from './ProfileTheme.vue'

interface Props {
  userId?: string
  username?: string
}

const props = defineProps<Props>()

const supabase = useSupabaseClient()
const user = useSupabaseUser()
const { waitForSessionReady } = useSessionReady()
const isLoggedIn = computed(() => !!user.value)
const authReady = ref(false)
const sessionUser = ref<{ id: string } | null>(null)
const userId = useUserId()
const { navigateToSignIn } = useAuthRedirect()
type ProfileRecord = Tables<'profiles'>

const profile = ref<ProfileRecord>()
const errorMessage = ref('')
const isEditSheetOpen = ref(false)
const showComplaintModal = ref(false)
const showFriendsModal = ref(false)
const profileSubmissionError = ref<string | null>(null)

const refreshTrigger = ref(0)

function cloneProfileRecord(record: ProfileRecord): ProfileRecord {
  return { ...record }
}

const isOwnProfile = computed(() => {
  if (!userId.value || !profile.value)
    return false

  return userId.value === profile.value.id
})

const profileUserId = computed(() => profile.value?.id ?? null)

const {
  user: currentUserData,
} = useDataUser(
  userId,
  {
    includeRole: true,
    includeAvatar: false,
    userTtl: 15 * 60 * 1000,
  },
)

const {
  user: _profileUserData,
  refetch: refetchProfileUserData,
} = useDataUser(
  profileUserId,
  {
    includeRole: true,
    includeAvatar: true,
    userTtl: 10 * 60 * 1000,
    avatarTtl: 60 * 60 * 1000,
  },
)

const currentUserRole = computed(() => currentUserData.value?.role || null)

const isCurrentUserAdmin = computed(() => {
  return currentUserRole.value === 'admin'
})

const {
  friendshipStatus,
  friends,
  sentRequests,
  incomingRequests,
  friendsLoading,
  checkFriendshipStatus,
  fetchAllFriendships,
  sendFriendRequest,
  acceptFriendRequest,
  revokeFriendRequest,
  removeFriend,
  ignoreFriendRequest,
} = useFriendship(userId, profileUserId, isOwnProfile, isLoggedIn)

const profileQuery = computed(() => {
  if (props.userId) {
    return {
      table: 'profiles' as const,
      select: '*',
      filters: { id: props.userId },
      single: true,
    }
  }
  else if (props.username) {
    // Lowercase the cache key but search with ilike so any stored case matches
    const normalizedUsername = props.username.toLowerCase()
    return {
      table: 'profiles' as const,
      select: '*',
      filters: { username: normalizedUsername },
      filterOperators: { username: 'ilike' as const },
      single: true,
    }
  }
  else if (user.value?.id) {
    return {
      table: 'profiles' as const,
      select: '*',
      filters: { id: userId.value },
      single: true,
    }
  }

  return null
})

const {
  data: profileData,
  loading: profileLoading,
  error: profileError,
  refetch: refetchProfile,
} = useCachedFetch<Tables<'profiles'>>(
  profileQuery,
  {
    enabled: computed(() => !!(props.userId || props.username || user.value?.id)),
    ttl: 10 * 60 * 1000,
  },
)

const hydratedProfileData = computed<ProfileRecord | null>(() => profileData.value as ProfileRecord | null)

const fetchSettled = ref(false)
const loading = computed(() => profileLoading.value || !fetchSettled.value)

watch(hydratedProfileData, (newData) => {
  if (newData) {
    const hydratedProfile = cloneProfileRecord(newData as ProfileRecord)
    profile.value = hydratedProfile

    checkFriendshipStatus()
  }
}, { immediate: true })

// Resolve the session on mount before the private-profile guard trusts it. On a hard
// reload useSupabaseUser() is null while the session restores, which would redirect to sign-in.
onMounted(async () => {
  await waitForSessionReady()
  const result = await supabase.auth.getSession().catch(() => null)
  sessionUser.value = result?.data?.session?.user ?? null
  authReady.value = true
})

// Private-profile guard: send signed-out visitors to sign-in. Only acts on explicit
// userId/username routes, after the profile has loaded and auth is ready.
watch(
  [hydratedProfileData, user, authReady, sessionUser],
  ([loadedProfile, currentUser, isAuthReady]) => {
    if (!isAuthReady)
      return

    const isExplicitRoute = !!(props.userId ?? props.username)
    if (!isExplicitRoute || !loadedProfile)
      return

    // useSupabaseUser can still be null after getSession() resolves on a hard reload,
    // so fall back to the session resolved on mount
    const isAuthenticated = !!(currentUser ?? sessionUser.value)
    if (!loadedProfile.public && !isAuthenticated) {
      navigateToSignIn()
    }
  },
  { immediate: true },
)

watch(profileError, (error) => {
  if (error) {
    if (error.includes('JSON object requested, multiple (or no) rows returned')) {
      errorMessage.value = props.username
        ? `User "${props.username}" was not found`
        : 'User not found'
    }
    else if (!isLoggedIn.value) {
      // RLS blocks signed-out reads on private profiles, so hint at signing in
      errorMessage.value = 'This profile could not be loaded. It may be private - sign in to view it.'
    }
    else {
      errorMessage.value = error
    }
  }
  else {
    errorMessage.value = ''
  }
}, { immediate: true })

watch(() => [props.userId, props.username, user.value?.id], ([userId, username, currentUserId]) => {
  if (!userId && !username && !currentUserId) {
    errorMessage.value = 'No user ID or username provided'
    fetchSettled.value = true
  }
  else {
    if (errorMessage.value === 'No user ID or username provided')
      errorMessage.value = ''
  }
}, { immediate: true })

// profileLoading is false before the first fetch and never goes true on a cache
// hit, so loading waits for fetchSettled (data or error arrived) instead.
watch(profileData, (data) => {
  if (data !== null)
    fetchSettled.value = true
}, { immediate: true })
watch(profileError, (err) => {
  if (err !== null)
    fetchSettled.value = true
}, { immediate: true })

const { onAvatarUpdated } = useAvatarBus()
onAvatarUpdated(({ userId }) => {
  if (userId === profile.value?.id) {
    void refreshAvatar()
  }
})

function openEditSheet() {
  isEditSheetOpen.value = true
}

function closeEditSheet() {
  isEditSheetOpen.value = false

  profileSubmissionError.value = null
}

function clearProfileError() {
  profileSubmissionError.value = null
}

function handleProfilePatch(patch: Partial<Tables<'profiles'>>) {
  if (!profile.value)
    return

  profile.value = cloneProfileRecord({ ...profile.value, ...patch })

  // Bust the localStorage cache so reloads don't serve stale has_banner state
  void refetchProfile()
}

async function handleProfileSave(updatedProfile: Partial<Tables<'profiles'>>) {
  if (!profile.value)
    return

  profileSubmissionError.value = null

  try {
    const { data, error } = await supabase
      .from('profiles')
      .update(updatedProfile)
      .eq('id', profile.value.id)
      .select()
      .single()

    if (error)
      throw error

    profile.value = cloneProfileRecord(data)

    // Bust the profile cache so reloads serve fresh data (markdown, etc.)
    void refetchProfile()

    await refetchProfileUserData()

    // Close on the next tick. Unmounting Tiptap in the same flush as the profile.value
    // update makes ProseMirror throw a RangeError.
    await nextTick()
    closeEditSheet()
  }
  catch (error: unknown) {
    console.error('Error updating profile:', error)

    const errorObj = error as { code?: string, message?: string }
    if (errorObj?.code === '23505' && errorObj?.message?.includes('profiles_username_key')) {
      profileSubmissionError.value = 'This username is already taken (usernames are case-insensitive). Please choose a different one.'
    }
    else {
      profileSubmissionError.value = 'An error occurred while saving your profile. Please try again.'
    }
  }
}

function openComplaintModal() {
  if (!user.value) {
    navigateToSignIn()
    return
  }

  showComplaintModal.value = true
}

function handleComplaintSubmit(_complaintData: { message: string }) {
  // Nothing to do on success yet
}

async function refreshAvatar() {
  if (profile.value?.id) {
    await refetchProfileUserData()
  }
}

function triggerAvatarRefresh() {
  refreshTrigger.value++
}

watch(refreshTrigger, () => {
  refreshAvatar()
})

watch(() => profile.value?.id, async (newId, oldId) => {
  if (newId && newId !== oldId) {
    await checkFriendshipStatus()
    await fetchAllFriendships()
  }
})

watch(() => userId.value, async (newUserId, oldUserId) => {
  if (newUserId !== oldUserId) {
    await checkFriendshipStatus()
  }
})

defineExpose({
  triggerAvatarRefresh,
  refreshAvatar,
})

function openFriendsModal() {
  showFriendsModal.value = true
}
</script>

<template>
  <div class="profile-view">
    <template v-if="errorMessage">
      <ErrorAlert standalone :message="errorMessage" />
    </template>

    <template v-else-if="!loading && !profile">
      <ErrorAlert message="No profile found." />
    </template>

    <template v-else-if="loading">
      <div class="profile-sections">
        <Flex column gap="l" class="profile-header-col">
          <ProfileHeader
            :loading="true"
            :is-own-profile="false"
            friendship-status="none"
          />
        </Flex>

        <Flex column gap="m" class="profile-sidebar-col">
          <ProfileFriends :skeleton="true" friendship-status="none" />
        </Flex>
      </div>
    </template>

    <template v-else-if="profile">
      <ProfileBanStatus v-if="profile.banned" :profile="profile" />

      <!-- Profile Sections -->
      <div class="profile-sections">
        <!-- About Section (Left) -->
        <Flex column gap="l" class="profile-header-col">
          <ProfileHeader
            :profile="profile"
            :is-own-profile="isOwnProfile"
            :friendship-status="friendshipStatus"
            :is-logged-in="isLoggedIn"
            @open-edit-sheet="openEditSheet"
            @open-complaint-modal="openComplaintModal"
            @moderated="refetchProfile"
          />
        </Flex>

        <Flex column gap="m" class="profile-sidebar-col">
          <ProfileTheme v-if="profile.theme_id" :theme-id="profile.theme_id" />

          <ProfileActivity
            v-if="profile.steam_id !== null || profile.teamspeak_identities?.toString() !== ''"
            :profile="profile"
            :is-own-profile="isOwnProfile"
            :is-logged-in="isLoggedIn"
          />

          <!-- Rich presence off is a deliberate opt-out, so the card is hidden rather than shown locked -->
          <ProfileGames
            v-if="profile.steam_id && profile.rich_presence_enabled"
            :profile="profile"
            :is-logged-in="isLoggedIn"
          />

          <ProfileDiscussions :profile-id="profile.id" :username="profile.username" />

          <!-- Friends Section -->
          <ProfileFriends
            :profile="profile"
            :friends="friends"
            :friendship-status="friendshipStatus"
            :is-own-profile="isOwnProfile"
            :is-logged-in="isLoggedIn"
            :loading="friendsLoading"
            @open-friends-modal="openFriendsModal"
            @send-friend-request="sendFriendRequest"
            @accept-friend-request="acceptFriendRequest"
            @ignore-friend-request="ignoreFriendRequest"
            @revoke-friend-request="revokeFriendRequest"
            @remove-friend="removeFriend"
          />

          <ProfileBadges :profile-id="profile.id" :is-own-profile="isOwnProfile" />
        </Flex>

        <!-- Profile comments: full width on mobile, below the header on desktop -->
        <Discussion
          :id="profile.id"
          class="profile-discussion-col"
          type="profile"
          :timestamps="true"
          :placeholder="`Leave a shout for ${profile.username} here! Or not...`"
        />

        <Flex x-center expand>
          <CopyClipboard :text="profile.id" confirm>
            <Tooltip v-if="isCurrentUserAdmin">
              <Button size="s" plain>
                <template #start>
                  <Icon class="text-color-lightest" name="ph:hash" size="12" />
                </template>
                <span class="text-xxs text-color-lightest font-mono">{{ profile.id }}</span>
              </Button>
              <template #tooltip>
                <p>Copy user id</p>
              </template>
            </Tooltip>
          </CopyClipboard>
        </Flex>
      </div>
    </template>

    <FriendsModal
      v-model:open="showFriendsModal"
      :friends="friends"
      :sent-requests="sentRequests"
      :incoming-requests="incomingRequests"
      :user-name="profile?.username || 'User'"
      :show-all-tabs="isOwnProfile"
      @close="showFriendsModal = false"
    />

    <ProfileForm
      :profile="profile || null"
      :is-open="isEditSheetOpen"
      :submission-error="profileSubmissionError"
      @save="handleProfileSave"
      @close="closeEditSheet"
      @update:is-open="isEditSheetOpen = $event"
      @clear-error="clearProfileError"
      @profile-patch="handleProfilePatch"
    />

    <ComplaintsManager
      v-model:open="showComplaintModal"
      :target-user-id="profile?.id"
      :target-user-name="profile?.username"
      :start-with-submit="true"
      @submit="handleComplaintSubmit"
    />
  </div>
</template>

<style lang="scss">
.profile-view {
  display: flex;
  flex-direction: column;
  gap: var(--space-l);
  width: 100%;
}

.profile-sections {
  display: grid;
  grid-template-columns: 1fr 356px;
  grid-template-rows: auto 1fr auto;
  gap: var(--space-m);

  .profile-header-col {
    grid-column: 1;
    grid-row: 1;
    align-self: start;
  }

  .profile-sidebar-col {
    grid-column: 2;
    grid-row: 1 / -1;
    align-self: start;
    min-width: 0;
  }

  .profile-discussion-col {
    grid-column: 1;
    grid-row: 2;
    align-self: start;
  }

  @media (max-width: 768px) {
    grid-template-columns: 1fr;

    .profile-header-col {
      grid-column: 1;
      grid-row: 1;
    }

    .profile-sidebar-col {
      grid-column: 1;
      grid-row: 2;
    }

    .profile-discussion-col {
      grid-column: 1;
      grid-row: 3;
    }
  }
}
</style>
