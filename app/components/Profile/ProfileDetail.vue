<script setup lang="ts">
import type { Tables } from '@/types/database.types'
import { Card, Flex, Skeleton } from '@dolanske/vui'
import FriendsModal from '@/components/Profile/FriendsModal.vue'
import ProfileBadges from '@/components/Profile/ProfileBadges.vue'
import ProfileBanStatus from '@/components/Profile/ProfileBanStatus.vue'
import ProfileForm from '@/components/Profile/ProfileForm.vue'
import ProfileFriends from '@/components/Profile/ProfileFriends.vue'
import ProfileHeader from '@/components/Profile/ProfileHeader.vue'
import ComplaintsManager from '@/components/Shared/ComplaintsManager.vue'
import ErrorAlert from '@/components/Shared/ErrorAlert.vue'
import { useCacheQuery } from '@/composables/useCache'
import { useCacheUserData } from '@/composables/useCacheUserData'

interface Props {
  userId?: string
  username?: string
}

const props = defineProps<Props>()

const supabase = useSupabaseClient()
const user = useSupabaseUser()
const userId = useUserId() // Use helper to get ID from JWT claims
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

// Friend-related state
const friendshipStatus = ref<'none' | 'mutual' | 'sent_request' | 'received_request' | 'loading'>('none')
const sentFriendshipId = ref<number | null>(null)
const receivedFriendshipId = ref<number | null>(null)

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

// Get current user's data with caching
const {
  user: currentUserData,
} = useCacheUserData(
  userId, // Use the computed user ID
  {
    includeRole: true,
    includeAvatar: false, // We don't need current user's avatar here
    userTtl: 15 * 60 * 1000, // 15 minutes
  },
)

// Get profile user's data with caching (once we have the profile ID)
const profileUserId = computed(() => profile.value?.id || null)
const {
  user: profileUserData,
  refetch: refetchProfileUserData,
} = useCacheUserData(
  profileUserId,
  {
    includeRole: true,
    includeAvatar: true,
    userTtl: 10 * 60 * 1000, // 10 minutes for viewed profiles
    avatarTtl: 60 * 60 * 1000, // 1 hour for avatars
  },
)

// Computed properties to get cached data
const avatarUrl = computed(() => profileUserData.value?.avatarUrl || null)
const userRole = computed(() => profileUserData.value?.role || null)
const currentUserRole = computed(() => currentUserData.value?.role || null)

// Fetch friendships data with caching
const {
  data: _friendshipsData,
  refetch: _refetchFriendships,
} = useCacheQuery<Array<{ id: number, friender: string, friend: string }>>({
  table: 'friends',
  select: 'id, friender, friend',
  filters: {
    // We'll handle the complex OR logic in the computed
  },
}, {
  enabled: computed(() => !!userId.value && !!profile.value && !isOwnProfile.value),
  ttl: 2 * 60 * 1000, // 2 minutes for friendship data
})

// Computed property to check if the current user is an admin
const isCurrentUserAdmin = computed(() => {
  return currentUserRole.value === 'admin'
})

// Computed properties for friends data
const allFriendships = ref<Array<{ id: number, friender: string, friend: string }>>([])
const friendsLoading = ref(true)

// Get friends (mutual friendships)
const friends = computed(() => {
  if (!profile.value)
    return []

  const sentByProfile = allFriendships.value.filter(f => f.friender === profile.value!.id)
  const receivedByProfile = allFriendships.value.filter(f => f.friend === profile.value!.id)

  // Find mutual friends (users who have both sent and received friendship with this profile)
  const mutualFriends: string[] = []

  sentByProfile.forEach((sent) => {
    const mutual = receivedByProfile.find(received => received.friender === sent.friend)
    if (mutual) {
      mutualFriends.push(sent.friend)
    }
  })

  return mutualFriends
})

// Get sent requests (profile sent but no reciprocation)
const sentRequests = computed(() => {
  if (!profile.value)
    return []

  const sentByProfile = allFriendships.value.filter(f => f.friender === profile.value!.id)
  const receivedByProfile = allFriendships.value.filter(f => f.friend === profile.value!.id)

  const sentRequests: string[] = []

  sentByProfile.forEach((sent) => {
    const mutual = receivedByProfile.find(received => received.friender === sent.friend)
    if (!mutual) {
      sentRequests.push(sent.friend)
    }
  })

  return sentRequests
})

