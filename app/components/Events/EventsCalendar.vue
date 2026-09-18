<script setup lang="ts">
import type { Tables } from '@/types/database.overrides'
import type { Database } from '@/types/database.types'
import { Button, Flex, Select, Switch, theme } from '@dolanske/vui'
import { useDebounceFn } from '@vueuse/core'
import dayjs from 'dayjs'
import { useCache } from '@/composables/useCache'
import { CACHE_NAMESPACES } from '@/lib/cache/namespaces'
import { useBreakpoint } from '@/lib/mediaQuery'
import { createArray } from '@/lib/utils/common'
import { expandRecurringEvent } from '@/lib/utils/rrule'
import EventCalendarColumnList from './EventCalendarColumnList.vue'
import EventCalendarDayPopover from './EventCalendarDayPopover.vue'

interface SelectOption {
  label: string
  value: string
}

interface Props {
  officialFilter?: boolean | null
}

interface Emits {
  (e: 'openEvent', event: Tables<'events'>): void
  (e: 'create', date: Date): void
}

const props = withDefaults(defineProps<Props>(), {
  officialFilter: null,
})

const emit = defineEmits<Emits>()

const officialFilterOption = ref<SelectOption[] | undefined>(undefined)
const officialFilterOptions: SelectOption[] = [
  { label: 'Official', value: 'official' },
  { label: 'Community', value: 'unofficial' },
]
const resolvedOfficialFilter = computed<boolean | null>(() => {
  if (props.officialFilter != null)
    return props.officialFilter

  const val = officialFilterOption.value?.[0]?.value
  if (val === 'official')
    return true
  if (val === 'unofficial')
    return false

  return null
})

const supabase = useSupabaseClient<Database>()

// ─── Windowed data fetch ──────────────────────────────────────────────────────
// Events are cached a month at a time rather than a window at a time. Stepping
// one month forward keeps the months already in hand and only fetches the one
// that came into view, and the columns paint from cache before the request for
// the missing month even goes out.

const windowedEvents = ref<Tables<'events'>[]>([])
const fetching = ref(false)
const errorMessage = ref('')

const windowCache = useCache(CACHE_NAMESPACES.events)

// Recurring parents are few and needed by every window, so they are one entry
// rather than a slice of each month.
const RECURRING_KEY = 'calendar:recurring'

function monthKey(month: dayjs.Dayjs): string {
  return `calendar:month:${month.format('YYYY-MM')}`
}

// One month of lead-in, so an event that starts before the window but runs into
// it still lands on the calendar.
function windowMonths(start: dayjs.Dayjs, columns: number): dayjs.Dayjs[] {
  return createArray(columns + 2).map((_, index) =>
    start.subtract(1, 'month').add(index, 'month').startOf('month'),
  )
}

function windowId(start: dayjs.Dayjs, columns: number): string {
  return `${start.format('YYYY-MM')}:${columns}`
}

// The window the calendar is currently showing, so a slow response can't
// overwrite the list after the user has paged on.
let activeWindow = ''

function windowRange(start: dayjs.Dayjs, columns: number): { from: dayjs.Dayjs, to: dayjs.Dayjs } {
  return {
    from: start.subtract(1, 'month').startOf('month'),
    to: start.add(columns, 'month').endOf('month'),
  }
}

// Build the visible list out of whatever is cached. Months still in flight
// simply contribute nothing until they land.
function applyWindow(start: dayjs.Dayjs, columns: number): void {
  activeWindow = windowId(start, columns)

  const cached = windowMonths(start, columns)
    .flatMap(month => windowCache.get<Tables<'events'>[]>(monthKey(month)) ?? [])

  const recurring = windowCache.get<Tables<'events'>[]>(RECURRING_KEY) ?? []

  const seen = new Set<number>()
  const merged: Tables<'events'>[] = []
  for (const row of [...cached, ...recurring]) {
    if (!seen.has(row.id)) {
      seen.add(row.id)
      merged.push(row)
    }
  }

  // Recurring events are a single row - expand them into the occurrences that
  // actually fall inside the window.
  const { from, to } = windowRange(start, columns)
  const rows = merged.flatMap(event =>
    expandRecurringEvent(event, from.toDate(), to.toDate()),
  )

  rows.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

  windowedEvents.value = rows
}

