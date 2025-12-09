<script setup lang="ts">
import { Flex, Skeleton } from '@dolanske/vui'
import { computed } from 'vue'
import UserPreviewHover from '@/components/Shared/UserPreviewHover.vue'
import { useCacheUserData } from '@/composables/useCacheUserData'

const props = defineProps<{
  userId: string | null
  placeholder?: string
}>()

// Use the cached user data composable
const {
  user,
  loading,
} = useCacheUserData(
  toRef(props, 'userId'),
  {
    includeRole: false, // We only need username for this component
    includeAvatar: false, // No avatar needed
    userTtl: 10 * 60 * 1000, // 10 minutes
  },
)

const currentUser = useSupabaseUser()

const profileLink = computed(() => {
  if (user.value?.username)
    return `/profile/${user.value.username}`
  return `/profile/${props.userId}`
})
</script>

<template>
  <!-- Only show content if user is authenticated -->
  <div v-if="!currentUser" class="text-xs user-display">
    {{ props.placeholder || 'Sign-in to view' }}
  </div>

  <div v-else-if="!props.userId" class="user-display">
    {{ props.placeholder || 'None assigned' }}
  </div>

  <div v-else-if="loading" class="user-display">
    <Skeleton :width="120" :height="20" :radius="4" />
  </div>

  <div v-else-if="!user" class="user-display">
    <Flex gap="xs" x-center>
      <span class="text-xs color-error">Failed to load user</span>
    </Flex>
  </div>

  <div v-else class="user-display">
    <UserPreviewHover :user-id="props.userId" class="user-link__hover">
      <Flex gap="xs" y-center>
        <NuxtLink
          :to="profileLink"
          class="username-link text-s"
          :aria-label="`View profile of ${user.username || 'user'}`"
        >
          {{ user.username || props.userId }}
        </NuxtLink>
      </Flex>
    </UserPreviewHover>
  </div>
</template>

<style scoped lang="scss">
.user-display {
  display: inline-block;
}

.user-link__hover {
  display: inline-flex;
}

.username-link {
  color: var(--color-primary);
  text-decoration: none;
  cursor: pointer;
}

.username-link:hover {
  text-decoration: underline;
}
</style>
