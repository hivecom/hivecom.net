<script setup lang="ts">
import type { Tables } from '@/types/database.overrides'
import { theme } from '@dolanske/vui'
import dayjs from 'dayjs'
import { computed } from 'vue'
import EventCalendarDayPopover from '@/components/Events/EventCalendarDayPopover.vue'
import { useDataEvents } from '@/composables/useDataEvents'
import { expandRecurringEvent } from '@/lib/utils/rrule'

// A month always fills the same space, so the Events card stays level with its
// neighbours on a quiet week. The card owns the create modal. This only reports the day.
const emit = defineEmits<{
  create: [date: Date]
}>()

// Evening is when most of our events run
const DEFAULT_EVENT_HOUR = 20

// Six weeks of cells around a 28-day February is the worst case
const GRID_OVERHANG_DAYS = 7

const { events } = useDataEvents()
const user = useSupabaseUser()

const isDark = computed(() => theme.value === 'dark')

// Pinned at mount. A reactive "now" would repaint the grid on every tick.
const month = dayjs().startOf('month')
const windowStart = month.subtract(GRID_OVERHANG_DAYS, 'day')
const windowEnd = month.endOf('month').add(GRID_OVERHANG_DAYS, 'day')

// useDataEvents returns parent rows only, so a series needs expanding or only
// its first occurrence gets a dot
const occurrences = computed(() => {
  const from = windowStart.valueOf()
  const to = windowEnd.valueOf()

  const expanded = events.value.flatMap(event =>
    expandRecurringEvent(event, windowStart.toDate(), windowEnd.toDate()),
  )

  // Expansion only clips recurring rows, so one-offs get clipped to the grid here
  return expanded.filter((event) => {
    const start = dayjs(event.date)
    const end = event.duration_minutes ? start.add(event.duration_minutes, 'minute') : start

    return end.valueOf() >= from && start.valueOf() <= to
  })
})

const calendarAttributes = computed(() => {
  const now = dayjs()

  return occurrences.value.map((event) => {
    const eventStart = dayjs(event.date)
    const eventEnd = event.duration_minutes
      ? eventStart.add(event.duration_minutes, 'minute')
      : null

    const isUpcoming = eventStart.isAfter(now)
    const isOngoing = (() => {
      if (!eventEnd)
        return false

      return eventStart.valueOf() <= now.valueOf() && now.valueOf() <= eventEnd.valueOf()
    })()
    const isPast = eventEnd ? eventEnd.isBefore(now) : eventStart.isBefore(now)

    let color = 'green'

    if (isOngoing) {
      color = 'ongoing'
    }
    else if (isUpcoming) {
      color = event.is_official ? 'future' : 'community'
    }
    else if (isPast) {
      color = 'past'
    }

    const dates = eventEnd
      ? { start: eventStart.toDate(), end: eventEnd.toDate() }
      : eventStart.toDate()

    return {
      // Occurrences share the parent's id. Without the date VCalendar merges the series.
      key: `${event.id}-${event.date}`,
      dates,
      dot: {
        color,
      },
      ...(eventEnd && {
        highlight: {
          color,
        },
      }),
      popover: {
        label: event.title,
        visibility: 'hover',
        hideDelay: 300,
        isInteractive: true,
      },
      customData: event,
    }
  })
})

// VCalendar declares its emits as a string array, so the payload comes through untyped
interface DayClickPayload {
  date: Date
  attributes?: { customData?: Tables<'events'> }[]
}

function onDayClick(day: DayClickPayload) {
  const event = day.attributes?.find(attr => attr.customData)?.customData

  if (event) {
    void navigateTo(`/events/${event.id}`)
    return
  }

  if (!user.value || dayjs(day.date).isBefore(dayjs(), 'day'))
    return

  emit('create', dayjs(day.date).hour(DEFAULT_EVENT_HOUR).minute(0).second(0).millisecond(0).toDate())
}
</script>

<template>
  <ClientOnly>
    <div class="dashboard-calendar">
      <VCalendar
        :attributes="calendarAttributes as any"
        expanded
        transparent
        borderless
        :columns="1"
        :rows="1"
        trim-weeks
        :first-day-of-week="2"
        :is-dark="isDark"
        :initial-page="{ month: month.month() + 1,
                         year: month.year() }"
        @dayclick="onDayClick"
      >
        <template #day-popover="{ dayTitle, attributes }">
          <EventCalendarDayPopover :day-title="dayTitle" :attributes="attributes" />
        </template>
      </VCalendar>
    </div>
  </ClientOnly>
</template>

<style lang="scss">
// Unscoped because every selector targets VCalendar's own DOM
@use '@/assets/calendar.scss';
</style>

<style lang="scss" scoped>
.dashboard-calendar {
  width: 100%;
  // Fills whatever height the neighbouring cards leave. Every layer down to the
  // week rows has to pass it on.
  flex: 1;
  display: flex;
  flex-direction: column;

  :deep(.vc-container),
  :deep(.vc-pane-container),
  :deep(.vc-pane-layout),
  :deep(.vc-pane),
  :deep(.vc-weeks) {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
  }

  // The day stays content-sized: its highlight and dot layers are absolute
  // inside it, so resizing it moves them off the numbers
  :deep(.vc-week) {
    flex: 1;
    align-items: center;
  }

  // The section label already names the month
  :deep(.vc-header) {
    display: none;
  }

  :deep(.vc-pane-layout) {
    border: none;
  }

  // VCalendar insets the week grid by default
  :deep(.vc-weeks) {
    padding: 0;
  }
}
</style>
