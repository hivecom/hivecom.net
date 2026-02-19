<script setup lang="ts">
import type { UserActivityStatus } from '@/lib/lastSeen'

import { Avatar, Button, Card, CopyClipboard, Flex, Grid, Sheet } from '@dolanske/vui'
import { computed, ref, watch } from 'vue'

import FriendsModal from '@/components/Profile/FriendsModal.vue'
import MDRenderer from '@/components/Shared/MDRenderer.vue'
import Metadata from '@/components/Shared/Metadata.vue'
import RoleIndicator from '@/components/Shared/RoleIndicator.vue'
import TimestampDate from '@/components/Shared/TimestampDate.vue'
import UserLink from '@/components/Shared/UserLink.vue'
import { useCacheQuery } from '@/composables/useCache'
import { isBanActive } from '@/lib/banStatus'
import { getUserActivityStatus } from '@/lib/lastSeen'
import { useBreakpoint } from '@/lib/mediaQuery'
import { getUserAvatarUrl } from '@/lib/storage'
import { getCountryInfo } from '@/lib/utils/country'
import UserActions from './UserActions.vue'
import UserStatusIndicator from './UserStatusIndicator.vue'

type UserActionType = 'ban' | 'unban' | 'edit' | 'delete'

const props = defineProps<{
  user: {
    id: string
    username: string
    email: string | null
    created_at: string
    created_by?: string | null
    modified_at: string | null
    modified_by: string | null
    supporter_patreon: boolean
    supporter_lifetime: boolean
    patreon_id: string | null
    discord_id: string | null
    discord_display_name?: string | null
    steam_id: string | null
    introduction: string | null
    markdown: string | null
    banned: boolean
    ban_reason: string | null
    ban_start: string | null
    ban_end: string | null
    last_seen: string
    ban_duration?: string
    role?: string | null
    country?: string | null
    confirmed?: boolean
  } | null
  actionLoading?: Partial<Record<UserActionType, boolean>>
  canViewUserEmails?: boolean
}>()

// Define emits
const emit = defineEmits(['edit'])

const isBelowSmall = useBreakpoint('<s')

// Get current user
const currentUser = useSupabaseUser()
const supabase = useSupabaseClient()

// Avatar state
const avatarUrl = ref<string | null>(null)

// Friends modal state
const showFriendsModal = ref(false)

// Friends data
const allFriendships = ref<Array<{ id: number, friender: string, friend: string }>>([])

// Fetch all friendships for this user
const {
  data: friendshipsData,
  refetch: refetchFriendships,
} = useCacheQuery<Array<{ id: number, friender: string, friend: string }>>({
  table: 'friends',
  select: 'id, friender, friend',
  filters: {},
}, {
  enabled: computed(() => !!props.user?.id),
  ttl: 2 * 60 * 1000, // 2 minutes for friendship data
})

// Update local friendships data when query data changes
watch(friendshipsData, (newData) => {
  if (newData && props.user?.id) {
    // Filter to only friendships involving this user
    allFriendships.value = newData.filter(f =>
      f.friender === props.user!.id || f.friend === props.user!.id,
    )
  }
  else {
    allFriendships.value = []
  }
}, { immediate: true })

// Get friends (mutual friendships)
const friends = computed(() => {
  if (!props.user?.id)
    return []

  const sentByUser = allFriendships.value.filter(f => f.friender === props.user!.id)
  const receivedByUser = allFriendships.value.filter(f => f.friend === props.user!.id)

  // Find mutual friends (users who have both sent and received friendship with this user)
  const mutualFriends: string[] = []

  sentByUser.forEach((sent) => {
    const mutual = receivedByUser.find(received => received.friender === sent.friend)
    if (mutual) {
      mutualFriends.push(sent.friend)
    }
  })

  return mutualFriends
})

// Get sent requests (user sent but no reciprocation)
const sentRequests = computed(() => {
  if (!props.user?.id)
    return []

  const sentByUser = allFriendships.value.filter(f => f.friender === props.user!.id)
  const receivedByUser = allFriendships.value.filter(f => f.friend === props.user!.id)

  const sentRequests: string[] = []

  sentByUser.forEach((sent) => {
    const mutual = receivedByUser.find(received => received.friender === sent.friend)
    if (!mutual) {
      sentRequests.push(sent.friend)
    }
  })

  return sentRequests
})

