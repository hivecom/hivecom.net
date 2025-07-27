<script setup lang="ts">
import { Avatar, Flex, Skeleton, Tooltip } from '@dolanske/vui'
import { computed, ref, watch } from 'vue'
import { useBulkUserData } from '@/composables/useUserData'

interface Props {
  userIds: string[]
  maxUsers?: number
  avatarSize?: number
  showNames?: boolean
  random?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  maxUsers: 10,
  avatarSize: 40,
  showNames: true,
  random: false,
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

// Convert users map to array for template iteration
const usersList = computed(() => {
  return visibleUserIds.value
    .map(id => ({
      id,
      profile: users.value.get(id) || null,
    }))
    .filter(user => user.profile !== null)
})

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
    <div v-if="loading && userIds.length > 0" class="bulk-avatar-display__loading">
      <div
        v-for="_ in Math.min(userIds.length, maxUsers)"
        :key="`skeleton-${_}`"
        class="bulk-avatar-display__avatar"
        :style="{ '--avatar-size': `${avatarSize}px`,
                  '--index': _ - 1 }"
      >
        <Skeleton :width="`${avatarSize}px`" :height="`${avatarSize}px`" style="border-radius: 50%;" />
      </div>
    </div>

    <!-- Error State -->
    <div v-else-if="error" class="bulk-avatar-display__error">
      <p class="color-text-danger text-s">
        {{ error }}
      </p>
    </div>

    <!-- Empty State -->
    <div v-else-if="userIds.length === 0" class="bulk-avatar-display__empty">
      <slot name="empty">
        <p class="color-text-light text-s">
          No users to display
        </p>
      </slot>
    </div>

    <!-- Avatars -->
    <Flex v-else x-center y-center class="bulk-avatar-display__avatars">
      <!-- User Avatars -->
      <Tooltip
        v-for="(user, index) in usersList"
        :key="user.id"
        class="bulk-avatar-display__avatar"
        :style="{ '--avatar-size': `${avatarSize}px`,
                  '--index': index }"
      >
        <template #tooltip>
          <p v-if="showNames && user.profile">
            {{ user.profile.username }}
          </p>
        </template>

        <NuxtLink
          v-if="user.profile?.username"
          :to="`/profile/${user.profile.username}`"
          class="bulk-avatar-display__link"
        >
          <Avatar
            :size="avatarSize"
            :url="user.profile?.avatarUrl || undefined"
            class="bulk-avatar-display__avatar-item"
          >
            <template v-if="!user.profile?.avatarUrl" #default>
              {{ getUserInitials(user.profile.username) }}
            </template>
          </Avatar>
        </NuxtLink>

        <!-- Fallback for users without username -->
        <Avatar
          v-else
          :size="avatarSize"
          :url="user.profile?.avatarUrl || undefined"
          class="bulk-avatar-display__avatar-item"
        >
          <template v-if="!user.profile?.avatarUrl" #default>
            {{ user.profile ? getUserInitials(user.profile.username || 'User') : '?' }}
          </template>
        </Avatar>
      </Tooltip>

      <!-- Remaining Count -->
      <div
        v-if="remainingCount > 0"
        class="bulk-avatar-display__avatar bulk-avatar-display__remaining"
        :style="{ '--avatar-size': `${avatarSize}px`,
                  '--index': usersList.length }"
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
  &__loading,
  &__avatars {
    display: flex;
    align-items: center;
    position: relative;
    height: var(--avatar-size, 40px);
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
    z-index: calc(10 - var(--index, 0));
    margin-left: calc(var(--index, 0) * -8px);

    &:first-child {
      margin-left: 0;
    }
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
