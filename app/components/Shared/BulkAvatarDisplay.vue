<script setup lang="ts">
import type { Sizes } from '@dolanske/vui'
import type { UserDisplayData } from '@/composables/useDataUser'
import { Badge, Flex, Indicator, Skeleton, Tooltip } from '@dolanske/vui'
import { computed, ref, watch } from 'vue'
import AvatarMedia from '@/components/Shared/AvatarMedia.vue'
import UserPreviewHover from '@/components/Shared/UserPreviewHover.vue'
import { useBulkDataUser } from '@/composables/useDataUser'
import { useUserId } from '@/composables/useUserId'
import { getUserActivityStatus } from '@/lib/lastSeen'
import { shuffleArray } from '@/lib/utils/random'

// TODO: use AvatarGroup from vui

interface Props {
  userIds: string[]

  /** Sorted to the front of the list, so a cut-off cluster keeps them. */
  friendIds?: string[]
  maxUsers?: number
  avatarSize?: Sizes | number
  showNames?: boolean
  random?: boolean
  gap?: number
  hideGenericUsers?: boolean
  supporterHighlight?: boolean
  noEmptyState?: boolean
  expand?: boolean

  /**
   * Cluster mode: avatars overlap (negative gap), no slot reservation for
   * the overflow bubble, and no remainingClick interaction.
   */
  cluster?: boolean

  /**
   * Show a green online indicator dot on avatars whose last_seen is within
   * the active threshold (~15 minutes).
   */
  showOnlineIndicator?: boolean

  /**
   * Ids that get the online dot regardless of last_seen, for clusters where
   * "live" means something other than being on the site (in a game, say).
   */
  liveIds?: string[]

  /** Tooltip on the dot for liveIds. */
  liveLabel?: string

  /**
   * The id list itself is still on its way. Draws a few skeleton avatars so
   * the cluster holds its spot instead of popping in once the ids land.
   */
  pending?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  friendIds: () => [],
  maxUsers: 10,
  avatarSize: 40,
  showNames: true,
  random: false,
  gap: 0,
  hideGenericUsers: true,
  supporterHighlight: false,
  expand: true,
  cluster: false,
  showOnlineIndicator: false,
  liveIds: () => [],
  liveLabel: 'Online',
  pending: false,
})

const emit = defineEmits<{
  remainingClick: []
}>()

const GENERIC_USERNAME_REGEX = /^user\d+$/i

const userIdsRef = ref(props.userIds)

watch(() => props.userIds, (newIds) => {
  userIdsRef.value = newIds
}, { immediate: true })

const {
  users,
  loading,
  error,
  refetch,
} = useBulkDataUser(userIdsRef, {
  includeRole: false,
  includeAvatar: true,
  userTtl: 10 * 60 * 1000,
  avatarTtl: 30 * 60 * 1000,
})

const friendIdSet = computed(() => new Set(props.friendIds))
const liveIdSet = computed(() => new Set(props.liveIds))

// Determine user ordering (optionally randomized). Friends lead, since they're
// the reason to look at the cluster at all, and a cut-off list should lose
// strangers first.
const orderedUserIds = computed(() => {
  const ids = props.random ? shuffleArray(props.userIds) : [...props.userIds]

  if (friendIdSet.value.size === 0)
    return ids

  return ids.sort((a, b) => Number(friendIdSet.value.has(b)) - Number(friendIdSet.value.has(a)))
})

const remainingCount = computed(() => {
  const eligibleCount = orderedUserIds.value.reduce((count, id) => {
    const profile = users.value.get(id)
    if (!profile)
      return count

    if (props.hideGenericUsers && profile.username && GENERIC_USERNAME_REGEX.test(profile.username))
      return count

    return count + 1
  }, 0)

  return Math.max(0, eligibleCount - props.maxUsers)
})

// Cluster mode reserves no slot, so the +N bubble just appends. Normal mode
// reserves the last avatar slot so the bubble stays in-row.
const effectiveMaxUsers = computed(() => {
  if (props.cluster)
    return props.maxUsers

  return remainingCount.value > 0 ? props.maxUsers - 1 : props.maxUsers
})

// The displayed remaining count includes the user we bumped off to make room
// (normal mode only).
const displayedRemainingCount = computed(() => {
  if (props.cluster)
    return remainingCount.value

  return remainingCount.value > 0 ? remainingCount.value + 1 : 0
})

interface UserListEntry {
  id: string
  profile: UserDisplayData
}

const usersList = computed<UserListEntry[]>(() => {
  const entries: UserListEntry[] = []

  for (const id of orderedUserIds.value) {
    if (entries.length >= effectiveMaxUsers.value)
      break

    const profile = users.value.get(id)
    if (!profile)
      continue

    if (props.hideGenericUsers && profile.username && GENERIC_USERNAME_REGEX.test(profile.username))
      continue

    entries.push({ id, profile })
  }

  return entries
})

