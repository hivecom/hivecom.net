<script setup lang="ts">
import type { Tables } from '~/types/database.types'
import { Avatar, Badge, Button, Card, Flex, Skeleton, Tooltip } from '@dolanske/vui'
import ProfileForm from '~/components/Profile/ProfileForm.vue'
import ErrorAlert from '~/components/Shared/ErrorAlert.vue'
import TimestampDate from '~/components/Shared/TimestampDate.vue'
import MDRenderer from '../Shared/MDRenderer.vue'

interface Props {
  userId: string
  isOwnProfile?: boolean
}

const props = defineProps<Props>()

const supabase = useSupabaseClient()
const profile = ref<Tables<'profiles'>>()
const userRole = ref<string | null>(null)
const loading = ref(true)
const errorMessage = ref('')
const isEditSheetOpen = ref(false)

// Copy profile URL to clipboard
async function copyProfileURL() {
  if (!profile.value)
    return

  const url = `${window.location.origin}/profile/${profile.value.id}`

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
    .toUpperCase()
    .slice(0, 2)
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

  if (!props.userId) {
    errorMessage.value = 'No user ID provided'
    loading.value = false
    return
  }

  const requestProfile = await supabase
    .from('profiles')
    .select('*')
    .eq('id', props.userId)
    .single()

  if (requestProfile.error) {
    errorMessage.value = requestProfile.error.message
    loading.value = false
    return
  }

  profile.value = requestProfile.data

  // Fetch user role if available
  if (profile.value) {
    const { data: roleData } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', profile.value.id)
      .single()

    userRole.value = roleData?.role || null
  }

  loading.value = false
}

onMounted(() => {
  fetchProfile()
})

// Profile editing functions
function openEditSheet() {
  isEditSheetOpen.value = true
}

function closeEditSheet() {
  isEditSheetOpen.value = false
}

async function handleProfileSave(updatedProfile: Partial<Tables<'profiles'>>) {
  if (!profile.value)
    return

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
    closeEditSheet()

    // In a real app, you'd show a success toast notification here
  }
  catch (error) {
    console.error('Error updating profile:', error)
    // In a real app, you'd show an error toast notification here
  }
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
      <!-- Profile Header -->
      <Card class="profile-header">
        <Flex column expand y-center x-center>
          <Flex gap="l" y-start expand x-center>
            <!-- Avatar -->
            <div class="profile-avatar">
              <div class="avatar-container">
                <Avatar :size="80">
                  {{ getUserInitials(profile.username) }}
                </Avatar>
                <!-- Online status indicator (mock for now) -->
                <div class="online-indicator" />
              </div>
            </div>

            <Flex column gap="m" expand>
              <!-- Name, Title, Subtitle, and Badges -->
              <Flex gap="l" y-start x-between expand>
                <Flex column :gap="4" expand y-between>
                  <!-- Username and Role -->
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

                  <!-- Introduction -->
                  <p v-if="profile.introduction" class="profile-description">
                    {{ profile.introduction }}
                  </p>

                  <!-- Account Info -->
                  <Flex gap="l" class="profile-meta" expand>
                    <Flex gap="xs" y-center>
                      <Icon name="ph:calendar" size="16" />
                      <span class="text-s">Joined {{ getAccountAge(profile.created_at) }}</span>
                    </Flex>

                    <Flex v-if="profile.modified_at && profile.modified_at !== profile.created_at" gap="xs" y-center>
                      <Icon name="ph:pencil" size="16" />
                      <span class="timestamp">Last updated <TimestampDate size="s" class="timestamp" :date="profile.modified_at" relative /></span>
                    </Flex>
                  </Flex>
                </Flex>

                <!-- Action Buttons (for own profile) -->
                <Flex v-if="isOwnProfile" gap="s" expand x-end>
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
                </Flex>
              </Flex>
            </Flex>
          </Flex>
        </Flex>
      </Card>

      <!-- Profile Sections -->
      <div class="profile-sections">
        <!-- About Section (Left) -->
        <Card v-if="profile.markdown || isOwnProfile" separators class="about-section">
          <template #header>
            <Flex x-between y-center>
              <Flex>
                <h3>About</h3>
                <Button size="s" variant="gray" @click="openEditSheet">
                  Add Content
                </Button>
              </Flex>
              <Icon name="ph:user-circle" />
            </Flex>
          </template>

          <div v-if="profile.markdown" class="profile-markdown">
            <MDRenderer skeleton-height="504px" :md="profile.markdown" />
          </div>
          <div v-else-if="isOwnProfile" class="empty-state">
            <p class="empty-state-text text-s">
              Add content to your profile to tell others about yourself!
            </p>
          </div>
          <p v-else class="empty-content-text text-s">
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
              <p class="achievements-empty-text text-s">
                Achievements will appear here as you participate in the community!
              </p>
            </Flex>
          </Flex>
        </Card>
      </div>
    </template>
  </div>

  <!-- Profile Edit Form Sheet -->
  <ProfileForm
    :profile="profile || null"
    :is-open="isEditSheetOpen"
    @save="handleProfileSave"
    @close="closeEditSheet"
    @update:is-open="isEditSheetOpen = $event"
  />
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
        background-color: var(--color-text-green);
        border: 3px solid var(--color-bg);
        border-radius: 50%;
        box-shadow: 0 0 0 1px var(--color-border);
      }
    }
  }

  .profile-title {
    margin: 0;
    font-size: var(--font-size-xxl);
    font-weight: 700;
    color: var(--color-text);
  }

  .profile-subtitle {
    margin: 0;
    font-size: var(--font-size-l);
    font-weight: 600;
    color: var(--color-text-light);
  }

  .profile-description {
    margin: 0;
    color: var(--color-text-lighter);
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

  :deep(p) {
    margin: 0 0 var(--space-m) 0;

    &:last-child {
      margin-bottom: 0;
    }
  }

  :deep(h1, h2, h3, h4, h5, h6) {
    margin: var(--space-l) 0 var(--space-s) 0;

    &:first-child {
      margin-top: 0;
    }
  }

  :deep(ul, ol) {
    margin: var(--space-s) 0;
    padding-left: var(--space-l);
  }

  :deep(code) {
    background: var(--color-bg-raised);
    padding: var(--space-xs) var(--space-s);
    border-radius: var(--border-radius-s);
    font-family: var(--font-family-mono);
    font-size: 0.9em;
  }

  :deep(pre) {
    background: var(--color-bg-raised);
    padding: var(--space-m);
    border-radius: var(--border-radius-m);
    overflow-x: auto;

    code {
      background: none;
      padding: 0;
    }
  }
}

.empty-state {
  text-align: center;
  padding: var(--space-l);

  p {
    margin-bottom: var(--space-m);
  }
}

.empty-state-text {
  color: var(--color-text-lighter);
}

.empty-content-text {
  color: var(--color-text-lighter);
}

.achievements-empty-text {
  color: var(--color-text-lighter);
}

.timestamp {
  color: var(--color-text-light);
  font-size: var(--font-size-s) !important;
}
</style>
