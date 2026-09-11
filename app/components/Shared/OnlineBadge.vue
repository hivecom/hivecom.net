<script setup lang="ts">
import { Badge } from '@dolanske/vui'
import { computed } from 'vue'

interface Props {
  count: number | null
  label?: string
  singular?: string
  size?: 's' | 'm' | 'l'
  clickable?: boolean
  color?: string
  /** Extra text appended after the count, separated by a slash. */
  suffix?: string
}

const props = withDefaults(defineProps<Props>(), {
  label: 'Online',
  size: 'm',
  clickable: false,
})

const emit = defineEmits<{ click: [] }>()

const isActive = computed(() => props.count != null && props.count > 0)

const variant = computed(() => {
  if (props.color && isActive.value)
    return 'neutral'
  return isActive.value ? 'success' : 'neutral'
})

const iconSize = computed(() => props.size === 's' ? '8' : '12')
// A null count means no data yet, which reads the same as zero on a badge.
const shownCount = computed(() => props.count ?? 0)
const displayLabel = computed(() => props.singular && shownCount.value === 1 ? props.singular : props.label)
const text = computed(() => {
  const base = displayLabel.value ? `${shownCount.value} ${displayLabel.value}` : `${shownCount.value}`
  return props.suffix ? `${base} / ${props.suffix}` : base
})
</script>

<template>
  <Badge
    :variant
    :size
    :style="{
      whiteSpace: 'nowrap',
      ...(color && isActive ? { color } : {}),
      ...(!isActive ? { color: 'var(--color-text-lighter)' } : {}),
      ...(clickable ? { cursor: 'pointer' } : {}),
    }"
    @click="clickable && emit('click')"
  >
    <Icon name="ph:circle-fill" :size="iconSize" :style="color && isActive ? { color } : (!isActive ? { color: 'var(--color-text-lighter)' } : {})" />
    {{ text }}
  </Badge>
</template>
