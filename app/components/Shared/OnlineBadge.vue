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
  label: 'Online Now',
  size: 'm',
  clickable: false,
})

const emit = defineEmits<{ click: [] }>()

const variant = computed(() => {
  if (props.color)
    return 'neutral'
  return props.count != null && props.count > 0 ? 'success' : 'neutral'
})

const iconSize = computed(() => props.size === 's' ? '8' : '12')
const displayLabel = computed(() => props.singular && props.count === 1 ? props.singular : props.label)
</script>

<template>
  <Skeleton v-if="count === null" width="120" height="22" radius="12" />
  <Badge
    v-else
    :variant
    :size
    :style="{
      whiteSpace: 'nowrap',
      ...(color ? { color } : {}),
      ...(clickable ? { cursor: 'pointer' } : {}),
    }"
    @click="clickable && emit('click')"
  >
    <Icon name="ph:circle-fill" :size="iconSize" :style="color ? { color } : {}" />
    {{ count }} {{ displayLabel }}
  </Badge>
</template>