const PENDING_PLACEHOLDERS = 3

const loadingPlaceholderCount = computed(() => {
  if (userIdsRef.value.length === 0)
    return props.pending ? Math.min(PENDING_PLACEHOLDERS, props.maxUsers) : 0

  return Math.max(1, Math.min(userIdsRef.value.length, props.maxUsers))
})

const gapValue = computed(() => Math.max(0, props.gap ?? 0))

const avatarStyleVars = computed(() => ({
  '--avatar-size': `${props.avatarSize}px`,
}))

// Cluster avatars overlap, and DOM order alone paints each one over the avatar
// before it, which clips the leading player's online dot. Hand every avatar a
// stack index so the cluster reads left over right, with the +N bubble on top
// of the lot so its count stays legible.
function avatarStackVars(index: number) {
  if (!props.cluster)
    return avatarStyleVars.value

  return {
    ...avatarStyleVars.value,
    '--stack-index': String(usersList.value.length - index),
  }
}

const overflowStackVars = computed(() => {
  if (!props.cluster)
    return avatarStyleVars.value

  return {
    ...avatarStyleVars.value,
    '--stack-index': String(usersList.value.length + 1),
  }
})

const isSupporter = (profile?: UserDisplayData | null) => Boolean(profile?.supporter_lifetime || profile?.supporter_patreon)

const currentUserId = useUserId()

function getActivityStatus(profile?: UserDisplayData | null) {
  // The signed-in user is always online, regardless of last_seen.
  if (profile?.id && currentUserId.value && profile.id === currentUserId.value) {
    return {
      isActive: true,
      isAway: false,
      lastSeenText: 'Online',
      lastSeenTimestamp: new Date(),
    }
  }
  if (!profile?.last_seen)
    return null

  return getUserActivityStatus(profile.last_seen)
}

function getUserInitials(username: string): string {
  return username
    .split(' ')
    .map(word => word.charAt(0))
    .join('')
    .substring(0, 2)
    .toUpperCase()
}

defineExpose({
  refetch,
})
</script>

<template>
  <Flex :expand="props.expand" class="bulk-avatar-display" :class="{ 'bulk-avatar-display--cluster': cluster }">
    <Flex
      v-if="(loading && userIds.length > 0) || (pending && userIds.length === 0)"
      class="bulk-avatar-display__list bulk-avatar-display__list--loading"
      wrap
      x-center
      y-center
      :gap="gapValue"
    >
      <div
        v-for="index in loadingPlaceholderCount"
        :key="`skeleton-${index}`"
        class="bulk-avatar-display__avatar"
        :style="avatarStyleVars"
      >
        <Skeleton :width="`${avatarSize}px`" :height="`${avatarSize}px`" style="border-radius: var(--border-radius-pill);" />
      </div>
    </Flex>

    <div v-else-if="error" class="bulk-avatar-display__error">
      <p class="text-color-danger text-s">
        {{ error }}
      </p>
    </div>

    <div v-else-if="userIds.length === 0 && !props.noEmptyState" class="bulk-avatar-display__empty">
      <slot name="empty">
        <p class="text-color-light text-s">
          No users to display
        </p>
      </slot>
    </div>

    <Flex
      v-else
      class="bulk-avatar-display__list"
      wrap
      x-center
      y-center
      :gap="gapValue"
    >
      <div
        v-for="(entry, index) in usersList"
        :key="entry.id"
        class="bulk-avatar-display__avatar"
        :class="{
          'bulk-avatar-display__avatar--supporter': supporterHighlight && isSupporter(entry.profile),
        }"
        :style="avatarStackVars(index)"
      >
        <UserPreviewHover :user-id="entry.profile?.id || entry.id" class="bulk-avatar-display__hover">
          <div class="bulk-avatar-display__avatar-wrap">
            <NuxtLink
              v-if="entry.profile?.username"
              :to="`/profile/${entry.profile.username}`"
              class="bulk-avatar-display__link"
            >
              <AvatarMedia
                :size="avatarSize"
                :url="entry.profile?.avatarUrl || undefined"
                :alt="entry.profile.username"
                class="bulk-avatar-display__avatar-item"
              >
                {{ getUserInitials(entry.profile.username) }}
              </AvatarMedia>
            </NuxtLink>

            <!-- Fallback for users without username -->
            <AvatarMedia
              v-else
              :size="avatarSize"
              :url="entry.profile?.avatarUrl || undefined"
              :alt="entry.profile?.username || 'User'"
              class="bulk-avatar-display__avatar-item"
            >
              {{ entry.profile ? getUserInitials(entry.profile.username || 'User') : '?' }}
            </AvatarMedia>

            <Tooltip v-if="liveIdSet.has(entry.id)">
              <template #tooltip>
                <p>{{ liveLabel }}</p>
              </template>
              <Indicator
                variant="online"
                class="bulk-avatar-display__online-indicator z-active"
                outline
                size="s"
              />
            </Tooltip>

            <Tooltip v-else-if="showOnlineIndicator && (getActivityStatus(entry.profile)?.isActive || getActivityStatus(entry.profile)?.isAway)">
              <template #tooltip>
                <p>{{ getActivityStatus(entry.profile)!.lastSeenText }}</p>
              </template>
              <Indicator
                :variant="getActivityStatus(entry.profile)!.isActive ? 'online' : 'away'"
                class="bulk-avatar-display__online-indicator z-active"
                outline
                size="s"
              />
            </Tooltip>
          </div>
        </UserPreviewHover>
      </div>

      <div
        v-if="displayedRemainingCount > 0"
        class="bulk-avatar-display__overflow"
        :style="overflowStackVars"
        :role="cluster ? undefined : 'button'"
        :tabindex="cluster ? undefined : 0"
        @click="!cluster && emit('remainingClick')"
        @keydown.enter="!cluster && emit('remainingClick')"
        @keydown.space.prevent="!cluster && emit('remainingClick')"
      >
        <Badge circle size="m" :style="{ '--vui-badge-height': '28px' }">
          +{{ displayedRemainingCount }}
        </Badge>
      </div>
    </Flex>
  </Flex>
