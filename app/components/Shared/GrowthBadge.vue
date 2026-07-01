<script setup lang="ts">
import { Badge, BadgeGroup } from '@dolanske/vui'
import { computed } from 'vue'
import { formatPercent } from '@/lib/utils/formatting'

interface Props {
  growth: number | null
  // Pre-formatted display value (e.g. from formatCurrency or formatCount).
  // Pass null to render the growth badge alone without a value badge.
  value?: string | null
  size?: 's' | 'm' | 'l'
  showIcon?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  value: null,
  size: 's',
  showIcon: false,
})

function getGrowthIndicator(growth: number | null) {
  if (growth === null)
    return { variant: 'neutral' as const, icon: 'ph:minus', text: 'No data' }
  if (growth > 0)
    return { variant: 'success' as const, icon: 'ph:trend-up', text: `+${formatPercent(growth)}` }
  if (growth < 0)
    return { variant: 'danger' as const, icon: 'ph:trend-down', text: formatPercent(growth) }
  return { variant: 'neutral' as const, icon: 'ph:minus', text: formatPercent(0) }
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
  // Infer sentiment from sign prefix on the formatted string
  if (props.value.startsWith('+'))
    return 'success'
  if (props.value.startsWith('-'))
    return 'danger'
  return 'neutral'
})
</script>

<template>
  <BadgeGroup v-if="value !== null && value !== undefined">
    <Badge :variant="valueVariant" :size="size" circle filled>
      {{ value }}
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
