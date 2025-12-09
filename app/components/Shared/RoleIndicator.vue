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
  const normalized = role.replace(/[-_]/g, ' ')
  return normalized
    .split(' ')
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
})

// Get variant based on role
const variant = computed(() => {
  switch (props.role) {
    case 'admin':
      return 'danger'
    case 'moderator':
      return 'info'
    case 'music-bot':
      return 'warning'
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