async function fetchWindow(start: dayjs.Dayjs, columns: number) {
  const missing = windowMonths(start, columns).filter(month => !windowCache.has(monthKey(month)))
  const needsRecurring = !windowCache.has(RECURRING_KEY)

  if (missing.length === 0 && !needsRecurring)
    return

  fetching.value = true
  errorMessage.value = ''

  try {
    // Missing months are contiguous in practice (they arrive at the edge of the
    // window), so one range query covers them.
    const rangeStart = missing[0]?.startOf('month')
    const rangeEnd = missing.at(-1)?.endOf('month')

    const [monthResult, recurringResult] = await Promise.all([
      rangeStart != null && rangeEnd != null
        ? supabase
            .from('events')
            .select('*')
            .gte('date', rangeStart.toISOString())
            .lte('date', rangeEnd.toISOString())
            .order('date', { ascending: true })
        : Promise.resolve({ data: [], error: null }),
      needsRecurring
        ? supabase
            .from('events')
            .select('*')
            .not('recurrence_rule', 'is', null)
            .order('date', { ascending: true })
        : Promise.resolve({ data: null, error: null }),
    ])

    if (monthResult.error)
      throw monthResult.error
    if (recurringResult.error)
      throw recurringResult.error

    // Bucket by month so each one caches on its own, including the months that
    // came back empty - otherwise a quiet month re-queries on every visit.
    const byMonth = new Map<string, Tables<'events'>[]>()
    for (const month of missing)
      byMonth.set(monthKey(month), [])

    for (const row of (monthResult.data ?? []) as Tables<'events'>[]) {
      const key = monthKey(dayjs(row.date))
      byMonth.get(key)?.push(row)
    }

    for (const [key, rows] of byMonth)
      windowCache.set(key, rows)

    if (needsRecurring)
      windowCache.set(RECURRING_KEY, (recurringResult.data ?? []) as Tables<'events'>[])

    // The user may have paged on while this was in flight.
    if (windowId(start, columns) === activeWindow)
      applyWindow(start, columns)
  }
  catch (err) {
    errorMessage.value = err instanceof Error ? err.message : 'Failed to load events'
  }
  finally {
    fetching.value = false
  }
}

const calendarRef = useTemplateRef<{ move: (page: { year: number, month: number }) => void }>('calendar')

// Initialize with current date and ensure it updates properly
const date = ref(dayjs().startOf('day'))

// Theme detection
const isDark = computed(() => theme.value === 'dark')

const hideRecurring = ref(false)

const filteredEvents = computed(() => {
  let events = windowedEvents.value
  const filter = resolvedOfficialFilter.value
  if (filter !== null)
    events = events.filter(e => e.is_official === filter)
  if (hideRecurring.value)
    events = events.filter(e => !e.recurrence_rule)
  return events
})

