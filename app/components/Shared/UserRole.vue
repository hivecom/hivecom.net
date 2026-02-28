<script setup lang="ts">
import { computed } from 'vue'
import RoleIndicator from '@/components/Shared/RoleIndicator.vue'
import { useCacheUserData } from '@/composables/useCacheUserData'

interface Props {
  userId?: string | null
  size?: 'xs' | 's' | 'm' | 'l'
}

const props = withDefaults(defineProps<Props>(), {
  size: 's',
})

const {
  user,
} = useCacheUserData(
  computed(() => props.userId ?? null),
  {
    includeRole: true,
    includeAvatar: false,
    userTtl: 10 * 60 * 1000,
    avatarTtl: 30 * 60 * 1000,
  },
)

const role = computed(() => user.value?.role ?? null)

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
