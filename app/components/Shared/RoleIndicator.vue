<script setup lang="ts">
import { Badge } from '@dolanske/vui'

interface Props {
  role: string | null | undefined
  size?: 'xs' | 's' | 'm' | 'l'
}

const props = withDefaults(defineProps<Props>(), {
  size: 's',
})

// Get role display text
const roleDisplay = computed(() => {
  const role = props.role || 'user'
  return role.charAt(0).toUpperCase() + role.slice(1)
})

// Get variant based on role
const variant = computed(() => {
  switch (props.role) {
    case 'admin':
      return 'danger'
    case 'moderator':
      return 'info'
    default:
      return 'success'
  }
})
</script>

<template>
  <Badge
    :variant="variant"
    :size="size"
  >
    {{ roleDisplay }}
  </Badge>
</template>
