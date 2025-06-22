<script setup lang="ts">
import type { Tables } from '@/types/database.types'
import { Avatar, Badge, Button, Card, CopyClipboard, Flex, Skeleton, Tooltip } from '@dolanske/vui'
import ProfileForm from '@/components/Profile/ProfileForm.vue'
import ComplaintsManager from '@/components/Shared/ComplaintsManager.vue'
import ErrorAlert from '@/components/Shared/ErrorAlert.vue'
import TimestampDate from '@/components/Shared/TimestampDate.vue'
import { formatDuration } from '~/utils/duration'
import { getUserActivityStatus } from '~/utils/lastSeen'
import { getUserAvatarUrl } from '~/utils/storage'
import MDRenderer from '../Shared/MDRenderer.vue'

interface Props {
  userId?: string
  username?: string
}

const props = defineProps<Props>()

const supabase = useSupabaseClient()
const user = useSupabaseUser()
const profile = ref<Tables<'profiles'>>()
const avatarUrl = ref<string | null>(null)
const userRole = ref<string | null>(null)
const currentUserRole = ref<string | null>(null)
const loading = ref(true)
const errorMessage = ref('')
const isEditSheetOpen = ref(false)
const showComplaintModal = ref(false)
const profileSubmissionError = ref<string | null>(null)

// Add refresh functionality for avatar updates
const refreshTrigger = ref(0)

// Computed property to check if this is the user's own profile
const isOwnProfile = computed(() => {
  if (!user.value || !profile.value)
    return false
  return user.value.id === profile.value.id
})

// Computed property to check if the current user is an admin
const isCurrentUserAdmin = computed(() => {
  return currentUserRole.value === 'admin'
})

// Computed property for user activity status
const activityStatus = computed(() => {
  if (!profile.value?.last_seen)
    return null
  return getUserActivityStatus(profile.value.last_seen)
})

// Copy profile URL to clipboard
async function copyProfileURL() {
  if (!profile.value)
    return

  // Use username if available, otherwise fall back to UUID
  const identifier = profile.value.username || profile.value.id
  const url = `${window.location.origin}/profile/${identifier}`

  try {
    await navigator.clipboard.writeText(url)
    // In a real app, you'd show a toast notification here
  }
  catch (err) {
    console.error('Failed to copy URL:', err)
  }
}

// Get user initials for avatar
function getUserInitials(username: string): string {
  return username
    .split(' ')
    .map(word => word.charAt(0))
    .join('')
    .substring(0, 2)
    .toUpperCase()
}

