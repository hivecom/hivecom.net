<script setup lang="ts">
import type { Tables } from '@/types/database.types'
import { Avatar, Badge, Button, Card, CopyClipboard, Flex, Tooltip } from '@dolanske/vui'
import { computed, ref } from 'vue'
import ConfirmModal from '@/components/Shared/ConfirmModal.vue'
import { getUserActivityStatus } from '@/lib/lastSeen'
import { getCountryInfo } from '@/lib/utils/country'

interface Props {
  profile: Tables<'profiles'>
  avatarUrl: string | null
  userRole: string | null
  currentUserRole: string | null
  isOwnProfile: boolean
  friendshipStatus: 'none' | 'mutual' | 'sent_request' | 'received_request' | 'loading'
  isCurrentUserAdmin: boolean
}

const props = defineProps<Props>()
const emit = defineEmits<{
  (event: 'openEditSheet'): void
  (event: 'sendFriendRequest'): void
  (event: 'acceptFriendRequest'): void
  (event: 'ignoreFriendRequest'): void
  (event: 'revokeFriendRequest'): void
  (event: 'removeFriend'): void
  (event: 'openComplaintModal'): void
}>()
const showRemoveFriendConfirm = ref(false)

const activityStatus = computed(() => {
  if (!props.profile?.last_seen)
    return null

  return getUserActivityStatus(props.profile.last_seen)
})

const countryInfo = computed(() => getCountryInfo(props.profile.country ?? null))
// Treat YYYY-MM-DD birthdays as date-only values so timezone offsets do not shift the day
function parseBirthdayDate(value: string | null): Date | null {
  if (!value)
    return null

  const dateOnlyMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (dateOnlyMatch) {
    const [, yearStr, monthStr, dayStr] = dateOnlyMatch
    const year = Number(yearStr)
    const month = Number(monthStr) - 1
    const day = Number(dayStr)

    const date = new Date(year, month, day)
    if (!Number.isNaN(date.getTime()))
      return date
  }

  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

const birthdayInfo = computed(() => {
  if (!props.profile?.birthday)
    return null

  const parsed = parseBirthdayDate(props.profile.birthday)
  if (!parsed)
    return null

  const today = new Date()
  const birthdayIsToday = today.getMonth() === parsed.getMonth() && today.getDate() === parsed.getDate()
  let age = today.getFullYear() - parsed.getFullYear()
  const hasHadBirthdayThisYear
    = today.getMonth() > parsed.getMonth()
      || (today.getMonth() === parsed.getMonth() && today.getDate() >= parsed.getDate())

  if (!hasHadBirthdayThisYear)
    age -= 1

  if (age < 0)
    age = 0

  return {
    formatted: parsed.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }),
    age,
    isToday: birthdayIsToday,
  }
})

const isBirthdayToday = computed(() => birthdayInfo.value?.isToday ?? false)

const birthdayTooltipText = computed(() => {
  if (!birthdayInfo.value)
    return ''

  if (birthdayInfo.value.isToday)
    return 'Happy birthday!'

  const ageText = `${birthdayInfo.value.age} year${birthdayInfo.value.age === 1 ? '' : 's'} old`
  if (birthdayInfo.value.age < 6) {
    return `${ageText} · Suspiciously young`
  }

  return ageText
})

const joinedTooltip = computed(() => {
  if (!props.profile?.created_at)
    return ''

  const created = new Date(props.profile.created_at)
  if (Number.isNaN(created.getTime()))
    return ''

  return created.toLocaleString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
})

// Computed properties for friendship status
const canSendFriendRequest = computed(() => {
  return !props.isOwnProfile && props.friendshipStatus === 'none'
})

const areMutualFriends = computed(() => {
  return props.friendshipStatus === 'mutual'
})

const hasSentRequest = computed(() => {
  return props.friendshipStatus === 'sent_request'
})

const hasReceivedRequest = computed(() => {
  return props.friendshipStatus === 'received_request'
})

// Generate profile URL for copying
const profileUrl = computed(() => {
  if (typeof window === 'undefined')
    return ''
  const identifier = props.profile.username || props.profile.id
  return `${window.location.origin}/profile/${identifier}`
})

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

// Handle remove friend confirmation
function handleRemoveFriend() {
  emit('removeFriend')
  showRemoveFriendConfirm.value = false
}
</script>