</template>

<style lang="scss" scoped>
.bulk-avatar-display {
  &--cluster {
    .bulk-avatar-display__avatar:not(:first-child),
    .vui-badge {
      margin-left: calc(var(--space-s, 0px) * -1);
    }

    .bulk-avatar-display__avatar,
    .bulk-avatar-display__overflow {
      z-index: var(--stack-index, 0);
    }

    // Whatever's hovered comes forward, otherwise the scale-up gets cut off by
    // the avatar sitting on top of it.
    .bulk-avatar-display__avatar:hover {
      z-index: 30;
    }
  }

  &__list {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    align-items: center;
    padding: 0;
    margin: 0 auto;
    max-width: 100%;
  }

  &__list--loading {
    opacity: 0.85;
  }

  &__error,
  &__empty {
    padding: var(--space-s);
    text-align: center;

    p {
      margin: 0;
    }
  }

  &__avatar {
    position: relative;
    z-index: 0;
    flex: 0 0 auto;
    width: var(--avatar-size, 40px);
    height: var(--avatar-size, 40px);
    border-radius: var(--border-radius-pill);
    overflow: visible;
  }

  &__overflow {
    position: relative;
    flex: 0 0 auto;

    // Outside cluster mode the bubble is a button that opens the full list.
    .bulk-avatar-display:not(.bulk-avatar-display--cluster) & {
      cursor: pointer;
      border-radius: var(--border-radius-pill);

      &:focus-visible {
        outline: 2px solid var(--color-accent);
        outline-offset: 2px;
      }
    }
  }

  &__online-indicator {
    position: absolute;
    bottom: 5px;
    right: 5px;
  }

  &__avatar-wrap {
    position: relative;
    display: inline-flex;
    width: 100%;
    height: 100%;
  }

  &__avatar-item {
    transition:
      transform 0.2s ease,
      z-index 0.2s ease;
    border-radius: var(--border-radius-pill);
    overflow: hidden;
    position: relative;
    z-index: 1;

    &:hover {
      transform: scale(1.1);
      z-index: 20;
    }
  }

  &__avatar--supporter {
    .bulk-avatar-display__avatar-item {
      :deep(.avatar-media__image),
      :deep(.vui-avatar) {
        border: 2px solid transparent;
        background:
          linear-gradient(var(--color-bg), var(--color-bg)) padding-box,
          linear-gradient(120deg, #fdf4d4 0%, #f2c15a 45%, #c88a2a 100%) border-box;
        background-size:
          100% 100%,
          220% 220%;
        background-origin: border-box;
        box-shadow:
          0 0 16px rgba(253, 244, 212, 0.45),
          0 0 20px rgba(0, 0, 0, 0.25);
        animation: goldShimmer 14s ease-in-out infinite;
      }
    }
  }

  &__link {
    display: block;
    text-decoration: none;
    border-radius: var(--border-radius-pill);

    &:focus-visible {
      outline: 2px solid var(--color-accent);
      outline-offset: 2px;
    }
  }

  &__hover {
    display: block;
    width: 100%;
    height: 100%;
  }
}
</style>
