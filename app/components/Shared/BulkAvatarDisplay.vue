<script setup lang="ts">
import type { UserDisplayData } from '@/composables/useUserData'
import { Avatar, Skeleton, Tooltip } from '@dolanske/vui'
import { computed, ref, watch } from 'vue'
import { useBulkUserData } from '@/composables/useUserData'

interface Props {
  userIds: string[]
  maxUsers?: number
  avatarSize?: number
  showNames?: boolean
  random?: boolean
  maxRows?: number
  avatarsPerRow?: number
}

const props = withDefaults(defineProps<Props>(), {
  maxUsers: 10,
  avatarSize: 40,
  showNames: true,
  random: false,
  maxRows: 2,
})

// Convert userIds array to reactive ref
const userIdsRef = ref(props.userIds)

// Watch for prop changes and update ref
watch(() => props.userIds, (newIds) => {
  userIdsRef.value = newIds
}, { immediate: true })

// Use bulk user data composable
const {
  users,
  loading,
  error,
  refetch,
} = useBulkUserData(userIdsRef, {
  includeRole: false,
  includeAvatar: true,
  userTtl: 10 * 60 * 1000, // 10 minutes
  avatarTtl: 30 * 60 * 1000, // 30 minutes
})

// Get visible users (up to maxUsers)
const visibleUserIds = computed(() => {
  if (props.random) {
    // Create a copy of the array and shuffle it
    const shuffled = [...props.userIds]
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      const temp = shuffled[i]
      if (temp !== undefined && shuffled[j] !== undefined) {
        shuffled[i] = shuffled[j]
        shuffled[j] = temp
      }
    }
    return shuffled.slice(0, props.maxUsers)
  }
  return props.userIds.slice(0, props.maxUsers)
})

// Get remaining count
const remainingCount = computed(() => {
  return Math.max(0, props.userIds.length - props.maxUsers)
})

interface UserListEntry {
  id: string
  profile: UserDisplayData
}

// Convert users map to array for template iteration
const usersList = computed<UserListEntry[]>(() => {
  return visibleUserIds.value
    .map((id) => {
      const profile = users.value.get(id) || null
      return profile ? { id, profile } : null
    })
    .filter((entry): entry is UserListEntry => entry !== null)
})

// Helper to chunk an array into equal sized rows
function chunkArray<T>(array: T[], chunkSize: number): T[][] {
  if (chunkSize <= 0) {
    return array.length ? [array] : []
  }

  const chunks: T[][] = []
  for (let i = 0; i < array.length; i += chunkSize) {
    chunks.push(array.slice(i, i + chunkSize))
  }
  return chunks
}

const desiredRows = computed(() => Math.max(1, props.maxRows ?? 1))

const explicitPerRow = computed(() => {
  if (props.avatarsPerRow && props.avatarsPerRow > 0) {
    return props.avatarsPerRow
  }
  return null
})

function getPerRow(count: number) {
  if (explicitPerRow.value) {
    return explicitPerRow.value
  }

  const baseSource = props.maxUsers ?? count
  const base = Math.ceil(baseSource / desiredRows.value)
  return Math.max(1, base)
}

type DisplayEntry
  = | { kind: 'user', user: UserListEntry }
    | { kind: 'remaining', count: number }

const displayEntries = computed<DisplayEntry[]>(() => {
  const entries: DisplayEntry[] = usersList.value.map(user => ({
    kind: 'user',
    user,
  }))

  if (remainingCount.value > 0) {
    entries.push({
      kind: 'remaining',
      count: remainingCount.value,
    })
  }

  return entries
})

const avatarRows = computed(() => {
  const perRow = getPerRow(displayEntries.value.length)
  return chunkArray(displayEntries.value, perRow)
})

const loadingRows = computed(() => {
  const placeholderCount = Math.min(props.userIds.length, props.maxUsers)
  const placeholders = Array.from({ length: placeholderCount }, (_, index) => index)
  const perRow = getPerRow(placeholderCount)
  return chunkArray(placeholders, perRow)
})

const hasMultipleAvatarRows = computed(() => avatarRows.value.length > 1)
const hasMultipleLoadingRows = computed(() => loadingRows.value.length > 1)

// Get user initials
function getUserInitials(username: string): string {
  return username
    .split(' ')
    .map(word => word.charAt(0))
    .join('')
    .substring(0, 2)
    .toUpperCase()
}

// Expose refetch for parent components
defineExpose({
  refetch,
})
</script>

