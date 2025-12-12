<script setup lang="ts">
import type { Tables } from '@/types/database.types'
import type { ProfileFriendshipStatus } from '@/types/profile.ts'
import { Avatar, Badge, Button, Card, CopyClipboard, Flex, Grid, Tooltip } from '@dolanske/vui'
import { computed } from 'vue'
import { getUserActivityStatus } from '@/lib/lastSeen'
import { getCountryInfo } from '@/lib/utils/country'
import MDRenderer from '../Shared/MDRenderer.vue'

interface Props {
  profile: Tables<'profiles'>
  avatarUrl: string | null
  userRole: string | null
  currentUserRole: string | null
  isOwnProfile: boolean
  friendshipStatus: ProfileFriendshipStatus
  isCurrentUserAdmin: boolean
}

const props = defineProps<Props>()
const emit = defineEmits<{
  openEditSheet: []
  openComplaintModal: []
}>()

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
</script>

<template>
  <Card class="profile-header card-bg" footer-separator>
    <Flex column expand y-center x-center>
      <Grid gap="xl" expand columns="160px 1fr">
        <!-- Avatar -->
        <div class="profile-avatar">
          <div class="avatar-container">
            <Avatar :size="160" :url="avatarUrl || undefined">
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

        <Flex column gap="s" expand x-end class="h-100">
          <!-- Username, Role, Badges and Action Buttons Row -->
          <Flex gap="xs" y-center wrap>
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
            <Badge v-if="profile.supporter_patreon || profile.supporter_lifetime" variant="warning" size="s">
              <Icon name="ph:heart" class="gold" />
              Supporter
            </Badge>
          </Flex>

          <h1 class="profile-title">
            {{ profile.username }}
          </h1>

          <!-- Action Buttons -->
          <Flex gap="xs" class="profile-action-buttons">
            <Button v-if="isOwnProfile" variant="accent" square data-title-top="Edit profile" @click="emit('openEditSheet')">
              <Icon name="ph:pencil" />
            </Button>
            <Button v-else variant="gray" @click="emit('openComplaintModal')">
              <template #start>
                <Icon name="ph:chat-circle-text" />
              </template>
              Complaint
            </Button>
            <CopyClipboard :text="profileUrl" variant="gray" confirm>
              <Button variant="gray" square data-title-top="Copy link to profile">
                <Icon name="ph:link" />
              </Button>
            </CopyClipboard>
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
          </Flex>
        </Flex>
      </Grid>
    </Flex>

    <template v-if="profile.markdown || isOwnProfile" #footer>
      <div v-if="profile.markdown" class="profile-markdown">
        <MDRenderer
          skeleton-height="504px"
          :md="profile.markdown"
        />
      </div>
      <div v-else-if="isOwnProfile" class="empty-state">
        <p class="text-color-lighter text-s">
          Add content to your profile to tell others about yourself!
        </p>
      </div>
    </template>
  </Card>

  <!-- Admin-only UUID display -->
  <CopyClipboard :text="profile.id" size="s" confirm>
    <Button v-if="isCurrentUserAdmin" size="s" plain data-title-top="Copy user id">
      <template #start>
        <Icon class="text-color-lighter" name="ph:hash" size="16" />
      </template>
      <span class="text-s text-color-lighter font-mono">{{ profile.id }}</span>
    </Button>
  </CopyClipboard>
</template>

<style lang="scss" scoped>
.profile-action-buttons {
  position: absolute;
  top: 16px;
  right: 16px;
}

.profile-markdown {
  line-height: 1.6;
  min-height: 512px;
}

.empty-state {
  text-align: center;
  padding: var(--space-l);

  p {
    margin-bottom: var(--space-m);
  }
}

.profile-header {
  .vui-badge {
    padding-inline: 8px;
    padding-block: 4px;
  }

  &:is(&.vui-card) {
    :deep(.vui-card-content),
    :deep(.vui-card-footer) {
      padding: var(--space-l);
    }
  }

  .profile-avatar {
    flex-shrink: 0;

    .avatar-container {
      position: relative;
      display: inline-block;

      .online-indicator {
        position: absolute;
        bottom: 15px;
        right: 15px;
        width: 16px;
        height: 16px;
        background-color: var(--color-text-lighter);
        border: 2px solid var(--color-bg);
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
    font-size: var(--font-size-xxxxl);
    color: var(--color-text);
    // margin-top: var(--space-s);
  }

  .profile-description {
    margin: 0;
    color: var(--color-text-light);
    line-height: 1.5;
    font-size: var(--font-size-l);
  }

  .profile-meta {
    color: var(--color-text-light);
    font-size: var(--font-size-s);
    margin-top: var(--space-m);

    .website-link {
      color: var(--color-text-lighter);
      text-decoration: none;
      max-width: 200px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      display: inline-block;

      &:hover {
        text-decoration: underline;
        color: var(--color-accent);
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