// Format time since account creation
function getAccountAge(createdAt: string): string {
  const created = new Date(createdAt)
  const now = new Date()
  const diffTime = Math.abs(now.getTime() - created.getTime())
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

  if (diffDays < 30) {
    return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`
  }
  else if (diffDays < 365) {
    const months = Math.floor(diffDays / 30)
    return `${months} month${months === 1 ? '' : 's'} ago`
  }
  else {
    const years = Math.floor(diffDays / 365)
    return `${years} year${years === 1 ? '' : 's'} ago`
  }
}

async function fetchProfile() {
  loading.value = true
  errorMessage.value = ''

  if (!props.userId && !props.username) {
    errorMessage.value = 'No user ID or username provided'
    loading.value = false
    return
  }

  let requestProfile

  if (props.userId) {
    // Query by UUID
    requestProfile = await supabase
      .from('profiles')
      .select('*')
      .eq('id', props.userId)
      .single()
  }
  else if (props.username) {
    // Query by username (case-insensitive)
    requestProfile = await supabase
      .from('profiles')
      .select('*')
      .ilike('username', props.username)
      .single()
  }

  if (requestProfile?.error) {
    // Handle specific error messages more user-friendly
    if (requestProfile.error.message.includes('JSON object requested, multiple (or no) rows returned')) {
      errorMessage.value = props.username
        ? `User "${props.username}" was not found`
        : 'User not found'
    }
    else {
      errorMessage.value = requestProfile.error.message
    }
    loading.value = false
    return
  }

  profile.value = requestProfile?.data

  // Fetch user avatar and role if available
  if (profile.value) {
    // Fetch avatar URL
    avatarUrl.value = await getUserAvatarUrl(supabase, profile.value.id)

    const { data: roleData } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', profile.value.id)
      .single()

    userRole.value = roleData?.role || null
  }

  // Fetch current user's role for admin privileges
  if (user.value) {
    const { data: currentRoleData } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.value.id)
      .single()

    currentUserRole.value = currentRoleData?.role || null
  }

  loading.value = false
}

onMounted(() => {
  fetchProfile()

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
    profile.value = data

    // Refresh avatar in case it was updated
    await refreshAvatar()

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

// Get role display and styling
function getRoleInfo(role: string | null) {
  if (!role)
    return null

  const roleDisplay = role.charAt(0).toUpperCase() + role.slice(1)
  let variant: 'info' | 'success' | 'danger'

  switch (role) {
    case 'admin':
      variant = 'danger'
      break
    case 'moderator':
      variant = 'info'
      break
    default:
      variant = 'success'
  }

  return { display: roleDisplay, variant }
}

// Check if user has any achievements
const hasAchievements = computed(() => {
  if (!profile.value)
    return false

  return profile.value.supporter_lifetime
    || profile.value.supporter_patreon
    || getAccountAge(profile.value.created_at).includes('year')
})

// Function to check if ban is active
function isBanActive() {
  if (!profile.value || !profile.value.banned)
    return false

  // If no end date, it's a permanent ban
  if (!profile.value.ban_end)
    return true

  // Check if ban end date is in the future
  const banEndDate = new Date(profile.value.ban_end)
  const now = new Date()
  return banEndDate > now
}

// Function to format ban duration
function getBanDuration() {
  if (!profile.value?.ban_start)
    return ''

  const banStart = new Date(profile.value.ban_start)

  if (!profile.value.ban_end) {
    return `Permanently banned since ${banStart.toLocaleDateString()}`
  }

  const banEnd = new Date(profile.value.ban_end)
  const now = new Date()

  // Calculate the duration between start and end
  const durationMs = banEnd.getTime() - banStart.getTime()
  const durationText = formatDuration(durationMs)

  if (banEnd <= now) {
    return `Was banned for ${durationText}`
  }

  return `Banned for ${durationText}`
}

// Function to get ban end date for TimestampDate component
function getBanEndDate() {
  return profile.value?.ban_end || null
}

// Function to refresh avatar URL
async function refreshAvatar() {
  if (profile.value?.id) {
    // Force refresh by bypassing cache
    avatarUrl.value = await getUserAvatarUrl(supabase, profile.value.id)
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

// Watch for profile changes to update avatar if needed
watch(() => profile.value?.id, async (newId, oldId) => {
  if (newId && newId !== oldId) {
    await refreshAvatar()
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
</script>

<template>
  <div class="profile-view">
    <!-- Loading State -->
    <template v-if="loading">
      <!-- Profile Header Skeleton -->
      <Card>
        <Flex column gap="l">
          <Flex gap="l" y-start>
            <!-- Avatar Skeleton -->
            <div class="profile-avatar">
              <Skeleton width="80px" height="80px" style="border-radius: 50%;" />
            </div>

            <Flex column gap="m" expand>
              <Flex gap="l" y-start x-between expand>
                <Flex column gap="s" expand>
                  <!-- Username and badges -->
                  <Flex gap="m" y-center wrap>
                    <Skeleton height="2.5rem" width="12rem" />
                    <Skeleton height="1.5rem" width="4rem" style="border-radius: 1rem;" />
                    <Skeleton height="1.5rem" width="8rem" style="border-radius: 1rem;" />
                  </Flex>

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
                  <Skeleton height="2.5rem" width="7rem" style="border-radius: 0.5rem;" />
                  <Skeleton height="2.5rem" width="6rem" style="border-radius: 0.5rem;" />
                </Flex>
              </Flex>
            </Flex>
          </Flex>
        </Flex>
      </Card>

      <!-- Profile Sections Skeleton -->
      <div class="profile-sections">
        <!-- About Section Skeleton -->
        <Card separators class="about-section">
          <template #header>
            <Flex x-between y-center>
              <Flex gap="m" y-center>
                <Skeleton height="1.5rem" width="4rem" />
                <Skeleton height="1.8rem" width="6rem" style="border-radius: 0.5rem;" />
              </Flex>
              <Skeleton width="1.5rem" height="1.5rem" />
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

        <!-- Achievements Section Skeleton -->
        <Card separators class="achievements-section">
          <template #header>
            <Flex x-between y-center>
              <Skeleton height="1.5rem" width="8rem" />
              <Skeleton width="1.5rem" height="1.5rem" />
            </Flex>
          </template>

          <Flex gap="s" wrap>
            <Skeleton height="2rem" width="10rem" style="border-radius: 1rem;" />
            <Skeleton height="2rem" width="8rem" style="border-radius: 1rem;" />
            <Skeleton height="2rem" width="12rem" style="border-radius: 1rem;" />
          </Flex>
        </Card>
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
      <Card v-if="profile.banned" class="ban-status-card" :class="{ 'ban-expired': !isBanActive() }">
        <Flex gap="m" y-center>
          <Icon
            :name="isBanActive() ? 'ph:warning-circle-fill' : 'ph:clock-fill'"
            size="24"
            class="ban-icon"
          />
          <Flex column gap="xs" expand>
            <h3 class="ban-title">
              {{ isBanActive() ? 'This user has been banned' : 'This user was previously banned' }}
            </h3>
            <p v-if="profile.ban_reason" class="ban-reason">
              <strong>Reason:</strong> {{ profile.ban_reason }}
            </p>
            <p class="text-s color-text-light">
              {{ getBanDuration() }}
              <span v-if="getBanEndDate() && isBanActive()" class="text-xs color-text-lighter">
                - expires <TimestampDate :date="getBanEndDate()!" size="xs" relative />
              </span>
              <span v-else-if="getBanEndDate() && !isBanActive()" class="text-xs color-text-lighter">
                - expired <TimestampDate :date="getBanEndDate()!" size="xs" relative />
              </span>
            </p>
          </Flex>
        </Flex>
      </Card>

      <!-- Profile Header -->
      <Card class="profile-header">
        <Flex column expand y-center x-center>
          <Flex gap="l" y-start expand x-center>
            <!-- Avatar -->
            <div class="profile-avatar">
              <div class="avatar-container">
                <Avatar :size="80" :url="avatarUrl || undefined">
                  <template v-if="!avatarUrl" #default>
                    {{ getUserInitials(profile.username) }}
                  </template>
                </Avatar>
                <!-- Activity status indicator -->
                <Tooltip v-if="activityStatus">
                  <template #tooltip>
                    <p>{{ activityStatus.lastSeenText }}</p>
                  </template>
                  <div
                    class="online-indicator"
                    :class="{ active: activityStatus.isActive }"
                  />
                </Tooltip>
              </div>
            </div>

            <Flex column :gap="4" expand>
              <!-- Username, Role, Badges and Action Buttons Row -->
              <Flex gap="m" y-center x-between expand>
                <Flex gap="m" y-center wrap>
                  <h1 class="profile-title">
                    {{ profile.username }}
                  </h1>
                  <Badge
                    v-if="userRole && getRoleInfo(userRole)"
                    :variant="getRoleInfo(userRole)?.variant"
                    size="s"
                  >
                    {{ getRoleInfo(userRole)?.display }}
                  </Badge>
                  <!-- Supporter Badges -->
                  <Flex gap="xs" y-center>
                    <Badge v-if="profile.supporter_patreon" variant="accent" size="s">
                      <Icon name="ph:heart-fill" />
                      Patreon Supporter
                    </Badge>

                    <Badge v-if="profile.supporter_lifetime" variant="success" size="s">
                      <Icon name="ph:crown-simple" />
                      Lifetime Supporter
                    </Badge>
                  </Flex>
                </Flex>

                <!-- Action Buttons -->
                <Flex v-if="isOwnProfile" gap="s">
                  <Button variant="accent" @click="openEditSheet">
                    <template #start>
                      <Icon name="ph:pencil" />
                    </template>
                    Edit Profile
                  </Button>
                  <Button variant="gray" @click="copyProfileURL">
                    <template #start>
                      <Icon name="ph:link" />
                    </template>
                    Copy Link
                  </Button>
                </Flex>

                <!-- Action Buttons (for other profiles) -->
                <Flex v-else gap="s">
                  <Button variant="gray" @click="copyProfileURL">
                    <template #start>
                      <Icon name="ph:link" />
                    </template>
                    Copy Link
                  </Button>
                  <Button variant="gray" @click="openComplaintModal">
                    <template #start>
                      <Icon name="ph:chat-circle-text" />
                    </template>
                    Complaint
                  </Button>
                </Flex>
              </Flex>

              <!-- Introduction (Full Width) -->
              <p v-if="profile.introduction" class="profile-description">
                {{ profile.introduction }}
              </p>

              <!-- Account Info (Full Width) -->
              <Flex x-between y-center class="profile-meta" expand>
                <Flex gap="l">
                  <Flex gap="xs" y-center>
                    <Icon class="color-text-lighter" name="ph:calendar" size="16" />
                    <span class="text-s color-text-lighter">Joined {{ getAccountAge(profile.created_at) }}</span>
                  </Flex>

                  <Flex v-if="profile.modified_at && profile.modified_at !== profile.created_at" gap="xs" y-center>
                    <Icon class="color-text-lighter" name="ph:pencil" size="16" />
                    <span class="color-text-lighter text-s">Last updated <TimestampDate size="s" class="color-text-light text-s" :date="profile.modified_at" relative /></span>
                  </Flex>
                </Flex>

                <!-- Admin-only UUID display -->
                <Flex v-if="isCurrentUserAdmin" gap="xs" y-center>
                  <Icon class="color-text-lighter" name="ph:hash" size="16" />
                  <span class="text-xs color-text-lighter font-mono">{{ profile.id }}</span>
                  <CopyClipboard :text="profile.id" size="s" confirm>
                    <Icon class="color-text-lighter" name="ph:copy" size="12" />
                  </CopyClipboard>
                </Flex>
              </Flex>
            </Flex>
          </Flex>
        </Flex>
      </Card>

      <!-- Profile Sections -->
      <div class="profile-sections">
        <!-- About Section (Left) -->
        <Card separators class="about-section">
          <template #header>
            <Flex x-between y-center>
              <Flex>
                <h3>About</h3>
                <Button v-if="isOwnProfile" size="s" variant="gray" @click="openEditSheet">
                  Edit Content
                </Button>
              </Flex>
              <Icon name="ph:user-circle" />
            </Flex>
          </template>

          <div v-if="profile.markdown" class="profile-markdown">
            <MDRenderer skeleton-height="504px" :md="profile.markdown" />
          </div>
          <div v-else-if="isOwnProfile" class="empty-state">
            <p class="color-text-lighter text-s">
              Add content to your profile to tell others about yourself!
            </p>
          </div>
          <p v-else class="color-text-lighter text-s">
            This user hasn't added any content yet. Surely they will soon!
          </p>
        </Card>

        <!-- Achievements (Right) -->
        <Card separators class="achievements-section">
          <template #header>
            <Flex x-between y-center>
              <h3>Achievements</h3>
              <Icon name="ph:trophy" />
            </Flex>
          </template>

          <Flex gap="s" wrap extend x-center>
            <Tooltip v-if="profile.supporter_lifetime">
              <template #tooltip>
                <p>Contributed in a significant way to the community!</p>
              </template>
              <Badge variant="success" size="m">
                <Icon name="ph:crown-simple" />
                Lifetime Supporter
              </Badge>
            </Tooltip>

            <Tooltip v-if="profile.supporter_patreon">
              <template #tooltip>
                <p>Thank you for being an active supporter!</p>
              </template>
              <Badge variant="accent" size="m">
                <Icon name="ph:heart-fill" />
                Community Supporter
              </Badge>
            </Tooltip>

            <Tooltip v-if="getAccountAge(profile.created_at).includes('year')">
              <template #tooltip>
                <p>Been part of the community for over a year!</p>
              </template>
              <Badge variant="info" size="m">
                <Icon name="ph:cake" />
                Veteran Member
              </Badge>
            </Tooltip>

            <!-- Show a placeholder if no achievements -->
            <Flex v-if="!hasAchievements" column y-center x-center class="achievements-empty">
              <p class="color-text-lighter text-s">
                Achievements will appear here as you participate in the community!
              </p>
            </Flex>
          </Flex>
        </Card>
      </div>
    </template>

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

.profile-header {
  .profile-avatar {
    flex-shrink: 0;

    .avatar-container {
      position: relative;
      display: inline-block;

      .online-indicator {
        position: absolute;
        bottom: 4px;
        right: 4px;
        width: 16px;
        height: 16px;
        background-color: var(--color-text-lighter);
        border: 3px solid var(--color-bg);
        border-radius: 50%;
        box-shadow: 0 0 0 1px var(--color-border);
        transition: background-color 0.2s ease;

        &.active {
          background-color: var(--color-text-green);
        }
      }
    }
  }

  .profile-title {
    margin: 0;
    font-size: var(--font-size-xxl);
    font-weight: var(--font-weight-bold);
    color: var(--color-text);
  }

  .profile-subtitle {
    margin: 0;
    font-size: var(--font-size-l);
    font-weight: var(--font-weight-semibold);
    color: var(--color-text-light);
  }

  .profile-description {
    margin: 0;
    color: var(--color-text-light);
    line-height: 1.5;
  }

  .profile-meta {
    color: var(--color-text-light);
    font-size: var(--font-size-s);
  }
}

.profile-sections {
  display: grid;
  grid-template-columns: 2fr 1fr;
  gap: var(--space-l);

  .about-section,
  .achievements-section {
    min-height: 600px;
  }

  @media (max-width: 768px) {
    grid-template-columns: 1fr;
  }
}

.achievements-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-l);
  text-align: center;

  p {
    margin: 0;
    display: flex;
    align-items: center;
    gap: var(--space-xs);
  }
}

.profile-markdown {
  line-height: 1.6;
}

.empty-state {
  text-align: center;
  padding: var(--space-l);

  p {
    margin-bottom: var(--space-m);
  }
}

.ban-status-callout {
  margin-bottom: var(--space-l);

  .ban-card {
    padding: var(--space-m);
    display: flex;
    align-items: center;
    gap: var(--space-s);
  }
}

.ban-status-card {
  border: 2px solid var(--color-text-red);
  background: var(--color-bg-danger);

  &.ban-expired {
    border: 2px solid var(--color-text-orange);
    background: var(--color-bg-warning);

    .ban-icon {
      color: var(--color-text-orange);
    }

    .ban-title {
      color: var(--color-text-orange);
    }

    .ban-reason strong {
      color: var(--color-text-orange);
    }
  }

  .ban-icon {
    color: var(--color-text-red);
    flex-shrink: 0;
  }

  .ban-title {
    margin: 0;
    font-size: var(--font-size-l);
    font-weight: var(--font-weight-bold);
    color: var(--color-text-red);
  }

  .ban-reason {
    margin: 0;
    color: var(--color-text);
    font-size: var(--font-size-s);

    strong {
      color: var(--color-text-red);
    }
  }
}
</style>
