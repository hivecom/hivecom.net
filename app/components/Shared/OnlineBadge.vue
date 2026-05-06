<script setup lang="ts">
import { Badge, Skeleton } from '@dolanske/vui'
import { computed } from 'vue'

interface Props {
  count: number | null
  label?: string
  size?: 's' | 'm' | 'l'
  clickable?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  label: 'Online Now',
  size: 'm',
  clickable: false,
})

const emit = defineEmits<{ click: [] }>()

const variant = computed(() => props.count != null && props.count > 0 ? 'success' : 'neutral')
</script>

<template>
  <Skeleton v-if="count === null" width="120" height="22" radius="12" />
  <Badge
    v-else :variant :size :style="clickable ? { cursor: 'pointer',
                                                whiteSpace: 'nowrap' } : { whiteSpace: 'nowrap' }" @click="clickable && emit('click')"
  >
    <Icon name="ph:circle-fill" />
    {{ count }} {{ label }}
  </Badge>
</template>
