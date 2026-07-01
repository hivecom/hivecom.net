<script setup lang="ts">
import { Tooltip } from '@dolanske/vui'
import { computed } from 'vue'
import {
  displayDate,
  displayDateTime,
  fromNow,
  fullDate,
  fullDateLong,
  fullDateTime,
  fullDateTimeWeekday,
  fullMonth,
  timestamp,
  yearOnly,
} from '@/lib/utils/date'

export type DateDisplayType
  = | 'displayDate'
    | 'displayDateTime'
    | 'fullDate'
    | 'fullDateLong'
    | 'fullDateTime'
    | 'fullDateTimeWeekday'
    | 'fullMonth'
    | 'timestamp'
    | 'year'

const props = withDefaults(defineProps<{
  // The date string to format
  date: string | null
  // Which named format to use (defaults to fullDateTime)
  type?: DateDisplayType
  // Render a human-readable relative time (e.g. "5 minutes ago") instead of a
  // formatted date. The tooltip still shows the precise timestamp.
  relative?: boolean
  // Enable tooltip with detailed information on hover
  tooltip?: boolean
  // Text to show if date is null
  fallback?: string
  // Tooltip placement
  placement?: 'top' | 'right' | 'bottom' | 'left'
  // Use smaller font size
  size?: 'xxs' | 'xs' | 's' | 'm' | 'l' | 'xl' | 'xxl' | 'xxxl'
}>(), {
  type: 'fullDateTime',
  relative: false,
  tooltip: true,
  fallback: 'N/A',
  placement: 'top',
  size: 's',
})

const formatters: Record<DateDisplayType, (d: string | Date | null | undefined) => string> = {
  displayDate,
  displayDateTime,
  fullDate,
  fullDateLong,
  fullDateTime,
  fullDateTimeWeekday,
  fullMonth,
  timestamp,
  year: yearOnly,
}

const formattedDate = computed(() => {
  if (!props.date)
    return props.fallback
  if (props.relative)
    return fromNow(props.date)
  return formatters[props.type](props.date)
})

// Generate the detailed tooltip text with full timestamp information
const tooltipText = computed(() => {
  if (!props.tooltip || !props.date)
    return ''

  const d = new Date(props.date)
  if (Number.isNaN(d.getTime()))
    return ''

  const detailed = d.toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, '')
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const offset = d.getTimezoneOffset()
  const offsetSign = offset <= 0 ? '+' : '-'
  const offsetHours = String(Math.abs(Math.floor(offset / 60))).padStart(2, '0')
  const offsetMinutes = String(Math.abs(offset % 60)).padStart(2, '0')

  return `${detailed} UTC (UTC${offsetSign}${offsetHours}:${offsetMinutes}, ${timezone})`
})

const attrs = useAttrs()
</script>

<template>
  <Tooltip v-if="tooltip && date" :placement="placement">
    <template #tooltip>
      <div class="text-xs">
        {{ tooltipText }}
      </div>
    </template>
    <slot>
      <span class="timestamp-date" v-bind="attrs" :class="`text-${size}`">{{ formattedDate }}</span>
    </slot>
  </Tooltip>
  <span v-else class="timestamp-date" v-bind="attrs" :class="`text-${size}`">{{ formattedDate }}</span>
</template>

<style lang="scss">
.timestamp-date {
  cursor: help;
}
</style>
