<script setup lang="ts">
import type { Tables } from '@/types/database.overrides'
import { Button, CopyClipboard, Flex, Tooltip } from '@dolanske/vui'
import FriendsModal from '@/components/Profile/FriendsModal.vue'
import ProfileBadges from '@/components/Profile/ProfileBadges.vue'
import ProfileBanStatus from '@/components/Profile/ProfileBanStatus.vue'
import ProfileForm from '@/components/Profile/ProfileForm.vue'
import ProfileFriends from '@/components/Profile/ProfileFriends.vue'
import ProfileHeader from '@/components/Profile/ProfileHeader.vue'
import ComplaintsManager from '@/components/Shared/ComplaintsManager.vue'
import ErrorAlert from '@/components/Shared/ErrorAlert.vue'
import { useAvatarBus } from '@/composables/useAvatarBus'
import { useCachedFetch } from '@/composables/useCache'
import { useDataUser } from '@/composables/useDataUser'
import { useFriendship } from '@/composables/useFriendship'
import Discussion from '../Discussions/Discussion.vue'
import ProfileActivity from './ProfileActivity.vue'
import ProfileDiscussions from './ProfileDiscussions.vue'

interface Props {
  userId?: string
  username?: string
}

const props = defineProps<Props>()

const supabase = useSupabaseClient()
const user = useSupabaseUser()
const isLoggedIn = computed(() => !!user.value)
const userId = useUserId() // Use helper to get ID from JWT claims
const { navigateToSignIn } = useAuthRedirect()
type ProfileRecord = Tables<'profiles'>

type ProfileRecordInput = ProfileRecord | (Omit<ProfileRecord, 'badges'> & {
  badges: ReadonlyArray<ProfileRecord['badges'][number]>
})

const profile = ref<ProfileRecord>()
const loading = ref(true)
const errorMessage = ref('')
const isEditSheetOpen = ref(false)
const showComplaintModal = ref(false)
const showFriendsModal = ref(false)
const profileSubmissionError = ref<string | null>(null)

// Add refresh functionality for avatar updates
const refreshTrigger = ref(0)

function cloneProfileRecord(record: ProfileRecordInput): ProfileRecord {
  return {
    ...record,
    badges: [...record.badges],
  }
}

// Computed property to check if this is the user's own profile
const isOwnProfile = computed(() => {
  if (!userId.value || !profile.value)
    return false

  return userId.value === profile.value.id
})

const profileUserId = computed(() => profile.value?.id ?? null)

// Get current user's data with caching
const {
  user: currentUserData,
} = useDataUser(
  userId,
  {
    includeRole: true,
    includeAvatar: false,
    userTtl: 15 * 60 * 1000, // 15 minutes
  },
)

// Get profile user's data with caching (once we have the profile ID)
const {
  user: _profileUserData,
  refetch: refetchProfileUserData,
} = useDataUser(
  profileUserId,
  {
    includeRole: true,
    includeAvatar: true,
    userTtl: 10 * 60 * 1000, // 10 minutes for viewed profiles
    avatarTtl: 60 * 60 * 1000, // 1 hour for avatars
  },
)

// Computed properties to get cached data
const currentUserRole = computed(() => currentUserData.value?.role || null)

// Computed property to check if the current user is an admin
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

// Fetch profile data with caching based on props (fallback to current user if none provided)
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
    // For case-insensitive username lookup, normalize the cache key by using lowercase
    // but search with ilike to match any case in the database
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
    // Fallback: show current user's profile when no explicit props provided
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
    ttl: 10 * 60 * 1000, // 10 minutes for profile data
  },
)

const hydratedProfileData = computed<ProfileRecord | null>(() => profileData.value as ProfileRecord | null)

// Set profile from cached data
watch(hydratedProfileData, (newData) => {
  if (newData) {
    const hydratedProfile = cloneProfileRecord(newData as ProfileRecordInput)
    profile.value = hydratedProfile
    // Check friendship status after profile is loaded
    checkFriendshipStatus()
  }
}, { immediate: true })

// Private-profile guard: redirect unauthenticated visitors away from private profiles.
// This replaces the duplicate guard-only query that used to live in pages/profile/[id].vue.
// We only act once the profile has loaded (so we know the public flag) and only when
// the caller passed explicit userId/username props (i.e. we're on a public profile route,
// not the "my own profile" fallback path).
watch(
  [hydratedProfileData, user],
  ([loadedProfile, currentUser]) => {
    const isExplicitRoute = !!(props.userId ?? props.username)
    if (!isExplicitRoute || !loadedProfile)
      return

    if (!loadedProfile.public && !currentUser) {
      navigateToSignIn()
    }
  },
  { immediate: true },
)

// Handle profile errors
watch(profileError, (error) => {
  if (error) {
    if (error.includes('JSON object requested, multiple (or no) rows returned')) {
      errorMessage.value = props.username
        ? `User "${props.username}" was not found`
        : 'User not found'
    }
    else {
      errorMessage.value = error
    }
  }
  else {
    errorMessage.value = ''
  }
}, { immediate: true })

