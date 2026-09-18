<script setup lang="ts">
import type { Tables } from '@/types/database.overrides'
import { theme } from '@dolanske/vui'
import dayjs from 'dayjs'
import { computed } from 'vue'
import EventCalendarDayPopover from '@/components/Events/EventCalendarDayPopover.vue'
import { useDataEvents } from '@/composables/useDataEvents'
import { expandRecurringEvent } from '@/lib/utils/rrule'

// The month grid on the Events card. It's here because the card's other
// sections are only as tall as the events that happen to exist, and a quiet
// week leaves it a head shorter than the cards beside it. A month always fills
// the same space, and a click on an empty day is the cheapest "organize
// something" affordance we can put on the dashboard.
//
// The card owns the create modal, not this component. All this does is say
// which day was clicked.
const emit = defineEmits<{
  create: [date: Date]
}>()

// The hour a new event lands on when someone picks a day off the grid. Evening
// is when most of ours run, and the form is right there to change it.
const DEFAULT_EVENT_HOUR = 20

// How far past the month edges the grid can reach. Six weeks of cells around a
// 28-day February is the worst case, so a week either side covers every layout.
const GRID_OVERHANG_DAYS = 7

const { events } = useDataEvents()
const user = useSupabaseUser()

const isDark = computed(() => theme.value === 'dark')

// Pinned at mount. A dashboard card doesn't need to roll over at midnight, and
// a reactive "now" would repaint the whole grid on every tick.
const month = dayjs().startOf('month')
const windowStart = month.subtract(GRID_OVERHANG_DAYS, 'day')
const windowEnd = month.endOf('month').add(GRID_OVERHANG_DAYS, 'day')

// useDataEvents returns parent rows only, so a weekly series arrives as a
// single row on its start date. Expand it across the window or every occurrence
// after the first goes undotted.
const occurrences = computed(() => {
  const from = windowStart.valueOf()
  const to = windowEnd.valueOf()

  const expanded = events.value.flatMap(event =>
    expandRecurringEvent(event, windowStart.toDate(), windowEnd.toDate()),
  )

  // Expansion only clips recurring rows. A one-off comes back whatever window
  // it's handed, and `events` is every event we have, so clip to the visible
  // grid rather than building an attribute per event in the table.
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

    // Same palette the events page calendar uses: official upcoming events take
    // the accent, community ones go green.
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

    // An event with a duration spans a range of cells, one without sits on a
    // single day.
    const dates = eventEnd
      ? { start: eventStart.toDate(), end: eventEnd.toDate() }
      : eventStart.toDate()

    return {
      // Expanded occurrences share the parent's id, so the date goes in the key
      // too. Without it VCalendar merges the series into one attribute and
      // styles every occurrence alike.
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
      // Same hover card the events page calendar shows.
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

// VCalendar's emits are declared as a plain string array, so the payload comes
// through untyped. This is the shape we actually read off it.
interface DayClickPayload {
  date: Date
  attributes?: { customData?: Tables<'events'> }[]
}

function onDayClick(day: DayClickPayload) {
  const event = day.attributes?.find(attr => attr.customData)?.customData

  // A day that already has something on it opens that event, the same call the
  // events page calendar makes when a day holds more than one.
  if (event) {
    void navigateTo(`/events/${event.id}`)
    return
  }

  // Empty days are the create affordance, so there's nothing to offer on a day
  // that's already gone or to someone who can't create anything.
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
// Shared with the events page calendar. Unscoped because every selector in it
// targets VCalendar's own DOM.
@use '@/assets/calendar.scss';
</style>

<style lang="scss" scoped>
.dashboard-calendar {
  width: 100%;
  // The section hands this whatever height the neighbouring cards leave, and
  // the week rows share it out, so the grid bottoms out level with them. Every
  // layer between here and the rows has to pass the height down.
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

  // The row takes the extra height and centres its days in it. The day itself
  // stays content-sized, the way it is on the events page: the highlight and
  // dot layers are absolute inside it, so changing its box moves them off the
  // numbers.
  :deep(.vc-week) {
    flex: 1;
    align-items: center;
  }

  // No month title and no arrows: the section label above the grid names the
  // month, and the card links to the full calendar for everything else.
  :deep(.vc-header) {
    display: none;
  }

  // The card already draws the box, so the calendar's own frame would be a box
  // inside a box.
  :deep(.vc-pane-layout) {
    border: none;
  }
}
</style>
