<script setup lang="ts">
import { Button, Card, Flex, Sheet, Skeleton } from '@dolanske/vui'
import { computed, ref, watch } from 'vue'
import DetailRow from '@/components/Admin/Shared/DetailRow.vue'

import DetailTable from '@/components/Admin/Shared/DetailTable.vue'
import ProfileBadgeFromSlug from '@/components/Profile/Badges/ProfileBadgeFromSlug.vue'
import FriendsModal from '@/components/Profile/FriendsModal.vue'
import AvatarMedia from '@/components/Shared/AvatarMedia.vue'
import CopyValue from '@/components/Shared/CopyValue.vue'
import MarkdownRenderer from '@/components/Shared/MarkdownRenderer.vue'
import Metadata from '@/components/Shared/Metadata.vue'
import RoleIndicator from '@/components/Shared/RoleIndicator.vue'
import TimestampDate from '@/components/Shared/TimestampDate.vue'
import { useCachedFetch } from '@/composables/useCache'
import { useDataProfileBadges } from '@/composables/useDataProfileBadges'
import { BADGE_CATALOG, getBadgeMemberSince } from '@/lib/badges/catalog'
import { isBanActive } from '@/lib/banStatus'
import { getLastSeenTextClass, getLastSeenVariant, getUserActivityStatus } from '@/lib/lastSeen'
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
    lastfm_username?: string | null
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
    birthday?: string | null
    badges?: string[]
    public?: boolean
    rich_presence_enabled?: boolean
    has_teamspeak?: boolean
    confirmed?: boolean
    website?: string | null
  } | null
  actionLoading?: Partial<Record<UserActionType, boolean>>
  canViewUserEmails?: boolean
}>()

// Define emits
const emit = defineEmits(['edit'])

const isBelowSmall = useBreakpoint('<s')

const profileId = computed(() => props.user?.id ?? null)
const { badges, refresh: refreshBadges } = useDataProfileBadges(profileId)

const TIER_RANK: Record<string, number> = { shiny: 0, gold: 1, silver: 2, bronze: 3 }
const sortedBadges = computed(() => {
  return [...badges.value].sort((a, b) => {
    const tierDiff = (TIER_RANK[a.tier] ?? 99) - (TIER_RANK[b.tier] ?? 99)
    if (tierDiff !== 0)
      return tierDiff
    const aOrder = BADGE_CATALOG[a.slug as keyof typeof BADGE_CATALOG]?.sortOrder ?? 99
    const bOrder = BADGE_CATALOG[b.slug as keyof typeof BADGE_CATALOG]?.sortOrder ?? 99
    return aOrder - bOrder
  })
})

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
  loading: friendshipsLoading,
  refetch: refetchFriendships,
} = useCachedFetch<Array<{ id: number, friender: string, friend: string }>>(
  () => ({
    table: 'profile_friends',
    select: 'id, friender, friend',
    filters: {},
  }),
  {
    enabled: computed(() => !!props.user?.id),
    ttl: 2 * 60 * 1000, // 2 minutes for friendship data
  },
)

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

