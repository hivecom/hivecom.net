<script setup lang="ts">
import { computed } from 'vue'
import RoleIndicator from '@/components/Shared/RoleIndicator.vue'
import { useCacheUserData } from '@/composables/useCacheUserData'

interface Props {
  userId?: string | null
  size?: 'xs' | 's' | 'm' | 'l'
  /**
   * Pre-resolved role. When provided the cache lookup is skipped entirely -
   * use this when the parent already has the role (e.g. from useBulkUserData)
   * to avoid N individual user_roles queries for list renders.
   */
  role?: string | null
}

const props = withDefaults(defineProps<Props>(), {
  size: 's',
  role: undefined,
})

// Only call useCacheUserData when the parent hasn't supplied a role.
// The composable is called unconditionally (no conditional hook calls) but
// includeRole is set to false when the prop is present so it skips the fetch.
const { user } = useCacheUserData(
  computed(() => props.role !== undefined ? null : (props.userId ?? null)),
  {
    includeRole: props.role === undefined,
    includeAvatar: false,
    userTtl: 10 * 60 * 1000,
    avatarTtl: 30 * 60 * 1000,
  },
)

const role = computed(() => props.role !== undefined ? props.role : (user.value?.role ?? null))

const shouldDisplay = computed(() => {
  return role.value && role.value !== 'user'
})
</script>

<template>
  <RoleIndicator
    v-if="shouldDisplay"
    :role="role"
    :size="size"
  />
</template>