<template>
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
              <!-- Friend status badge -->
              <Badge
                v-if="!isOwnProfile && friendshipStatus === 'mutual'"
                variant="success"
                size="s"
              >
                <Icon name="ph:user-check" />
                Friends
              </Badge>
              <Badge
                v-else-if="!isOwnProfile && friendshipStatus === 'sent_request'"
                variant="info"
                size="s"
              >
                <Icon name="ph:clock" />
                Request Sent
              </Badge>
              <Badge
                v-else-if="!isOwnProfile && friendshipStatus === 'received_request'"
                variant="accent"
                size="s"
              >
                <Icon name="ph:bell" />
                Friend Request
              </Badge>
              <!-- Supporter Badges -->
              <Flex gap="xs" y-center>
                <Badge v-if="profile.supporter_patreon || profile.supporter_lifetime" variant="warning" size="s">
                  <Icon name="ph:heart" class="gold" />
                  Supporter
                </Badge>
              </Flex>
            </Flex>

            <!-- Action Buttons -->
            <Flex v-if="isOwnProfile" gap="s">
              <Button variant="accent" @click="emit('openEditSheet')">
                <template #start>
                  <Icon name="ph:pencil" />
                </template>
                Edit Profile
              </Button>
              <CopyClipboard :text="profileUrl" variant="gray" confirm>
                <Button variant="gray">
                  <template #start>
                    <Icon name="ph:link" />
                  </template>
                  Copy Link
                </Button>
              </CopyClipboard>
            </Flex>

            <!-- Action Buttons (for other profiles) -->
            <Flex v-else gap="s">
              <!-- Friend action button -->
              <Button
                v-if="canSendFriendRequest"
                variant="accent"
                :disabled="friendshipStatus === 'loading'"
                @click="emit('sendFriendRequest')"
              >
                <template #start>
                  <Icon name="ph:user-plus" />
                </template>
                Send Friend Request
              </Button>

              <Button
                v-else-if="hasReceivedRequest"
                variant="accent"
                :disabled="friendshipStatus === 'loading'"
                @click="emit('acceptFriendRequest')"
              >
                <template #start>
                  <Icon name="ph:user-check" />
                </template>
                Accept Request
              </Button>

              <Button
                v-if="hasReceivedRequest"
                variant="gray"
                :disabled="friendshipStatus === 'loading'"
                @click="emit('ignoreFriendRequest')"
              >
                <template #start>
                  <Icon name="ph:x" />
                </template>
                Ignore Request
              </Button>

              <Button
                v-else-if="hasSentRequest"
                variant="danger"
                :disabled="friendshipStatus === 'loading'"
                @click="emit('revokeFriendRequest')"
              >
                <template #start>
                  <Icon name="ph:user-minus" />
                </template>
                Revoke Request
              </Button>

              <Button
                v-else-if="areMutualFriends"
                variant="danger"
                :disabled="friendshipStatus === 'loading'"
                @click="showRemoveFriendConfirm = true"
              >
                <template #start>
                  <Icon name="ph:user-minus" />
                </template>
                Remove Friend
              </Button>

              <!-- Show loading button while checking friendship status -->
              <Button
                v-else-if="friendshipStatus === 'loading'"
                :disabled="true"
                variant="gray"
                :loading="true"
              />

              <CopyClipboard :text="profileUrl" variant="gray" confirm>
                <Button variant="gray">
                  <template #start>
                    <Icon name="ph:link" />
                  </template>
                  Copy Link
                </Button>
              </CopyClipboard>
              <Button variant="gray" @click="emit('openComplaintModal')">
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
            <Flex gap="m" y-center wrap>
              <Flex v-if="countryInfo" gap="xs" y-center class="profile-country">
                <span
                  class="country-emoji"
                  role="img"
                  :aria-label="countryInfo.name"
                >
                  {{ countryInfo.emoji }}
                </span>
                <span class="text-color-lighter text-s">
                  {{ countryInfo.name }}
                </span>
              </Flex>

              <Tooltip v-if="birthdayInfo">
                <template #tooltip>
                  <span>{{ birthdayTooltipText }}</span>
                </template>
                <Flex gap="xs" y-center>
                  <Icon
                    class="text-color-lighter"
                    :class="{ 'shiny-icon': isBirthdayToday }"
                    name="ph:cake"
                    size="16"
                  />
                  <span
                    class="text-s text-color-lighter"
                    :class="{ 'shiny-text': isBirthdayToday }"
                  >
                    {{ birthdayInfo.formatted }}
                  </span>
                </Flex>
              </Tooltip>

              <Flex v-if="(profile as any).website" gap="xs" y-center>
                <Icon class="text-color-lighter" name="ph:link" size="16" />
                <a
                  :href="(profile as any).website"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="website-link text-s"
                >
                  {{ (profile as any).website }}
                </a>
              </Flex>

              <Tooltip v-if="profile.created_at">
                <template #tooltip>
                  <span>Joined {{ joinedTooltip || profile.created_at }}</span>
                </template>
                <Flex gap="xs" y-center>
                  <Icon class="text-color-lighter" name="ph:calendar" size="16" />
                  <span class="text-s text-color-lighter">
                    Joined {{ getAccountAge(profile.created_at) }}
                  </span>
                </Flex>
              </Tooltip>
            </Flex>

            <!-- Admin-only UUID display -->
            <Flex v-if="isCurrentUserAdmin" gap="xs" y-center>
              <Icon class="text-color-lighter" name="ph:hash" size="16" />
              <span class="text-xs text-color-lighter font-mono">{{ profile.id }}</span>
              <CopyClipboard :text="profile.id" size="s" confirm>
                <Icon class="text-color-lighter" name="ph:copy" size="12" />
              </CopyClipboard>
            </Flex>
          </Flex>
        </Flex>
      </Flex>
    </Flex>
  </Card>

  <!-- Remove Friend Confirmation Modal -->
  <ConfirmModal
    v-model:open="showRemoveFriendConfirm"
    v-model:confirm="handleRemoveFriend"
    title="Remove Friend"
    :description="`Are you sure you want to remove ${profile.username} from your friends list? This action cannot be undone.`"
    confirm-text="Remove Friend"
    cancel-text="Cancel"
    :destructive="true"
  />
</template>

<style lang="scss" scoped>
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

  .profile-description {
    margin: 0;
    color: var(--color-text-light);
    line-height: 1.5;
  }

  .profile-meta {
    color: var(--color-text-light);
    font-size: var(--font-size-s);

    .website-link {
      color: var(--color-text-accent);
      text-decoration: none;
      max-width: 200px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      display: inline-block;

      &:hover {
        text-decoration: underline;
      }
    }

    .profile-country {
      .country-emoji {
        font-size: var(--font-size-m);
        line-height: 1;
      }
    }
  }
}
</style>