// Handle missing identifiers (only error if we can't infer current user)
watch(() => [props.userId, props.username, user.value?.id], ([userId, username, currentUserId]) => {
  if (!userId && !username && !currentUserId) {
    errorMessage.value = 'No user ID or username provided'
    loading.value = false
  }
  else {
    // Clear message when we have enough info to load
    if (errorMessage.value === 'No user ID or username provided')
      errorMessage.value = ''
  }
}, { immediate: true })

// Set loading state
watch(profileLoading, (isLoading) => {
  loading.value = isLoading
}, { immediate: true })

// Typed avatar bus - replaces the raw window.addEventListener('avatar-updated') +
// the redundant window.addEventListener('storage') double-listener pattern
const { onAvatarUpdated } = useAvatarBus()
onAvatarUpdated(({ userId }) => {
  if (userId === profile.value?.id) {
    void refreshAvatar()
  }
})

// Profile editing functions
function openEditSheet() {
  isEditSheetOpen.value = true
}

function closeEditSheet() {
  isEditSheetOpen.value = false
  // Clear any submission errors when closing
  profileSubmissionError.value = null
}

function clearProfileError() {
  profileSubmissionError.value = null
}

function handleProfilePatch(patch: Partial<Tables<'profiles'>>) {
  if (!profile.value)
    return
  // Patch local state immediately so the UI updates without waiting
  profile.value = cloneProfileRecord({ ...profile.value, ...patch })
  // Bust the localStorage cache so reloads don't serve stale has_banner state
  void refetchProfile()
}

async function handleProfileSave(updatedProfile: Partial<Tables<'profiles'>>) {
  if (!profile.value)
    return

  // Clear any previous errors
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

    // Update local profile data
    profile.value = cloneProfileRecord(data)

    // Refresh cached user data in case it was updated
    await refetchProfileUserData()

    closeEditSheet()
  }
  catch (error: unknown) {
    console.error('Error updating profile:', error)

    // Handle specific database errors
    const errorObj = error as { code?: string, message?: string }
    if (errorObj?.code === '23505' && errorObj?.message?.includes('profiles_username_key')) {
      // Set error for duplicate username
      profileSubmissionError.value = 'This username is already taken (usernames are case-insensitive). Please choose a different one.'
    }
    else {
      // Set generic error
      profileSubmissionError.value = 'An error occurred while saving your profile. Please try again.'
    }
  }
}

// Complaint modal functions
function openComplaintModal() {
  // Check if user is authenticated
  if (!user.value) {
    // Redirect to sign-in page if not authenticated
    navigateToSignIn()
    return
  }

  showComplaintModal.value = true
}

function handleComplaintSubmit(_complaintData: { message: string }) {
  // Could show a success toast here in the future
  // For now, just handle the successful submission
}

// Function to refresh avatar URL
async function refreshAvatar() {
  if (profile.value?.id) {
    // Force refresh by refetching cached user data
    await refetchProfileUserData()
  }
}

// Function to trigger avatar refresh (can be called from external components)
function triggerAvatarRefresh() {
  refreshTrigger.value++
}

// Watch for refresh trigger changes
watch(refreshTrigger, () => {
  refreshAvatar()
})

// Watch for profile changes to update cached data if needed
watch(() => profile.value?.id, async (newId, oldId) => {
  if (newId && newId !== oldId) {
    await checkFriendshipStatus()
    await fetchAllFriendships()
  }
})

// Watch for user authentication changes to recheck friendship status
watch(() => userId.value, async (newUserId, oldUserId) => {
  if (newUserId !== oldUserId) {
    await checkFriendshipStatus()
  }
})

// Expose function for parent components to trigger refresh
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
    <!-- Error State -->
    <template v-if="errorMessage">
      <ErrorAlert :message="errorMessage" />
    </template>

    <!-- No Profile Found -->
    <template v-else-if="!loading && !profile">
      <ErrorAlert message="No profile found." />
    </template>

    <!-- Loading skeleton layout -->
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

    <!-- Profile Content -->
    <template v-else-if="profile">
      <!-- Ban Status Callout -->
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
          />
        </Flex>

        <!-- (Right) -->
        <Flex column gap="m" class="profile-sidebar-col">
          <!-- Activity section -->
          <ProfileActivity
            v-if="profile.steam_id !== null || profile.teamspeak_identities?.toString() !== ''"
            :profile="profile"
            :is-own-profile="isOwnProfile"
            :is-logged-in="isLoggedIn"
          />

          <!-- Recent Discussions -->
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

          <!-- Badges -->
          <ProfileBadges :profile-id="profile.id" :is-own-profile="isOwnProfile" />
        </Flex>

        <!-- Profile comments - full width on mobile, below header on desktop -->
        <Discussion
          :id="profile.id"
          class="profile-discussion-col"
          type="profile"
          :timestamps="true"
          :placeholder="`Leave a shout for ${profile.username} here! Or not...`"
        />

        <!-- Admin-only UUID display -->
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

    <!-- Friends Modal -->
    <FriendsModal
      v-model:open="showFriendsModal"
      :friends="friends"
      :sent-requests="sentRequests"
      :incoming-requests="incomingRequests"
      :user-name="profile?.username || 'User'"
      :show-all-tabs="isOwnProfile"
      @close="showFriendsModal = false"
    />

    <!-- Profile Edit Form Sheet -->
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

    <!-- Complaints Manager -->
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
