<script setup lang="ts">
import { Avatar, Flex } from '@dolanske/vui'
import RoleIndicator from '@/components/Shared/RoleIndicator.vue'
import { useUserData } from '@/composables/useUserData'

interface Props {
  userId?: string | null
  showRole?: boolean
  size?: 's' | 'm' | 'l'
}

const props = withDefaults(defineProps<Props>(), {
  showRole: false,
  size: 'm',
})

// Use the cached user data composable
const {
  user,
  loading,
  userInitials,
} = useUserData(
  toRef(props, 'userId'),
  {
    includeRole: props.showRole,
    includeAvatar: true,
    userTtl: 10 * 60 * 1000, // 10 minutes
    avatarTtl: 30 * 60 * 1000, // 30 minutes
  },
)

const currentUser = useSupabaseUser()
</script>

<template>
  <div class="user-display">
    <!-- Unauthenticated user state -->
    <Flex v-if="!currentUser" gap="m" y-center class="user-display__header" />

    <!-- Loading state -->
    <Flex v-else-if="loading" gap="m" y-center class="user-display__header">
      <Avatar :size="size">
        ?
      </Avatar>
      <div class="user-display__info">
        <span class="user-display__username user-display__username--loading">Loading...</span>
      </div>
    </Flex>

    <!-- No user state -->
    <Flex v-else-if="!userId" gap="m" y-center class="user-display__header">
      <Avatar :size="size">
        SY
      </Avatar>
      <div class="user-display__info">
        <span class="user-display__username">System</span>
      </div>
    </Flex>

    <!-- User data -->
    <Flex v-else-if="user" gap="m" y-center class="user-display__header">
      <NuxtLink
        :to="`/profile/${user.id}`"
        class="user-display__link"
        :aria-label="`View profile of ${user.username}`"
      >
        <Avatar :size="size" :url="user.avatarUrl || undefined">
          <template v-if="!user.avatarUrl" #default>
            {{ userInitials }}
          </template>
        </Avatar>
      </NuxtLink>
      <div class="user-display__info">
        <Flex gap="xs" x-start y-center wrap>
          <NuxtLink
            :to="`/profile/${user.id}`"
            class="user-display__link"
            :aria-label="`View profile of ${user.username}`"
          >
            <span class="user-display__username">{{ user.username }}</span>
          </NuxtLink>
          <RoleIndicator
            v-if="showRole"
            :role="user.role"
            size="s"
          />
        </Flex>
      </div>
    </Flex>
  </div>
</template>

<style lang="scss" scoped>
.user-display {
  &__username {
    font-weight: var(--font-weight-medium);
    color: var(--color-text);

    &--loading {
      color: var(--color-text-lighter);
    }

    &--error {
      color: var(--color-text-red);
    }
  }

  &__link {
    text-decoration: none;
    color: inherit;
    transition: opacity 0.2s ease;

    &:hover {
      opacity: 0.8;
    }

    .user-display__username {
      &:hover {
        text-decoration: underline;
      }
    }
  }
}
</style>