// Get pending requests (others sent to user but user hasn't reciprocated)
const pendingRequests = computed(() => {
  if (!props.user?.id)
    return []

  const sentByUser = allFriendships.value.filter(f => f.friender === props.user!.id)
  const receivedByUser = allFriendships.value.filter(f => f.friend === props.user!.id)

  const pendingRequests: string[] = []

  receivedByUser.forEach((received) => {
    const mutual = sentByUser.find(sent => sent.friend === received.friender)
    if (!mutual) {
      pendingRequests.push(received.friender)
    }
  })

  return pendingRequests
})

// Define models for two-way binding with proper type definitions
const isOpen = defineModel<boolean>('isOpen', { default: false })

// Type that specifically allows null
type UserAction = {
  user: NonNullable<typeof props.user>
  type: UserActionType | null
  banDuration?: string
  banReason?: string
} | null
const userAction = defineModel<UserAction>('userAction', { default: null })

// Add a refreshTrigger model to request a refresh from parent
const refreshUser = defineModel<boolean>('refreshUser', { default: false })

// Watch for userAction changes to trigger data refresh after actions are performed
watch(() => userAction.value, (action) => {
  if (action) {
    // If it's an edit action, emit edit event - let parent handle closing
    if (action.type === 'edit') {
      emit('edit', props.user)
      // Remove: isOpen.value = false - let parent handle this
      return
    }

    // After a longer delay to ensure the action completes and data is updated on the server
    setTimeout(() => {
      // Set refresh flag to true to trigger refresh in parent
      refreshUser.value = true
    }, 1500) // Increased from 500ms to 1500ms for more reliable updates
  }
})

// Watch for user changes to fetch avatar and refetch friends data
watch(() => props.user, async (newUser) => {
  if (newUser?.id) {
    avatarUrl.value = await getUserAvatarUrl(supabase, newUser.id)
    // Refetch friends data when user changes
    await refetchFriendships()
  }
  else {
    avatarUrl.value = null
    allFriendships.value = []
  }
}, { immediate: true })

const hasActiveBan = computed(() => {
  if (!props.user)
    return false
  return isBanActive(props.user.banned, props.user.ban_end)
})

// Computed property for user status
const userStatus = computed(() => (hasActiveBan.value ? 'banned' : 'active'))

// Computed property for user activity status
const activityStatus = computed(() => {
  if (!props.user?.last_seen)
    return null
  return getUserActivityStatus(props.user.last_seen)
})

type LastSeenVariant = 'online' | 'fresh' | 'light' | 'lighter' | 'lightest'

function getLastSeenVariant(status: UserActivityStatus | null): LastSeenVariant {
  if (!status)
    return 'lightest'
  if (Number.isNaN(status.lastSeenTimestamp.getTime()))
    return 'lightest'
  if (status.isActive)
    return 'online'

  const diffMs = Date.now() - status.lastSeenTimestamp.getTime()
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  // Last 24 hours
  if (diffHours < 24)
    return 'fresh'

  // Last 3 days
  if (diffDays < 3)
    return 'light'

  // Last 14 days
  if (diffDays < 14)
    return 'lighter'

  // > 14 days
  return 'lightest'
}

const lastSeenVariant = computed(() => getLastSeenVariant(activityStatus.value))

function getLastSeenTextClass(variant: LastSeenVariant): string {
  switch (variant) {
    case 'online':
      return 'last-seen-online'
    case 'fresh':
      return 'text-color'
    case 'light':
      return 'text-color-light'
    case 'lighter':
      return 'text-color-lighter'
    case 'lightest':
      return 'text-color-lightest'
  }
}

const countryInfo = computed(() => (props.user ? getCountryInfo(props.user.country ?? null) : null))

// Handle closing the sheet
function handleClose() {
  isOpen.value = false
}

function isDetailActionLoading(actionType: string) {
  return !!props.actionLoading?.[actionType as UserActionType]
}