// Convert events to calendar attributes
const calendarAttributes = computed(() => {
  const now = dayjs()

  return filteredEvents.value.map((event) => {
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

    // Determine color based on event status
    // Official upcoming events use 'future' (accent), community events use 'community' (green)
    const isOfficial = event.is_official
    let color = 'green'

    if (isOngoing) {
      color = 'ongoing'
    }
    else if (isUpcoming) {
      color = isOfficial ? 'future' : 'community'
    }
    else if (isPast) {
      color = 'past'
    }

    // Create dates object - use range if event has duration, single date otherwise
    const dates = eventEnd
      ? { start: eventStart.toDate(), end: eventEnd.toDate() }
      : eventStart.toDate()

    return {
      // Expanded recurring occurrences share the parent's id, so include the
      // date to keep attribute keys unique. VCalendar otherwise merges the
      // series into one attribute and styles every occurrence alike.
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

// Handle day click events
// The hour a new event lands on when someone picks a day off the grid. Evening
// is when most of ours run, and the form is right there to change it.
const DEFAULT_EVENT_HOUR = 20

const user = useSupabaseUser()

function onDayClick(day: { date: Date, attributes?: Array<{ customData?: Tables<'events'> }> }) {
  const event = day.attributes?.find(attr => attr.customData)?.customData

  // A day with something on it opens the first thing. More than one is what
  // the hover popover is for.
  if (event) {
    emit('openEvent', event)
    return
  }

  // Empty days are the create affordance, same as the dashboard grid, so there
  // is nothing to offer on a day that's gone or to someone signed out.
  if (!user.value || dayjs(day.date).isBefore(dayjs(), 'day'))
    return

  emit('create', dayjs(day.date).hour(DEFAULT_EVENT_HOUR).minute(0).second(0).millisecond(0).toDate())
}

// Dropdown to select how many months to display in calendar. This option is
// overriden by responsive layout options though.
const calendarRowCount = ref(1)

// Format events so that we get a list of events for the next 3 months
// Uses the `date` ref (start of current month) as the reference point

// Hold the starting date of the first month displayed
const startMonth = ref(date.value.startOf('month'))

// Breakpoints
const isTablet = useBreakpoint('<l')
const isMobile = useBreakpoint('<s')

// Store how many columns the calendar renders
const calendarColumns = computed(() => {
  if (isMobile.value) {
    return 1
  }
  else if (isTablet.value) {
    return 2
  }

  return 3
})

// Debounced fetch so rapid month navigation doesn't fire a request per step
const debouncedFetch = useDebounceFn(
  (start: dayjs.Dayjs, columns: number) => fetchWindow(start, columns),
  150,
)

watch(
  [startMonth, calendarColumns] as const,
  ([start, columns]) => {
    // Paint from cache on the spot. Only the months we don't have yet wait for
    // the debounce and the request behind it.
    applyWindow(start, columns)
    void debouncedFetch(start, columns)
  },
  { immediate: true },
)

// Bumped every time VCalendar finishes a pane transition. Used to remount the
// column list teleports, since each transition replaces the pane DOM and a
// mounted Teleport keeps rendering into the detached old pane.
const paneEpoch = ref(0)

// Update startMonth whenever users navigate between months
function updatePaggeIndex(data: { id: string }[]) {
  if (!data[0])
    return

  const navDate = dayjs(data[0].id, 'YYYY-MM')
  startMonth.value = navDate.startOf('month')
}

function moveToToday() {
  calendarRef.value?.move({
    year: date.value.get('year'),
    month: date.value.get('month') + 1,
  })
}

const upcomingEvents = computed(() => {
  const initial = createArray(calendarColumns.value, () => []) as Tables<'events'>[][]
  return filteredEvents.value.reduce((acc, event) => {
    const eventMonth = dayjs(event.date).startOf('month')
    const monthDiff = eventMonth.diff(startMonth.value, 'month')

    // TODO: it would be nice to put an event into multiple months if it spans across them

    if (monthDiff >= 0 && monthDiff < calendarColumns.value) {
      acc[monthDiff]!.push(event)
    }

    return acc
  }, initial)
})

// Page title depending on position relative to now
const pageTitle = computed(() => {
  const totalColumns = calendarColumns.value * calendarRowCount.value

  // Single column: the calendar header already shows the month name
  if (totalColumns === 1)
    return null

  const now = dayjs().startOf('month')
  const endMonth = startMonth.value.add(totalColumns - 1, 'month')

  // Month offset from now to the start of the visible window (0 = current month)
  const startOffset = startMonth.value.diff(now, 'month')

  // Month offset from now to the end of the visible window
  const endOffset = endMonth.diff(now, 'month')

  // Entirely in the past, more than a year ago
  if (endOffset < -11) {
    if (startMonth.value.year() === endMonth.year())
      return `Back in ${startMonth.value.format('YYYY')}`

    return `Back in ${startMonth.value.format('YYYY')} - ${endMonth.format('YYYY')}`
  }

  // Entirely in the future, a year or more out
  if (startOffset > 11) {
    if (startMonth.value.year() === endMonth.year())
      return `In ${startMonth.value.format('YYYY')}`

    return `In ${startMonth.value.format('YYYY')} - ${endMonth.format('YYYY')}`
  }

  // Window contains the current month - describe how far it reaches
  if (startOffset <= 0 && endOffset >= 0)
    return `The next ${endOffset + 1} months`

  // Window is entirely in the past - 1-indexed months ago
  if (endOffset < 0)
    return `${Math.abs(endOffset)}-${Math.abs(startOffset)} months ago`

  // Window is entirely in the future - 1-indexed from next month
  return `The next ${startOffset + 1}-${endOffset + 1} months`
})
</script>

<template>
  <Flex gap="m" class="events-calendar__title" x-between y-center>
    <Flex gap="m" y-center>
      <h2 v-if="pageTitle">
        {{ pageTitle }}
      </h2>
      <Button size="s" plain outline @click="moveToToday">
        Today
      </Button>
    </Flex>
    <Flex gap="xs" y-center>
      <Flex y-center>
        <span class="text-s text-color-lighter">Hide recurring</span>
        <Switch v-model="hideRecurring" />
      </Flex>
      <Select
        v-if="user"
        v-model="officialFilterOption"
        :options="officialFilterOptions"
        placeholder="Official"
        single
        show-clear
        size="s"
      />
    </Flex>
  </Flex>

  <div class="events-calendar">
    <div v-if="errorMessage" class="calendar-error">
      <Flex column gap="l" y-center>
        <Icon name="ph:warning" size="64" class="text-color-red" />
        <p class="text-color-red">
          {{ errorMessage }}
        </p>
      </Flex>
    </div>

    <ClientOnly v-else>
      <div class="events-calendar__layout" :class="{ 'events-calendar__layout--fetching': fetching && windowedEvents.length === 0 }">
        <!-- There are no slots to put content to the footer of a VC calendar column. So we teleport them there instead.
             VCalendar replaces its pane DOM on every move, which would leave a mounted Teleport rendering into a
             detached element. Keying on the pane epoch (and window) remounts the teleports once the transition is
             done so they re-resolve their targets in the fresh panes. -->
        <template v-for="(upcoming, index) in upcomingEvents" :key="`${paneEpoch}-${startMonth.format('YYYY-MM')}-${calendarColumns}-${index}`">
          <Teleport v-if="upcoming.length > 0" :to="`.vc-pane.column-${index + 1}`" defer>
            <EventCalendarColumnList :data="upcoming" />
          </Teleport>
        </template>

        <VCalendar
          ref="calendar"
          v-model="date"
          :attributes="calendarAttributes as any"
          expanded
          :is-dark="isDark"
          transparent
          borderless
          :columns="calendarColumns"
          :rows="calendarRowCount"
          :first-day-of-week="2"
          :initial-page="{ month: date.month() + 1,
                           year: date.year() }"
          @dayclick="onDayClick"
          @did-move="updatePaggeIndex"
          @transition-end="paneEpoch++"
        >
          <template #header-prev-button="{ move }">
            <Button square outline @click="move">
              <Icon name="ph:arrow-left" />
            </Button>
          </template>
          <template #header-next-button="{ move }">
            <Button square outline @click="move">
              <Icon name="ph:arrow-right" />
            </Button>
          </template>

          <template #day-popover="{ dayTitle, attributes }">
            <EventCalendarDayPopover :day-title="dayTitle" :attributes="attributes" />
          </template>
        </VCalendar>
      </div>
    </ClientOnly>
  </div>
</template>

<style lang="scss">
// The .vc-* theme moved to assets so the dashboard month grid can share it.
@use '@/assets/calendar.scss';

.events-calendar {
  display: flex;
  align-items: center;
  justify-content: center;

  &__active-option {
    background-color: var(--color-bg-raised) !important;
  }

  &__title {
    margin-top: var(--space-xl);
    margin-bottom: var(--space-m);
    // margin-bottom: 1.5rem;

    h2 {
      color: var(--color-text);
      font-size: var(--font-size-xl);
      font-weight: var(--font-weight-semibold);
    }
  }

  .vc-container {
    width: 100%;
  }

  &__layout {
    width: 100%;
    transition: opacity var(--transition-slow);

    &--fetching {
      opacity: 0.4;
      pointer-events: none;
    }

    .vc-pane-layout {
      display: grid;
      grid-template-columns: repeat(3, 1fr);

      .vc-pane {
        padding: var(--space-l);
      }

      .vc-pane:not(:last-child) {
        border-right: 1px solid var(--color-border);
      }
    }

    @media (max-width: $breakpoint-m) {
      .vc-pane-layout {
        .vc-pane {
          padding: var(--space-m);
        }
      }
    }
  }
}

.calendar-error {
  padding: 4rem 2rem;
  text-align: center;

  p {
    margin: 0;
    font-size: var(--font-size-m);
  }
}

// Mobile optimizations
@media (max-width: $breakpoint-s) {
  .events-calendar {
    min-height: 300px;
  }
}
</style>
