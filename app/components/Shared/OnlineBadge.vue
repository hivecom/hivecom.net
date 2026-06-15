<script setup lang="ts">
import { Badge, Skeleton } from '@dolanske/vui'
import { computed } from 'vue'

interface Props {
  count: number | null
  label?: string
  singular?: string
  size?: 's' | 'm' | 'l'
  clickable?: boolean
  color?: string
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
const displayLabel = computed(() => props.singular && props.count === 1 ? props.singular : props.label)
</script>

<template>
  <ClientOnly>
    <Skeleton v-if="count === null" width="120" height="24" radius="12" />
    <Badge
      v-else
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
      {{ count }} {{ displayLabel }}
    </Badge>
    <template #fallback>
      <Skeleton width="120" height="24" radius="12" />
    </template>
  </ClientOnly>
</template>