// Get user initials for avatar fallback
function getUserInitials(username: string): string {
  return username
    .split(' ')
    .map(word => word.charAt(0))
    .join('')
    .substring(0, 2)
    .toUpperCase()
}
</script>

<template>
  <Sheet
    :open="!!user && isOpen"
    position="right"
    :card="{ separators: true }"
    :size="600"
    @close="handleClose"
  >
    <template #header>
      <Flex x-between y-center class="pr-s">
        <Flex column :gap="0">
          <h4>User Details</h4>
          <p v-if="user" class="text-color-light text-xs">
            <UserLink :user-id="user.id" />
          </p>
        </Flex>

        <UserActions
          v-if="user"
          v-model="userAction"
          :user="user"
          :status="userStatus"
          :current-user-id="currentUser?.id"
          :is-loading="isDetailActionLoading"
          show-labels
        />
      </Flex>
    </template>

    <Flex v-if="user" column gap="m" class="user-detail">
      <Flex column gap="m" expand>
        <!-- Basic Info -->
        <Card class="card-bg">
          <Flex column gap="l" expand>
            <Grid class="detail-item" columns="1fr 2fr" expand>
              <span class="text-color-light text-bold">UUID:</span>
              <CopyClipboard :text="user.id">
                <code class="user-id">{{ user.id }}</code>
              </CopyClipboard>
            </Grid>

            <Grid class="detail-item" expand columns="1fr 2fr">
              <span class="text-color-light text-bold">Username:</span>
              <UserLink :user-id="user.id" class="text-m" show-avatar />
            </Grid>

            <Grid v-if="canViewUserEmails" class="detail-item" expand columns="1fr 2fr">
              <span class="text-color-light text-bold">Email:</span>
              <template v-if="user.email">
                <CopyClipboard :text="user.email" confirm>
                  <Flex y-center>
                    <Icon name="ph:copy" />
                    <span class="user-email">{{ user.email }}</span>
                  </Flex>
                </CopyClipboard>
              </template>
              <span v-else class="text-color-light text-s">No email on file</span>
            </Grid>

            <Grid class="detail-item" expand columns="1fr 2fr">
              <span class="text-color-light text-bold">Status:</span>
              <UserStatusIndicator :status="userStatus" :show-label="true" />
            </Grid>

            <Grid class="detail-item" columns="1fr 2fr" expand>
              <span class="text-color-light text-bold">Role:</span>
              <span>
                <RoleIndicator :role="user.role" />
              </span>
            </Grid>

            <Grid class="detail-item" columns="1fr 2fr" expand>
              <span class=" text-bold">Last Seen:</span>
              <Flex gap="xs" y-center>
                <span v-if="lastSeenVariant === 'online'" class="online-dot" />
                <span
                  class="text-s"
                  :class="getLastSeenTextClass(lastSeenVariant)"
                >
                  {{ activityStatus?.lastSeenText || 'Never' }}
                </span>
              </Flex>
            </Grid>

            <!-- Website Information -->
            <Grid v-if="(user as any).website" class="detail-item" columns="1fr 2fr" expand>
              <span class="text-color-light text-bold">Website:</span>
              <a
                :href="(user as any).website"
                target="_blank"
                rel="noopener noreferrer"
                class="website-link"
              >
                {{ (user as any).website }}
              </a>
            </Grid>

            <!-- Friends Information -->
            <Grid class="detail-item" columns="1fr 2fr" expand wrap>
              <span class="text-color-light text-bold">Friends:</span>
              <Flex gap="xs" y-center wrap>
                <span class="text-s">
                  {{ friends.length }} {{ friends.length === 1 ? 'friend' : 'friends' }}
                </span>
                <span v-if="sentRequests.length > 0" class="text-s text-color-light">
                  • {{ sentRequests.length }} sent
                </span>
                <span v-if="pendingRequests.length > 0" class="text-s text-color-light">
                  • {{ pendingRequests.length }} pending
                </span>
                <Button
                  v-if="friends.length > 0 || sentRequests.length > 0 || pendingRequests.length > 0"
                  variant="gray"
                  size="s"
                  @click="showFriendsModal = true"
                >
                  View Details
                </Button>
              </Flex>
            </Grid>

            <Grid v-if="hasActiveBan && user.ban_duration" class="detail-item" columns="1fr 2fr" expand>
              <span class="text-color-light text-bold">Ban Duration:</span>
              <span class="ban-duration">{{ user.ban_duration }}</span>
            </Grid>

            <Grid v-if="countryInfo" class="detail-item" columns="1fr 2fr" expand>
              <span class="text-color-light text-bold">Country:</span>
              <Flex gap="xs" y-center class="country-display">
                <span class="country-emoji" role="img" :aria-label="countryInfo.name">
                  {{ countryInfo.emoji }}
                </span>
                <span class="text-s">
                  {{ countryInfo.name }} ({{ countryInfo.code }})
                </span>
              </Flex>
            </Grid>
          </Flex>
        </Card>

        <!-- Ban Information -->
        <Card v-if="user.banned" separators class="ban-info-card card-bg">
          <template #header>
            <h6 class="ban-header">
              Ban Information
            </h6>
          </template>

          <Flex column gap="l" expand>
            <Grid v-if="user.ban_reason" class="detail-item" :columns="2" expand>
              <span class="text-color-light text-bold">Reason:</span>
              <span class="ban-reason-text">{{ user.ban_reason }}</span>
            </Grid>

            <Grid v-if="user.ban_start" class="detail-item" :columns="2" expand>
              <span class="text-color-light text-bold">Ban Start:</span>
              <TimestampDate :date="user.ban_start" />
            </Grid>

            <Grid v-if="user.ban_end" class="detail-item" :columns="2" expand>
              <span class="text-color-light text-bold">Ban End:</span>
              <TimestampDate :date="user.ban_end" />
            </Grid>

            <Grid v-else-if="user.banned" class="detail-item" :columns="2" expand>
              <span class="text-color-light text-bold">Ban Type:</span>
              <span class="ban-permanent">Permanent</span>
            </Grid>

            <Grid v-if="user.ban_duration" class="detail-item" :columns="2" expand>
              <span class="text-color-light text-bold">Duration:</span>
              <span class="ban-duration">{{ user.ban_duration }}</span>
            </Grid>
          </Flex>
        </Card>

        <!-- Platform Connections -->
        <Flex
          v-if="user.patreon_id || user.discord_id || user.steam_id"
          gap="s"
          :column="isBelowSmall"
          :wrap="!isBelowSmall"
          expand
        >
          <Card v-if="user.discord_id" separators class="card-bg connection-card" expand>
            <template #header>
              <Flex x-between y-center>
                <Flex gap="xs" y-center>
                  <Icon name="ph:discord-logo" />
                  <h6>Discord</h6>
                </Flex>
                <Icon class="text-color-light" name="ph:link" />
              </Flex>
            </template>

            <Flex column gap="s" expand>
              <Grid class="detail-item" :columns="2" expand>
                <span class="text-color-light text-bold">Name:</span>
                <span class="text-s">
                  {{ user.discord_display_name || 'Unknown' }}
                </span>
              </Grid>

              <Grid class="detail-item" :columns="2" expand>
                <span class="text-color-light text-bold">Discord ID:</span>
                <CopyClipboard :text="user.discord_id" confirm>
                  <span class="platform-id">{{ user.discord_id }}</span>
                </CopyClipboard>
              </Grid>
            </Flex>
          </Card>

          <Card v-if="user.patreon_id" separators class="card-bg connection-card" expand>
            <template #header>
              <Flex x-between y-center>
                <Flex gap="xs" y-center>
                  <Icon name="ph:patreon-logo" />
                  <h6>Patreon</h6>
                </Flex>
                <Icon class="text-color-light" name="ph:link" />
              </Flex>
            </template>

            <Flex column gap="s" expand>
              <Grid class="detail-item" :columns="2" expand>
                <span class="text-color-light text-bold">Patreon ID:</span>
                <CopyClipboard :text="user.patreon_id" confirm>
                  <Flex y-center>
                    <Icon name="ph:copy" />
                    <span class="platform-id">{{ user.patreon_id }}</span>
                  </Flex>
                </CopyClipboard>
              </Grid>
            </Flex>
          </Card>

          <Card v-if="user.steam_id" separators class="card-bg connection-card" expand>
            <template #header>
              <Flex x-between y-center>
                <Flex gap="xs" y-center>
                  <Icon name="ph:steam-logo" />
                  <h6>Steam</h6>
                </Flex>
                <Icon class="text-color-light" name="ph:link" />
              </Flex>
            </template>

            <Flex column gap="s" expand>
              <Grid class="detail-item" :columns="2" expand>
                <span class="text-color-light text-bold">Steam ID:</span>
                <CopyClipboard :text="user.steam_id" confirm>
                  <Flex y-center>
                    <Icon name="ph:copy" />
                    <span class="platform-id">{{ user.steam_id }}</span>
                  </Flex>
                </CopyClipboard>
              </Grid>
            </Flex>
          </Card>
        </Flex>

        <Flex expand :wrap="isBelowSmall">
          <!-- User Introduction -->
          <Card separators expand class="introduction-card card-bg">
            <template #header>
              <h6>Introduction</h6>
            </template>
            <div :class="`introduction-text ${!user.introduction ? 'text-color-lighter' : ''}`">
              {{ user.introduction ? user.introduction : 'No introduction provided.' }}
            </div>
          </Card>
          <!-- User Avatar -->
          <Card separators class="avatar-card card-bg">
            <template #header>
              <h6>Avatar</h6>
            </template>
            <Avatar :size="120" :url="avatarUrl || undefined">
              <template v-if="!avatarUrl" #default>
                {{ getUserInitials(user.username) }}
              </template>
            </Avatar>
          </Card>
        </Flex>

        <!-- User Profile Markdown -->
        <Card v-if="user.markdown" separators class="card-bg">
          <template #header>
            <h6>Profile Content</h6>
          </template>
          <div class="profile-markdown">
            <MDRenderer :md="user.markdown" />
          </div>
        </Card>

        <!-- Metadata -->
        <Metadata
          :created-at="user.created_at"
          :created-by="user.created_by"
          :modified-at="user.modified_at"
          :modified-by="user.modified_by"
          :show-system-user-for-missing-created-by="true"
        />
      </Flex>
    </Flex>

    <!-- Friends Modal -->
    <FriendsModal
      v-if="user"
      v-model:open="showFriendsModal"
      :friends="friends"
      :sent-requests="sentRequests"
      :pending-requests="pendingRequests"
      :user-name="user.username"
      :show-all-tabs="true"
      @close="showFriendsModal = false"
    />
  </Sheet>