<template>
  <div class="bulk-avatar-display">
    <!-- Loading State -->
    <div
      v-if="loading && userIds.length > 0"
      class="bulk-avatar-display__rows"
      :class="{ 'bulk-avatar-display__rows--multi': hasMultipleLoadingRows }"
    >
      <div
        v-for="(row, rowIndex) in loadingRows"
        :key="`loading-row-${rowIndex}`"
        class="bulk-avatar-display__row"
        :class="{ 'bulk-avatar-display__row--overlay': hasMultipleLoadingRows }"
        :style="{ '--avatar-size': `${avatarSize}px`,
                  '--row-index': rowIndex }"
      >
        <div
          v-for="(placeholder, index) in row"
          :key="`skeleton-${rowIndex}-${placeholder}`"
          class="bulk-avatar-display__avatar"
          :style="{ '--avatar-size': `${avatarSize}px`,
                    '--item-index': index }"
        >
          <Skeleton :width="`${avatarSize}px`" :height="`${avatarSize}px`" style="border-radius: 50%;" />
        </div>
      </div>
    </div>

    <!-- Error State -->
    <div v-else-if="error" class="bulk-avatar-display__error">
      <p class="text-color-danger text-s">
        {{ error }}
      </p>
    </div>

    <!-- Empty State -->
    <div v-else-if="userIds.length === 0" class="bulk-avatar-display__empty">
      <slot name="empty">
        <p class="text-color-light text-s">
          No users to display
        </p>
      </slot>
    </div>

    <!-- Avatars -->
    <div
      v-else
      class="bulk-avatar-display__rows"
      :class="{ 'bulk-avatar-display__rows--multi': hasMultipleAvatarRows }"
    >
      <div
        v-for="(row, rowIndex) in avatarRows"
        :key="`row-${rowIndex}`"
        class="bulk-avatar-display__row"
        :class="{ 'bulk-avatar-display__row--overlay': hasMultipleAvatarRows }"
        :style="{ '--avatar-size': `${avatarSize}px`,
                  '--row-index': rowIndex }"
      >
        <template v-for="(entry, index) in row">
          <Tooltip
            v-if="entry.kind === 'user'"
            :key="entry.user.id"
            class="bulk-avatar-display__avatar"
            :style="{ '--avatar-size': `${avatarSize}px`,
                      '--item-index': index }"
          >
            <template #tooltip>
              <p v-if="showNames && entry.user.profile">
                {{ entry.user.profile.username }}
              </p>
            </template>

            <NuxtLink
              v-if="entry.user.profile?.username"
              :to="`/profile/${entry.user.profile.username}`"
              class="bulk-avatar-display__link"
            >
              <Avatar
                :size="avatarSize"
                :url="entry.user.profile?.avatarUrl || undefined"
                class="bulk-avatar-display__avatar-item"
              >
                <template v-if="!entry.user.profile?.avatarUrl" #default>
                  {{ getUserInitials(entry.user.profile.username) }}
                </template>
              </Avatar>
            </NuxtLink>

            <!-- Fallback for users without username -->
            <Avatar
              v-else
              :size="avatarSize"
              :url="entry.user.profile?.avatarUrl || undefined"
              class="bulk-avatar-display__avatar-item"
            >
              <template v-if="!entry.user.profile?.avatarUrl" #default>
                {{ entry.user.profile ? getUserInitials(entry.user.profile.username || 'User') : '?' }}
              </template>
            </Avatar>
          </Tooltip>

          <div
            v-else
            :key="`remaining-${rowIndex}-${index}`"
            class="bulk-avatar-display__avatar bulk-avatar-display__remaining"
            :style="{ '--avatar-size': `${avatarSize}px`,
                      '--item-index': index }"
          >
            <div class="bulk-avatar-display__remaining-count">
              +{{ entry.count }}
            </div>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.bulk-avatar-display {
  &__rows {
    display: flex;
    flex-direction: column;
    align-items: center;
    position: relative;
    gap: calc(var(--avatar-size, 40px) * 0.2);
  }

  &__row {
    display: flex;
    align-items: center;
    position: relative;
    height: var(--avatar-size, 40px);

    &::before {
      content: '';
      position: absolute;
      inset: 0;
      pointer-events: none;
    }
  }

  &__row--overlay {
    transform: translateX(calc(var(--row-index, 0) * var(--avatar-size, 40px) * 0.25));

    &:not(:first-child) {
      margin-top: calc(var(--avatar-size, 40px) * -0.35);
    }
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
    z-index: calc(100 - (var(--row-index, 0) * 10 + var(--item-index, 0)));
    margin-left: calc(var(--item-index, 0) * -8px);
  }

  &__avatar-item {
    transition:
      transform 0.2s ease,
      z-index 0.2s ease;

    &:hover {
      transform: scale(1.1);
      z-index: 20;
    }
  }

  &__link {
    display: block;
    text-decoration: none;
    border-radius: 50%;

    &:focus-visible {
      outline: 2px solid var(--color-accent);
      outline-offset: 2px;
    }
  }

  &__remaining {
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--avatar-size, 40px);
    height: var(--avatar-size, 40px);
    border-radius: 50%;
    background: var(--color-bg-subtle);
    border: 2px solid var(--color-bg);
    font-size: calc(var(--avatar-size, 40px) * 0.3);
    font-weight: var(--font-weight-medium);
    color: var(--color-text-light);
    transition: background-color 0.2s ease;

    &:hover {
      background: var(--color-bg-raised);
    }
  }

  &__remaining-count {
    font-size: inherit;
    line-height: 1;
  }
}
</style>