// Get incoming requests (others sent to user but user hasn't reciprocated)
const incomingRequests = computed(() => {
  if (!props.user?.id)
    return []

  const sentByUser = allFriendships.value.filter(f => f.friender === props.user!.id)
  const receivedByUser = allFriendships.value.filter(f => f.friend === props.user!.id)

  const incomingRequests: string[] = []

  receivedByUser.forEach((received) => {
    const mutual = sentByUser.find(sent => sent.friend === received.friender)
    if (!mutual) {
      incomingRequests.push(received.friender)
    }
  })

  return incomingRequests
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
    avatarUrl.value = null
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

const lastSeenVariant = computed(() => getLastSeenVariant(activityStatus.value))

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

defineExpose({ refreshBadges })
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
            <NuxtLink :to="`/profile/${user.username}`" target="_blank">
              {{ user.username }}
            </NuxtLink>
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
        <DetailTable>
          <template #header>
            <Icon name="ph:info" />
            <h6>Overview</h6>
          </template>
          <DetailRow label="UUID">
            <CopyValue :text="user.id" link />
          </DetailRow>

          <DetailRow v-if="canViewUserEmails" label="Email">
            <CopyValue v-if="user.email" :text="user.email" link />
            <span v-else class="text-color-light text-s">No email on file</span>
          </DetailRow>

          <DetailRow label="Status">
            <UserStatusIndicator :status="userStatus" :show-label="true" />
          </DetailRow>

          <DetailRow label="Role">
            <RoleIndicator :role="user.role" size="m" />
          </DetailRow>

          <DetailRow label="Is Public">
            <Icon :name="user.public ? 'ph:eye' : 'ph:eye-slash'" />
            <span class="text-s">{{ user.public ? 'Yes' : 'No' }}</span>
          </DetailRow>

          <DetailRow label="Rich Presence">
            <Icon name="ph:activity" :class="user.rich_presence_enabled ? 'text-color-green' : 'text-color-lighter'" />
            <span class="text-s">{{ user.rich_presence_enabled ? 'Enabled' : 'Disabled' }}</span>
          </DetailRow>

          <DetailRow label="Last Seen">
            <span v-if="lastSeenVariant === 'online'" class="online-dot" />
            <span class="text-s" :class="getLastSeenTextClass(lastSeenVariant)">
              {{ activityStatus?.lastSeenText || 'Never' }}
            </span>
          </DetailRow>

          <!-- Website Information -->
          <DetailRow :hidden="!user.website" label="Website">
            <a
              :href="user.website!"
              target="_blank"
              rel="noopener noreferrer"
              class="website-link"
            >
              {{ user.website }}
            </a>
          </DetailRow>

          <!-- Friends Information -->
          <DetailRow label="Friends">
            <Skeleton v-if="friendshipsLoading" :height="16" :width="80" :radius="4" />
            <template v-else-if="friends.length > 0 || sentRequests.length > 0 || incomingRequests.length > 0">
              <Button variant="link" class="friends-link" @click="showFriendsModal = true">
                {{ friends.length }} {{ friends.length === 1 ? 'friend' : 'friends' }}{{ sentRequests.length > 0 ? `, ${sentRequests.length} sent` : '' }}{{ incomingRequests.length > 0 ? `, ${incomingRequests.length} incoming` : '' }}
              </Button>
            </template>
            <span v-else class="text-s text-color-lighter">No friends</span>
          </DetailRow>

          <DetailRow :hidden="!(hasActiveBan && user.ban_duration)" label="Ban Duration">
            <span class="ban-duration">{{ user.ban_duration }}</span>
          </DetailRow>

          <DetailRow :hidden="!countryInfo" label="Country">
            <Flex gap="xs" y-center class="country-display">
              <span class="country-emoji" role="img" :aria-label="countryInfo?.name">
                {{ countryInfo?.emoji }}
              </span>
              <span class="text-s">{{ countryInfo?.name }} ({{ countryInfo?.code }})</span>
            </Flex>
          </DetailRow>
        </DetailTable>

        <!-- Ban Information -->
        <Card v-if="user.banned" separators class="ban-info-card card-bg">
          <template #header>
            <h6 class="ban-header">
              Ban Information
            </h6>
          </template>

          <DetailTable bare>
            <DetailRow :hidden="!user.ban_reason" label="Reason">
              <span class="ban-reason-text">{{ user.ban_reason }}</span>
            </DetailRow>

            <DetailRow :hidden="!user.ban_start" label="Ban Start">
              <TimestampDate :date="user.ban_start!" />
            </DetailRow>

            <DetailRow v-if="user.ban_end" label="Ban End">
              <TimestampDate :date="user.ban_end" />
            </DetailRow>
            <DetailRow v-else-if="user.banned" label="Ban Type">
              <span class="ban-permanent">Permanent</span>
            </DetailRow>

            <DetailRow :hidden="!user.ban_duration" label="Duration">
              <span class="ban-duration">{{ user.ban_duration }}</span>
            </DetailRow>
          </DetailTable>
        </Card>

        <!-- Platform Connections -->
        <Flex
          v-if="user.patreon_id || user.discord_id || user.steam_id || user.has_teamspeak || user.lastfm_username"
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

            <DetailTable bare>
              <DetailRow label="Name">
                <span class="text-s">{{ user.discord_display_name || 'Unknown' }}</span>
              </DetailRow>
              <DetailRow label="Discord ID">
                <CopyValue :text="user.discord_id!" link />
              </DetailRow>
            </DetailTable>
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

            <DetailTable bare>
              <DetailRow label="Patreon ID">
                <CopyValue :text="user.patreon_id!" link />
              </DetailRow>
            </DetailTable>
          </Card>

          <Card v-if="user.has_teamspeak" separators class="card-bg connection-card" expand>
            <template #header>
              <Flex x-between y-center>
                <Flex gap="xs" y-center>
                  <Icon name="mdi:teamspeak" />
                  <h6>TeamSpeak</h6>
                </Flex>
                <Icon class="text-color-light" name="ph:link" />
              </Flex>
            </template>

            <DetailTable bare>
              <DetailRow label="Status">
                <span class="text-s">Identities linked</span>
              </DetailRow>
            </DetailTable>
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

            <DetailTable bare>
              <DetailRow label="Steam ID">
                <CopyValue :text="user.steam_id!" link />
              </DetailRow>
            </DetailTable>
          </Card>

          <Card v-if="user.lastfm_username" separators class="card-bg connection-card" expand>
            <template #header>
              <Flex x-between y-center>
                <Flex gap="xs" y-center>
                  <Icon name="simple-icons:lastdotfm" />
                  <h6>Last.fm</h6>
                </Flex>
                <a :href="`https://www.last.fm/user/${user.lastfm_username}`" target="_blank" rel="noopener noreferrer">
                  <Icon class="text-color-light" name="ph:arrow-square-out" />
                </a>
              </Flex>
            </template>

            <DetailTable bare>
              <DetailRow label="Username">
                <span class="text-s">{{ user.lastfm_username }}</span>
              </DetailRow>
            </DetailTable>
          </Card>
        </Flex>

        <Flex expand :wrap="isBelowSmall">
          <!-- User Introduction -->
          <Card separators expand class="introduction-card card-bg">
            <template #header>
              <Flex gap="xs" y-center>
                <Icon name="ph:user-circle" />
                <h6>Introduction</h6>
              </Flex>
            </template>
            <div :class="`introduction-text text-s ${!user.introduction ? 'text-color-lighter' : ''}`">
              {{ user.introduction ? user.introduction : 'No introduction provided.' }}
            </div>
          </Card>
          <!-- User Avatar -->
          <Card separators class="avatar-card card-bg">
            <template #header>
              <h6>Avatar</h6>
            </template>
            <AvatarMedia :size="120" :url="avatarUrl || undefined" :alt="user.username">
              <template v-if="!avatarUrl" #default>
                {{ getUserInitials(user.username) }}
              </template>
            </AvatarMedia>
          </Card>
        </Flex>

        <!-- User Profile Markdown -->
        <Card v-if="user.markdown" separators class="card-bg">
          <template #header>
            <Flex x-between y-center expand>
              <Flex y-center gap="xs">
                <Icon name="ph:article" />
                <h6>Content</h6>
              </Flex>
              <span class="text-color-lightest text-xs">Markdown</span>
            </Flex>
          </template>
          <div class="profile-markdown">
            <MarkdownRenderer :md="user.markdown" />
          </div>
        </Card>

        <!-- Fixed Badges -->
        <Card v-if="sortedBadges.length" separators class="card-bg">
          <template #header>
            <h6>Badges</h6>
          </template>
          <div class="badges-grid">
            <div
              v-for="badge in sortedBadges"
              :key="badge.slug"
              class="badge-cell"
            >
              <ProfileBadgeFromSlug
                :slug="badge.slug"
                :tier="badge.tier"
                :progress="badge.progress ?? undefined"
                :earned-at="getBadgeMemberSince(badge.metadata, badge.earned_at)"
                compact
              />
            </div>
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
      :incoming-requests="incomingRequests"
      :user-name="user.username"
      :show-all-tabs="true"
      @close="showFriendsModal = false"
    />
  </Sheet>
</template>

<style scoped lang="scss">
.friends-link {
  padding-inline: 0;
}

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
  border-radius: var(--border-radius-pill);
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
  font-size: var(--font-size-s);
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

.badges-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--space-s);
}

.badge-cell {
  display: flex;
  justify-content: center;
  width: 100%;

  :deep(.profile-badge__tooltip-wrapper),
  :deep(.profile-badge) {
    width: 100%;
  }

  :deep(.profile-badge__hex-wrapper) {
    width: 100%;
  }
}
</style>