</template>

<style scoped lang="scss">
.user-detail {
  padding-bottom: var(--space);
}

.user-id,
.platform-id,
.user-email {
  font-family: monospace;
  font-size: var(--font-size-s);
  background-color: var(--color-bg-light);
  padding: 2px 6px;
  border-radius: var(--border-radius-xs);
  word-break: break-all;
}

.connection-card {
  min-width: 220px;
}

.online-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background-color: var(--color-text-green) !important;
  display: inline-block;
}

.last-seen-online {
  color: var(--color-text-green) !important;
}

.ban-duration {
  color: var(--color-danger);
  font-weight: var(--font-weight-medium);
}

.ban-info-card {
  border-left: 4px solid var(--color-danger);
}

.ban-header {
  color: var(--color-danger);
  margin: 0;
}

.ban-reason-text {
  color: var(--color-text);
  line-height: 1.4;
}

.ban-permanent {
  color: var(--color-danger);
  font-weight: var(--font-weight-bold);
}

.introduction-text {
  font-size: var(--font-size-m);
  line-height: 1.6;
  color: var(--color-text);
}

.profile-markdown {
  max-height: 400px;
  overflow-y: auto;
}

.avatar-section {
  padding: var(--space-l);
  text-align: center;

  p {
    margin: 0;
  }
}

/* Make both cards the same height */
.avatar-card,
.introduction-card {
  height: 200px;
  display: flex;
  flex-direction: column;
}

.avatar-card {
  width: auto;
}

.website-link {
  color: var(--color-text-accent);
  text-decoration: none;
  font-size: var(--font-size-s);

  &:hover {
    text-decoration: underline;
  }
}

.country-display {
  .country-emoji {
    font-size: var(--font-size-m);
    line-height: 1;
  }
}
</style>
