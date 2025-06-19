<script setup lang="ts">
import { Tooltip } from '@dolanske/vui'

import dayjs from 'dayjs'

import { computed } from 'vue'
import { dateFormat } from '@/utils/date'

// Define props with default values
const props = withDefaults(defineProps<{
  // The date string to format
  date: string | null
  // Optional format to use (will use dateFormat.default if not provided)
  format?: string
  // Enable tooltip with detailed information on hover
  tooltip?: boolean
  // Text to show if date is null
  fallback?: string
  // Tooltip placement
  placement?: 'top' | 'right' | 'bottom' | 'left'
  // Use smaller font size
  size?: 'xxs' | 'xs' | 's' | 'm' | 'l' | 'xl' | 'xxl' | 'xxxl'
}>(), {
  format: dateFormat.default,
  tooltip: true,
  fallback: 'N/A',
  placement: 'top',
  size: 's',
})

// Format the date for display using either the provided format or default
const formattedDate = computed(() => {
  if (!props.date)
    return props.fallback
  return dayjs(props.date).format(props.format)
})

// Generate the detailed tooltip text with full timestamp information
const tooltipText = computed(() => {
  if (!props.tooltip || !props.date)
    return ''

  // Format with milliseconds and timezone info
  const detailed = dayjs(props.date).format('YYYY-MM-DD HH:mm:ss.SSS')
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const offset = new Date(props.date).getTimezoneOffset()
  const offsetSign = offset <= 0 ? '+' : '-'
  const offsetHours = String(Math.abs(Math.floor(offset / 60))).padStart(2, '0')
  const offsetMinutes = String(Math.abs(offset % 60)).padStart(2, '0')

  return `${detailed} (UTC${offsetSign}${offsetHours}:${offsetMinutes}, ${timezone})`
})
</script>

<template>
  <Tooltip v-if="tooltip && date" :placement="placement">
    <template #tooltip>
      <div class="text-xs">
        {{ tooltipText }}
      </div>
    </template>
    <span class="timestamp-date" :class="`text-${size}`">{{ formattedDate }}</span>
  </Tooltip>
  <span v-else class="timestamp-date" :class="`text-${size}`">{{ formattedDate }}</span>
</template>

<style scoped lang="scss">
.timestamp-date {
  cursor: help;
}
</style>
