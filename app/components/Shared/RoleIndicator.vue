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
    :class="`role-indicator role-indicator--${role || 'user'}`"
  >
    {{ roleDisplay }}
  </Badge>
</template>

<style lang="scss" scoped>
.role-indicator {
  width: fit-content;

  &--admin {
    background-color: var(--color-bg-red-lowered);
    color: var(--color-text-red);
  }

  &--moderator {
    background-color: var(--color-bg-blue-lowered);
    color: var(--color-text-blue);
  }

  &--user {
    background-color: var(--color-bg-green-lowered);
    color: var(--color-text-green);
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

    &--user {
      background-color: var(--color-bg-green-raised);
      color: var(--color-text-invert);
    }
  }
}
</style>
