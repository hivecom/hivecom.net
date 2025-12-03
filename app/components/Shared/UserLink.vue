<script setup lang="ts">
import { CopyClipboard, Flex, Skeleton } from '@dolanske/vui'
import UserPreviewHover from '@/components/Shared/UserPreviewHover.vue'
import { useUserData } from '@/composables/useUserData'

const props = defineProps<{
  userId: string | null
  placeholder?: string
}>()

// Use the cached user data composable
const {
  user,
  loading,
} = useUserData(
  toRef(props, 'userId'),
  {
    includeRole: false, // We only need username for this component
    includeAvatar: false, // No avatar needed
    userTtl: 10 * 60 * 1000, // 10 minutes
  },
)

const currentUser = useSupabaseUser()
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
      <CopyClipboard :text="props.userId" confirm>
        <Icon name="ph:copy" size="14" />
      </CopyClipboard>
    </Flex>
  </div>

  <div v-else class="user-display">
    <UserPreviewHover :user-id="props.userId" class="user-link__hover">
      <Flex gap="xs" y-center>
        <NuxtLink
          :to="`/profile/${props.userId}`"
          class="username-link text-s"
          :aria-label="`View profile of ${user.username || 'user'}`"
        >
          {{ user.username || props.userId }}
        </NuxtLink>
        <CopyClipboard :text="props.userId" confirm>
          <Icon name="ph:copy" size="14" />
        </CopyClipboard>
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
