<script setup lang="ts">
import { Badge, Tooltip } from '@dolanske/vui'
import { computed } from 'vue'
import BadgeCircle from './BadgeCircle.vue'

interface Props {
  role: string | null | undefined
  size?: 'xs' | 's' | 'm' | 'l'
  /** Show a single-letter badge with full label on hover. */
  shorten?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  size: 's',
  shorten: false,
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

const shortDisplay = computed(() => {
  if (!props.shorten)
    return roleDisplay.value

  switch (props.role) {
    case 'admin':
      return 'A'
    case 'moderator':
      return 'M'
    case 'registered':
      return 'R'
    case 'music-bot':
      return 'B'
    default:
      return roleDisplay.value.charAt(0)
  }
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
  <Tooltip v-if="props.shorten" placement="top">
    <BadgeCircle
      :variant="variant"
      :size="props.size"
    >
      {{ shortDisplay }}
    </BadgeCircle>
    <template #tooltip>
      <span class="text-xs">{{ roleDisplay }}</span>
    </template>
  </Tooltip>
  <Badge
    v-else
    :variant="variant"
    :size="props.size"
  >
    {{ roleDisplay }}
  </Badge>
</template>
