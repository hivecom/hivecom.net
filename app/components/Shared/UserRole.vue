<script setup lang="ts">
import { computed } from 'vue'
import RoleIndicator from '@/components/Shared/RoleIndicator.vue'
import { useDataUser } from '@/composables/useDataUser'

interface Props {
  userId?: string | null
  size?: 'xs' | 's' | 'm' | 'l'
  tiny?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  size: 's',
  tiny: false,
})

const { user } = useDataUser(
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
    :size="props.size"
    :tiny="props.tiny"
  />
</template>
