<script setup lang="ts">
import { computed } from 'vue'
import RoleIndicator from '@/components/Shared/RoleIndicator.vue'
import { useCacheUserData } from '@/composables/useCacheUserData'

interface Props {
  /**
   * User ID for standalone fetching. When provided without `role`,
   * the component fetches the user's role automatically.
   */
  userId?: string | null
  /**
   * Pre-resolved role string. When explicitly provided (including null),
   * the component skips fetching and renders based on this value.
   * - `undefined` (not passed) → standalone fetch mode
   * - `null` → controlled mode, no role to display
   * - `'admin'` etc. → controlled mode, display role
   */
  role?: string | null
  size?: 'xs' | 's' | 'm' | 'l'
}

const props = withDefaults(defineProps<Props>(), {
  size: 's',
})

// Determine if we're in controlled mode (role prop was explicitly passed)
const isControlled = computed(() => props.role !== undefined)

// Only fetch when in standalone mode with a valid userId
const {
  user: fetchedUser,
} = useCacheUserData(
  computed(() => (!isControlled.value && props.userId) ? props.userId : null),
  {
    includeRole: true,
    includeAvatar: false,
    userTtl: 10 * 60 * 1000,
    avatarTtl: 30 * 60 * 1000,
  },
)

const resolvedRole = computed(() => {
  if (isControlled.value) {
    return props.role ?? null
  }
  return fetchedUser.value?.role ?? null
})

const shouldDisplay = computed(() => {
  return resolvedRole.value && resolvedRole.value !== 'user'
})
</script>

<template>
  <RoleIndicator
    v-if="shouldDisplay"
    :role="resolvedRole"
    :size="size"
  />
</template>
