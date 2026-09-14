<script setup lang="ts">
import { Tooltip } from '@dolanske/vui'
import { computed } from 'vue'
import { useNow } from '@/composables/useNow'
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
  timestampDetail,
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

// Shared tick so relative labels age on their own rather than freezing at
// whatever the first render computed.
const { now } = useNow()

const relativeText = computed(() => (props.date ? fromNow(props.date, now.value) : ''))

const formattedDate = computed(() => {
  if (!props.date)
    return props.fallback
  if (props.relative)
    return relativeText.value

  return formatters[props.type](props.date)
})

// Exact instant plus the viewer's zone, shown on hover.
const detail = computed(() => (props.tooltip ? timestampDetail(props.date) : null))

const attrs = useAttrs()
</script>

<template>
  <Tooltip v-if="tooltip && date && detail" :placement="placement">
    <template #tooltip>
      <div class="text-xs">
        {{ detail.absolute }}<span v-if="relativeText"> ({{ relativeText }})</span>
      </div>
      <div class="text-xs text-color-lightest">
        {{ detail.zone }}
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
