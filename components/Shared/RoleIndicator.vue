<script setup lang="ts">
import { Badge } from '@dolanske/vui'

interface Props {
  role: string
  size?: 'xs' | 's' | 'm' | 'l'
}

const props = withDefaults(defineProps<Props>(), {
  size: 's',
})

// Get role display text
const roleDisplay = computed(() => {
  return props.role.charAt(0).toUpperCase() + props.role.slice(1)
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
    :class="`role-indicator--${role}`"
  >
    {{ roleDisplay }}
  </Badge>
</template>

<style lang="scss" scoped>
.role-indicator {
  &--admin {
    background-color: var(--color-bg-red-lowered);
    color: var(--color-text-red);
  }

  &--moderator {
    background-color: var(--color-bg-blue-lowered);
    color: var(--color-text-blue);
  }
}

:root.light {
  .role-indicator {
    &--admin {
      background-color: var(--color-bg-red-raised);
      color: var(--color-text-invert);
    }

    &--moderator {
      background-color: var(--color-bg-blue-raised);
      color: var(--color-text-invert);
    }
  }
}
</style>
