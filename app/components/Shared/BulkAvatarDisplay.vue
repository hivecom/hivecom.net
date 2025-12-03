<script setup lang="ts">
import type { UserDisplayData } from '@/composables/useUserData'
import { Avatar, Flex, Skeleton } from '@dolanske/vui'
import { computed, ref, watch } from 'vue'
import UserPreviewHover from '@/components/Shared/UserPreviewHover.vue'
import { useBulkUserData } from '@/composables/useUserData'

interface Props {
  userIds: string[]
  maxUsers?: number
  avatarSize?: number
  showNames?: boolean
  random?: boolean
  gap?: number
  hideGenericUsers?: boolean
  supporterHighlight?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  maxUsers: 10,
  avatarSize: 40,
  showNames: true,
  random: false,
  gap: 0,
  hideGenericUsers: true,
  supporterHighlight: false,
})

const GENERIC_USERNAME_REGEX = /^user\d+$/i

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

// Determine user ordering (optionally randomized)
const orderedUserIds = computed(() => {
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
    return shuffled
  }
  return [...props.userIds]
})

// Get remaining count
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

interface UserListEntry {
  id: string
  profile: UserDisplayData
}

// Convert users map to array for template iteration
const usersList = computed<UserListEntry[]>(() => {
  const entries: UserListEntry[] = []

  for (const id of orderedUserIds.value) {
    if (entries.length >= props.maxUsers)
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

const loadingPlaceholderCount = computed(() => {
  if (userIdsRef.value.length === 0)
    return 0

  return Math.max(1, Math.min(userIdsRef.value.length, props.maxUsers))
})

const gapValue = computed(() => Math.max(0, props.gap ?? 0))

const avatarStyleVars = computed(() => ({
  '--avatar-size': `${props.avatarSize}px`,
}))

const isSupporter = (profile?: UserDisplayData | null) => Boolean(profile?.supporter_lifetime || profile?.supporter_patreon)

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
    <Flex
      v-if="loading && userIds.length > 0"
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
        <Skeleton :width="`${avatarSize}px`" :height="`${avatarSize}px`" style="border-radius: 50%;" />
      </div>
    </Flex>

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
    <Flex
      v-else
      class="bulk-avatar-display__list"
      wrap
      x-center
      y-center
      :gap="gapValue"
    >
      <div
        v-for="entry in usersList"
        :key="entry.id"
        class="bulk-avatar-display__avatar"
        :class="{
          'bulk-avatar-display__avatar--supporter': supporterHighlight && isSupporter(entry.profile),
        }"
        :style="avatarStyleVars"
      >
        <UserPreviewHover :user-id="entry.profile?.id || entry.id" class="bulk-avatar-display__hover">
          <NuxtLink
            v-if="entry.profile?.username"
            :to="`/profile/${entry.profile.username}`"
            class="bulk-avatar-display__link"
          >
            <Avatar
              :size="avatarSize"
              :url="entry.profile?.avatarUrl || undefined"
              class="bulk-avatar-display__avatar-item"
            >
              <template v-if="!entry.profile?.avatarUrl" #default>
                {{ getUserInitials(entry.profile.username) }}
              </template>
            </Avatar>
          </NuxtLink>

          <!-- Fallback for users without username -->
          <Avatar
            v-else
            :size="avatarSize"
            :url="entry.profile?.avatarUrl || undefined"
            class="bulk-avatar-display__avatar-item"
          >
            <template v-if="!entry.profile?.avatarUrl" #default>
              {{ entry.profile ? getUserInitials(entry.profile.username || 'User') : '?' }}
            </template>
          </Avatar>
        </UserPreviewHover>
      </div>

      <div
        v-if="remainingCount > 0"
        class="bulk-avatar-display__avatar bulk-avatar-display__remaining"
        :style="avatarStyleVars"
      >
        <div class="bulk-avatar-display__remaining-count">
          +{{ remainingCount }}
        </div>
      </div>
    </Flex>
  </div>
</template>

<style lang="scss" scoped>
.bulk-avatar-display {
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
    border-radius: 50%;
    overflow: visible;
  }

  &__avatar-item {
    transition:
      transform 0.2s ease,
      z-index 0.2s ease;
    border-radius: 50%;
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

  &__link {
    display: block;
    text-decoration: none;
    border-radius: 50%;

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
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
  }
}
</style>
