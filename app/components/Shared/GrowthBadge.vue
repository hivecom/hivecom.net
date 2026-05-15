<script setup lang="ts">
import { Badge, BadgeGroup } from '@dolanske/vui'

interface Props {
  growth: number | null
  value?: number | null
  prefix?: string
  size?: 's' | 'm' | 'l'
  showIcon?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  value: null,
  prefix: '',
  size: 's',
  showIcon: false,
})

function getGrowthIndicator(growth: number | null) {
  if (growth === null)
    return { variant: 'neutral' as const, icon: 'ph:minus', text: 'No data' }
  if (growth > 0)
    return { variant: 'success' as const, icon: 'ph:trend-up', text: `+${growth.toFixed(1)}%` }
  if (growth < 0)
    return { variant: 'danger' as const, icon: 'ph:trend-down', text: `${growth.toFixed(1)}%` }
  return { variant: 'neutral' as const, icon: 'ph:minus', text: '0%' }
}

const iconSize = computed(() => {
  if (props.size === 'l')
    return 16
  if (props.size === 'm')
    return 14
  return 12
})

const indicator = computed(() => getGrowthIndicator(props.growth))

const valueVariant = computed(() => {
  if (props.value === null || props.value === undefined)
    return 'neutral'
  return props.value > 0 ? 'success' : props.value < 0 ? 'danger' : 'neutral'
})

const valueText = computed(() => {
  if (props.value === null || props.value === undefined)
    return ''
  return `${props.value > 0 ? '+' : ''}${props.prefix}${props.value}`
})
</script>

<template>
  <BadgeGroup v-if="value !== null && value !== undefined">
    <Badge :variant="valueVariant" :size="size" circle filled>
      {{ valueText }}
    </Badge>
    <Badge v-if="growth !== null" :variant="indicator.variant" :size="size">
      {{ indicator.text }}
      <Icon v-if="showIcon" :name="indicator.icon" :size="iconSize" />
    </Badge>
  </BadgeGroup>
  <Badge v-else-if="growth !== null" :variant="indicator.variant" :size="size">
    {{ indicator.text }}
    <Icon v-if="showIcon" :name="indicator.icon" :size="iconSize" />
  </Badge>
</template>
