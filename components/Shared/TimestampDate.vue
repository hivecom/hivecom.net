<script setup lang="ts">
import { dateFormat } from '@/utils/date'

import { Tooltip } from '@dolanske/vui'

import dayjs from 'dayjs'
import { computed } from 'vue'

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
}>(), {
  format: dateFormat.default,
  tooltip: true,
  fallback: 'N/A',
  placement: 'top',
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
      <div class="timestamp-tooltip">
        {{ tooltipText }}
      </div>
    </template>
    <span class="timestamp-date">{{ formattedDate }}</span>
  </Tooltip>
  <span v-else class="timestamp-date">{{ formattedDate }}</span>
</template>

<style scoped>
.timestamp-date {
  cursor: help;
}
.timestamp-tooltip {
  font-family: monospace;
  font-size: 0.9rem;
  white-space: nowrap;
}
</style>