// Get pending requests (others sent to profile but profile hasn't reciprocated)
const pendingRequests = computed(() => {
  if (!profile.value)
    return []

  const sentByProfile = allFriendships.value.filter(f => f.friender === profile.value!.id)
  const receivedByProfile = allFriendships.value.filter(f => f.friend === profile.value!.id)

  const pendingRequests: string[] = []

  receivedByProfile.forEach((received) => {
    const mutual = sentByProfile.find(sent => sent.friend === received.friender)
    if (!mutual) {
      pendingRequests.push(received.friender)
    }
  })

  return pendingRequests
})

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
  refetch: _refetchProfile,
} = useCacheQuery<Tables<'profiles'>>(
  profileQuery.value || { table: 'profiles', select: '*', filters: {} },
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

onMounted(() => {
  // Profile data will be fetched automatically by the cached query
  // Listen for custom avatar update events
  window.addEventListener('avatar-updated', handleAvatarUpdate)

  // Listen for storage events (when avatar is updated)
  window.addEventListener('storage', (event) => {
    if (event.key?.includes('avatar-updated') && profile.value?.id) {
      refreshAvatar()
    }
  })
})

onUnmounted(() => {
  window.removeEventListener('avatar-updated', handleAvatarUpdate)
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
    navigateTo('/auth/sign-in')
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
    // Cached data will auto-refresh due to profileUserId computed change
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

// Handle avatar update events
function handleAvatarUpdate(event: Event) {
  const customEvent = event as CustomEvent
  if (customEvent.detail?.userId === profile.value?.id) {
    refreshAvatar()
  }
}

// Friend-related functions
async function checkFriendshipStatus() {
  if (!user.value || !profile.value || isOwnProfile.value) {
    friendshipStatus.value = 'none'
    return
  }

  friendshipStatus.value = 'loading'

  try {
    // Check for friendship requests in both directions
    const { data: friendships, error } = await supabase
      .from('friends')
      .select('id, friender, friend')
      .or(`and(friender.eq.${userId.value},friend.eq.${profile.value.id}),and(friender.eq.${profile.value.id},friend.eq.${userId.value})`)

    if (error && error.code !== 'PGRST116') { // PGRST116 is "not found"
      console.error('Error checking friendship status:', error)
      friendshipStatus.value = 'none'
      return
    }

    if (!friendships || friendships.length === 0) {
      // No friendship exists
      friendshipStatus.value = 'none'
      sentFriendshipId.value = null
      receivedFriendshipId.value = null
      return
    }

    // Check if we have friendships in both directions (mutual)
    const sentByCurrentUser = friendships.find(f => f.friender === userId.value && f.friend === profile.value!.id)
    const sentByOtherUser = friendships.find(f => f.friender === profile.value!.id && f.friend === userId.value)

    if (sentByCurrentUser && sentByOtherUser) {
      // Mutual friendship
      friendshipStatus.value = 'mutual'
      sentFriendshipId.value = sentByCurrentUser.id
      receivedFriendshipId.value = sentByOtherUser.id
    }
    else if (sentByCurrentUser) {
      // Current user sent a request
      friendshipStatus.value = 'sent_request'
      sentFriendshipId.value = sentByCurrentUser.id
      receivedFriendshipId.value = null
    }
    else if (sentByOtherUser) {
      // Current user received a request
      friendshipStatus.value = 'received_request'
      sentFriendshipId.value = null
      receivedFriendshipId.value = sentByOtherUser.id
    }
    else {
      // This shouldn't happen, but fallback to none
      friendshipStatus.value = 'none'
      sentFriendshipId.value = null
      receivedFriendshipId.value = null
    }
  }
  catch (error) {
    console.error('Error checking friendship status:', error)
    friendshipStatus.value = 'none'
  }
}

async function fetchAllFriendships() {
  if (!profile.value) {
    friendsLoading.value = false
    return
  }

  friendsLoading.value = true

  try {
    // Fetch all friendships for this profile
    const { data: friendships, error } = await supabase
      .from('friends')
      .select('id, friender, friend')
      .or(`friender.eq.${profile.value.id},friend.eq.${profile.value.id}`)

    if (error) {
      console.error('Error fetching friendships:', error)
      return
    }

    allFriendships.value = friendships || []
  }
  catch (error) {
    console.error('Error fetching friendships:', error)
  }
  finally {
    friendsLoading.value = false
  }
}

function openFriendsModal() {
  showFriendsModal.value = true
}

async function sendFriendRequest() {
  if (!user.value || !profile.value || isOwnProfile.value) {
    return
  }

  friendshipStatus.value = 'loading'

  try {
    const { error } = await supabase
      .from('friends')
      .insert({
        friender: userId.value,
        friend: profile.value.id,
      })

    if (error) {
      console.error('Error sending friend request:', error)
      friendshipStatus.value = 'none'
      return
    }

    // Check if the other user has already sent us a request (making it mutual)
    await checkFriendshipStatus()
  }
  catch (error) {
    console.error('Error sending friend request:', error)
    friendshipStatus.value = 'none'
  }
}

async function acceptFriendRequest() {
  if (!user.value || !profile.value || isOwnProfile.value) {
    return
  }

  friendshipStatus.value = 'loading'

  try {
    // Send a friend request back to make it mutual
    const { error } = await supabase
      .from('friends')
      .insert({
        friender: userId.value,
        friend: profile.value.id,
      })

    if (error) {
      console.error('Error accepting friend request:', error)
      await checkFriendshipStatus() // Refresh to current state
      return
    }

    // Now they should be mutual friends
    await checkFriendshipStatus()
  }
  catch (error) {
    console.error('Error accepting friend request:', error)
    await checkFriendshipStatus() // Refresh to current state
  }
}

async function revokeFriendRequest() {
  if (!user.value || !profile.value || !sentFriendshipId.value) {
    return
  }

  friendshipStatus.value = 'loading'

  try {
    const { error } = await supabase
      .from('friends')
      .delete()
      .eq('id', sentFriendshipId.value)

    if (error) {
      console.error('Error revoking friend request:', error)
      await checkFriendshipStatus() // Refresh to current state
      return
    }

    await checkFriendshipStatus()
  }
  catch (error) {
    console.error('Error revoking friend request:', error)
    await checkFriendshipStatus() // Refresh to current state
  }
}

async function removeFriend() {
  if (!user.value || !profile.value) {
    return
  }

  friendshipStatus.value = 'loading'

  try {
    // Remove both friendship records to break the mutual friendship
    const deletePromises = []

    if (sentFriendshipId.value) {
      deletePromises.push(
        supabase
          .from('friends')
          .delete()
          .eq('id', sentFriendshipId.value),
      )
    }

    if (receivedFriendshipId.value) {
      deletePromises.push(
        supabase
          .from('friends')
          .delete()
          .eq('id', receivedFriendshipId.value),
      )
    }

    const results = await Promise.all(deletePromises)

    // Check if any deletion failed
    const hasError = results.some(result => result.error)
    if (hasError) {
      console.error('Error removing friendship:', results.find(r => r.error)?.error)
      await checkFriendshipStatus() // Refresh to current state
      return
    }

    friendshipStatus.value = 'none'
    sentFriendshipId.value = null
    receivedFriendshipId.value = null
  }
  catch (error) {
    console.error('Error removing friendship:', error)
    await checkFriendshipStatus() // Refresh to current state
  }
}

async function ignoreFriendRequest() {
  if (!user.value || !profile.value || !receivedFriendshipId.value) {
    return
  }

  friendshipStatus.value = 'loading'

  try {
    // Delete the friend request that was sent to the current user
    const { error } = await supabase
      .from('friends')
      .delete()
      .eq('id', receivedFriendshipId.value)

    if (error) {
      console.error('Error ignoring friend request:', error)
      await checkFriendshipStatus() // Refresh to current state
      return
    }

    // Update status to none since the request was ignored/deleted
    friendshipStatus.value = 'none'
    receivedFriendshipId.value = null
  }
  catch (error) {
    console.error('Error ignoring friend request:', error)
    await checkFriendshipStatus() // Refresh to current state
  }
}
</script>

<template>
  <div class="profile-view">
    <!-- Loading State -->
    <template v-if="loading">
      <!-- Profile Header Skeleton -->
      <div class="profile-sections">
        <!-- About Section Skeleton -->
        <Card separators class="about-section card-bg">
          <template #header>
            <Flex column gap="l">
              <Flex gap="l" y-start expand>
                <!-- Avatar Skeleton -->
                <div class="profile-avatar">
                  <Skeleton width="160px" height="160px" style="border-radius: 50%;" />
                </div>

                <Flex column gap="m" expand>
                  <Flex gap="l" y-start x-between expand>
                    <Flex column gap="m" expand>
                      <!-- Username and badges -->
                      <Flex gap="m">
                        <Skeleton height="1.5rem" width="4rem" style="border-radius: 1rem;" />
                        <Skeleton height="1.5rem" width="8rem" style="border-radius: 1rem;" />
                      </Flex>
                      <Skeleton height="48px" width="20rem" />

                      <!-- Introduction -->
                      <Skeleton height="1.2rem" width="80%" />

                      <!-- Meta info -->
                      <Flex gap="l" wrap>
                        <Skeleton height="1rem" width="8rem" />
                        <Skeleton height="1rem" width="10rem" />
                      </Flex>
                    </Flex>

                    <!-- Action buttons -->
                    <Flex gap="s">
                      <Skeleton height="3.5rem" width="7rem" style="border-radius: 0.5rem;" />
                      <Skeleton height="3.5rem" width="6rem" style="border-radius: 0.5rem;" />
                    </Flex>
                  </Flex>
                </Flex>
              </Flex>
            </Flex>
          </template>

          <Flex column gap="m">
            <Skeleton height="1rem" width="100%" />
            <Skeleton height="1rem" width="85%" />
            <Skeleton height="1rem" width="70%" />
            <Skeleton height="1rem" width="90%" />
            <Skeleton height="1rem" width="60%" />
          </Flex>
        </Card>

        <Flex column gap="m">
          <!-- Friends Section Skeleton -->
          <Card separators class="friends-section-skeleton card-bg">
            <template #header>
              <Flex x-between y-center>
                <Flex gap="xs" y-center>
                  <Skeleton height="1.5rem" width="6rem" />
                  <Skeleton height="1.5rem" width="3rem" style="border-radius: 1rem;" />
                </Flex>
                <Skeleton height="2rem" width="6rem" style="border-radius: 0.5rem;" />
              </Flex>
            </template>

            <Flex gap="s" wrap y-center x-center class="friends-avatars-skeleton">
              <div
                v-for="index in 6"
                :key="`friends-skeleton-avatar-${index}`"
                class="friends-avatars-skeleton__avatar"
              >
                <Skeleton width="100%" height="100%" />
              </div>
            </Flex>
          </Card>

          <!-- Badges Section Skeleton -->
          <Card separators class="badges-section card-bg">
            <template #header>
              <Flex x-between y-center>
                <Skeleton height="1.5rem" width="8rem" />
                <Skeleton width="1.5rem" height="1.5rem" />
              </Flex>
            </template>

            <Flex gap="s" wrap>
              <Skeleton height="150px" width="150" style="border-radius: 1rem;" />
              <Skeleton height="150px" width="150" style="border-radius: 1rem;" />
            </Flex>
          </Card>
        </Flex>
      </div>
    </template>

    <!-- Error State -->
    <template v-else-if="errorMessage">
      <ErrorAlert :message="errorMessage" />
    </template>

    <!-- No Profile Found -->
    <template v-else-if="!profile">
      <ErrorAlert message="No profile found." />
    </template>

    <!-- Profile Content -->
    <template v-else>
      <!-- Ban Status Callout -->
      <ProfileBanStatus v-if="profile.banned" :profile="profile" />

      <!-- Profile Sections -->
      <div class="profile-sections">
        <!-- About Section (Left) -->
        <Flex column gap="m">
          <!-- Profile Header -->
          <ProfileHeader
            :profile="profile"
            :avatar-url="avatarUrl"
            :user-role="userRole"
            :current-user-role="currentUserRole"
            :is-own-profile="isOwnProfile"
            :friendship-status="friendshipStatus"
            :is-current-user-admin="isCurrentUserAdmin"
            @open-edit-sheet="openEditSheet"
            @send-friend-request="sendFriendRequest"
            @accept-friend-request="acceptFriendRequest"
            @revoke-friend-request="revokeFriendRequest"
            @remove-friend="removeFriend"
            @ignore-friend-request="ignoreFriendRequest"
            @open-complaint-modal="openComplaintModal"
          />
        </Flex>

        <!-- (Right) -->
        <Flex column gap="m">
          <!-- Friends Section -->
          <ProfileFriends
            :profile="profile"
            :friends="friends"
            :friendship-status="friendshipStatus"
            :pending-requests="pendingRequests"
            :is-own-profile="isOwnProfile"
            :loading="friendsLoading"
            @open-friends-modal="openFriendsModal"
            @send-friend-request="sendFriendRequest"
            @accept-friend-request="acceptFriendRequest"
            @ignore-friend-request="ignoreFriendRequest"
            @revoke-friend-request="revokeFriendRequest"
            @remove-friend="removeFriend"
          />

          <!-- Badges -->
          <ProfileBadges :profile="profile" :is-own-profile="isOwnProfile" />
        </Flex>
      </div>
    </template>

    <!-- Friends Modal -->
    <FriendsModal
      v-model:open="showFriendsModal"
      :friends="friends"
      :sent-requests="sentRequests"
      :pending-requests="pendingRequests"
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
  gap: var(--space-m);

  .about-section {
    min-height: 680px;
  }

  .badges-section,
  .friends-section-skeleton {
    min-height: 256px;
  }

  .friends-avatars-skeleton {
    justify-content: center;
  }

  .friends-avatars-skeleton__avatar {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    overflow: hidden;
  }

  @media (max-width: 768px) {
    grid-template-columns: 1fr;
  }
}
</style>
