<script setup lang="ts">
import type { Tables } from '@/types/database.types'
import { Button, Flex, theme } from '@dolanske/vui'
import dayjs from 'dayjs'
import { useBreakpoint } from '@/lib/mediaQuery'
import { createArray } from '@/lib/utils/common'
import { dateFormat } from '@/lib/utils/date'
import EventCalendarColumnList from './EventCalendarColumnList.vue'

interface Props {
  events: Tables<'events'>[] | undefined
  loading: boolean
  errorMessage: string
}

interface Emits {
  (e: 'openEvent', event: Tables<'events'>): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

const calendarRef = useTemplateRef('calendar')

// Initialize with current date and ensure it updates properly
const date = ref(dayjs().startOf('day'))

// Theme detection
const isDark = computed(() => theme.value === 'dark')

// Convert events to calendar attributes
const calendarAttributes = computed(() => {
  if (!props.events)
    return []

  const now = dayjs()

  return props.events.map((event) => {
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
    let color = 'green'

    if (isOngoing) {
      color = 'ongoing'
    }
    else if (isUpcoming) {
      color = 'future'
    }
    else if (isPast) {
      color = 'past'
    }

    // Create dates object - use range if event has duration, single date otherwise
    const dates = eventEnd
      ? { start: eventStart.toDate(), end: eventEnd.toDate() }
      : eventStart.toDate()

    return {
      key: event.id,
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

// Format event duration for display
function formatEventDuration(event: Tables<'events'>) {
  if (!event.duration_minutes)
    return ''

  const eventStart = dayjs(event.date)
  const eventEnd = eventStart.add(event.duration_minutes, 'minute')

  // If it spans multiple days, show the date range
  if (eventEnd.format(dateFormat.calendarDefault) !== eventStart.format(dateFormat.calendarDefault)) {
    const daysDiff = Math.ceil(eventEnd.diff(eventStart, 'day', true))
    return `${daysDiff} day${daysDiff > 1 ? 's' : ''}`
  }

  // Otherwise show hours/minutes
  const hours = Math.floor(event.duration_minutes / 60)
  const minutes = event.duration_minutes % 60

  if (hours === 0)
    return `${minutes}m`
  if (minutes === 0)
    return `${hours}h`
  return `${hours}h ${minutes}m`
}

// Handle day click events
function onDayClick(day: { attributes?: Array<{ customData?: Tables<'events'> }> }) {
  // Find events for this day
  const dayEvents = day.attributes
    ?.filter(attr => attr.customData)
    ?.map(attr => attr.customData!)

  if (dayEvents && dayEvents.length > 0 && dayEvents[0]) {
    // If only one event, open it directly
    if (dayEvents.length === 1) {
      emit('openEvent', dayEvents[0])
    }
    else {
      // If multiple events, could show a list or open the first one
      emit('openEvent', dayEvents[0])
    }
  }
}

// Navigate to event page
function navigateToEvent(event: Tables<'events'>) {
  navigateTo(`/events/${event.id}`)
}

// Format event time for display
function formatEventTime(event: Tables<'events'>) {
  const eventDate = dayjs(event.date)
  return eventDate.format('h:mm A')
}

// Check if we should show time for this event on this day
function shouldShowTime(event: Tables<'events'>, dayTitle: string) {
  const eventStart = dayjs(event.date)
  const eventEnd = event.duration_minutes
    ? eventStart.add(event.duration_minutes, 'minute')
    : null

  // If it's not a multi-day event, always show time
  if (!eventEnd || eventEnd.toString() === eventStart.toString()) {
    return true
  }

  // For multi-day events, only show time on the start day
  // Parse the dayTitle to get the date (format is like "Monday, Jun 16, 2025")
  const dayDate = dayjs(dayTitle)
  return dayDate.format(dateFormat.calendarDefault) === eventStart.format(dateFormat.calendarDefault)
}

// Dropdown to select how many months to display in calendar. This option is
// overriden by responsive layout options though.
const calendarRowCount = ref(1)

// NOTE (@dolanske): Adding more rows to the calendar would require changing the
// column logic some more and it's a little too complicated. We can implement it
// as a nice-to-have at some point later

// const calendarRowOptions = [{
//   label: '3 months',
//   value: 1,
// }, {
//   label: '6 months',
//   value: 2,
// }, {
//   label: '12 months',
//   value: 4,
// }]

// const dropdown = useTemplateRef('dropdownRef')

// function setCalendarRowCount(count: number) {
//   calendarRowCount.value = count
//   dropdown.value?.close()
// }

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

// Update startMonth whenever users navigate between months
function updatePaggeIndex(data: { id: string }[]) {
  if (!data[0])
    return

  const date = dayjs(data[0].id, 'YYYY-MM')
  startMonth.value = date.startOf('month')
}

function moveToToday() {
  calendarRef.value?.move({
    year: date.value.get('year'),
    month: date.value.get('month') + 1,
  })
}

const upcomingEvents = computed(() => {
  if (!props.events)
    return createArray(calendarColumns.value, () => [])

  // eslint-disable-next-line ts/no-explicit-any
  return props.events.reduce((acc: any, event) => {
    const eventMonth = dayjs(event.date).startOf('month')
    const monthDiff = eventMonth.diff(startMonth.value, 'month')

    // TODO: it would be nice to put an event into multiple months if it spans across them

    if (monthDiff >= 0 && monthDiff < calendarColumns.value) {
      acc[monthDiff].push(event)
    }

    return acc
  }, createArray(calendarColumns.value, () => []))
})

// Page title depending on amount of months
const pageTitle = computed(() => {
  if (isMobile.value && calendarRowCount.value === 1) {
    return 'This month'
  }

  return `Next ${calendarColumns.value * calendarRowCount.value} months`
})
</script>

<template>
  <Flex gap="m" class="events-calendar__title" y-center>
    <h2>
      {{ pageTitle }}
    </h2>

    <Button size="s" plain outline @click="moveToToday">
      Today
    </Button>

    <!-- <Dropdown ref="dropdownRef">
      <template #trigger="{ toggle }">
        <Button size="s" plain outline @click="toggle">
          {{ calendarRowOptions.find(({ value }) => value === calendarRowCount)?.label }}
          <template #end>
            <Icon name="ph:caret-down" />
          </template>
        </Button>
      </template>
      <DropdownItem
        v-for="option in calendarRowOptions"
        :key="option.value"
        :class="{ 'event-calendar__active-option': option.value === calendarRowCount }"
        @click="setCalendarRowCount(option.value)"
      >
        {{ option.label }}
      </DropdownItem>
    </Dropdown> -->
  </Flex>

  <div class="events-calendar">
    <div v-if="loading" class="calendar-loading">
      <Flex column gap="l" y-center>
        <Icon name="ph:calendar" size="64" class="text-color-lighter" />
        <p class="text-color-lighter">
          Loading events...
        </p>
      </Flex>
    </div>

    <div v-else-if="errorMessage" class="calendar-error">
      <Flex column gap="l" y-center>
        <Icon name="ph:warning" size="64" class="text-color-red" />
        <p class="text-color-red">
          {{ errorMessage }}
        </p>
      </Flex>
    </div>

    <ClientOnly v-else>
      <div class="events-calendar__layout">
        <!-- There are no slots to put content to the footer of a VC calendar column. So we teleport them there instead -->
        <template v-for="(upcoming, index) in upcomingEvents" :key="upcoming">
          <Teleport v-if="upcoming.length > 0" :to="`.vc-pane.column-${index as number + 1}`" defer>
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
            <div class="event-popover">
              <div v-if="attributes.length === 0" class="event-popover__empty">
                No events scheduled
              </div>
              <div v-else class="event-popover__content">
                <div class="event-popover__count">
                  <Icon name="ph:calendar-check" size="16" class="event-popover__icon" />
                  {{ attributes.length }} event{{ attributes.length > 1 ? 's' : '' }}
                </div>
                <ul class="event-popover__list">
                  <li
                    v-for="{ key, customData } in attributes"
                    :key="key"
                    class="event-popover__item"
                    @click="navigateToEvent(customData)"
                  >
                    <div class="event-popover__item-header">
                      <div class="event-popover__title">
                        {{ customData.title }}
                      </div>
                      <div v-if="shouldShowTime(customData, dayTitle)" class="event-popover__time">
                        {{ formatEventTime(customData) }}
                      </div>
                    </div>
                    <Flex y-center>
                      <div v-if="customData.location" class="event-popover__location">
                        <Icon name="ph:map-pin" size="12" />
                        {{ customData.location }}
                      </div>                  <div v-if="customData.duration_minutes" class="event-popover__duration">
                        <Icon name="ph:clock" size="12" />
                        {{ formatEventDuration(customData) }}
                      </div>
                    </Flex>

                    <div class="event-popover__action">
                      <Icon name="ph:arrow-right" size="12" />
                      View details
                    </div>
                  </li>
                </ul>
              </div>
            </div>
          </template>
        </VCalendar>
      </div>
    </ClientOnly>
  </div>
</template>

<style lang="scss">
@use '@/assets/breakpoints.scss' as *;

.events-calendar {
  display: flex;
  align-items: center;
  justify-content: center;

  &__active-option {
    background-color: var(--color-bg-raised) !important;
  }

  &__title {
    margin-bottom: 1.5rem;

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

.calendar-loading,
.calendar-error {
  padding: 4rem 2rem;
  text-align: center;

  p {
    margin: 0;
    font-size: var(--font-size-m);
  }
}

.event-popover {
  padding: 0;
  min-width: 288px;
  max-width: 340px;
  overflow: hidden;

  &__header {
    font-weight: var(--font-weight-semibold);
    color: var(--color-text);
    font-size: var(--font-size-s);
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    text-align: left;
  }

  &__icon {
    color: var(--color-accent);
  }

  &__content {
    padding: var(--space-s);
    background: var(--color-bg);
  }

  &__count {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    font-size: var(--font-size-xs);
    color: var(--color-text-lighter);
    margin-bottom: var(--space-s);
    font-weight: var(--font-weight-medium);
  }

  &__empty {
    padding: var(--space-l);
    text-align: center;
    color: var(--color-text-lighter);
    font-size: var(--font-size-s);
    font-style: italic;
  }

  &__list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }

  &__item {
    padding: var(--space-s);
    cursor: pointer;
    border-radius: var(--border-radius-s);
    transition: all 0.15s ease;
    background: var(--color-bg-medium);
    border: 1px solid var(--color-border);

    &:hover {
      background-color: var(--color-bg-raised);
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
    }

    &:last-child {
      margin-bottom: 0;
    }
  }

  &__item-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: var(--space-xs);
    gap: var(--space-s);
  }

  &__title {
    font-weight: var(--font-weight-semibold);
    color: var(--color-text);
    font-size: var(--font-size-s);
    line-height: 1.3;
    flex: 1;
    text-align: left;
  }

  &__time {
    color: var(--color-accent);
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-semibold);
    white-space: nowrap;
    background: var(--color-accent-muted);
    padding: 2px 6px;
    border-radius: var(--border-radius-xs);
  }

  &__location,
  &__duration {
    color: var(--color-text-lighter);
    font-size: var(--font-size-xs);
    display: flex;
    align-items: center;
    gap: var(--space-xxs);
    margin-bottom: var(--space-xxs);
    line-height: 1.3;
  }

  &__rsvp {
    margin-bottom: var(--space-xxs);

    // Override badge styling to fit popover
    .vui-badge {
      font-size: var(--font-size-xxs);
      padding: 2px 6px;
    }
  }

  &__action {
    color: var(--color-accent);
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-semibold);
    display: flex;
    align-items: center;
    gap: var(--space-xxs);
    margin-top: var(--space-xs);
    opacity: 0.7;
    transition: opacity 0.15s ease;
  }

  &__item:hover &__action {
    opacity: 1;
  }
}

// Custom VCalendar styling
.vc-container {
  --vc-border-color: var(--color-border);
  --vc-accent-50: var(--color-accent-muted);
  --vc-accent-100: var(--color-accent-muted);
  --vc-accent-200: var(--color-accent);
  --vc-accent-300: var(--color-accent);
  --vc-accent-400: var(--color-accent);
  --vc-accent-500: var(--color-accent);
  --vc-accent-600: var(--color-accent);
  --vc-accent-700: var(--color-accent);
  --vc-accent-800: var(--color-accent);
  --vc-accent-900: var(--color-accent);

  border-radius: var(--border-radius-m);
  background: var(--color-bg);
}

.vc-popover-content {
  background: var(--color-bg) !important;
  border: 1px solid var(--color-border) !important;
  border-radius: var(--border-radius-m) !important;
  box-shadow: 0 12px 48px rgba(0, 0, 0, 0.15) !important;
}

.vc-header {
  padding: var(--space-m);
  margin-top: 0;
  margin-bottom: var(--space-m);

  @media (max-width: $breakpoint-s) {
    padding: var(--space-s);
  }
}

.vc-pane-layout {
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius-m);
}

// Hide headers for second and third month rows
.vc-pane.row-2 .vc-weekday,
.vc-pane.row-3 .vc-weekday {
  display: none;
}

.vc-title {
  span {
    color: var(--color-text);
    font-weight: var(--font-weight-medium);
    font-size: var(--font-size-l);
  }

  @media (max-width: $breakpoint-s) {
    font-size: var(--font-size-m);
  }
}

.vc-arrow {
  color: var(--color-text-lighter);

  &:hover {
    color: var(--color-text);
  }
}

.vc-weekday {
  color: var(--color-text-lightest);
  font-weight: var(--font-weight-medium);
  font-size: var(--font-size-xs);
  padding: var(--space-s) var(--space-xs);

  @media (max-width: $breakpoint-s) {
    font-size: var(--font-size-xxs);
    padding: var(--space-xxs);
  }
}

.vc-day {
  min-height: 36px;

  &:hover .vc-day-content {
    background-color: var(--color-surface-lighter);
  }
}

.vc-day-content {
  color: var(--color-text);
  border-radius: var(--border-radius-s);
  transition: all 0.2s ease;

  &:hover {
    background-color: var(--color-surface-lighter);
  }

  @media (max-width: $breakpoint-s) {
    font-size: var(--font-size-xs);
    min-height: 32px;
  }

  &.is-disabled {
    color: var(--color-text-lighter);
  }
}

// Highlight today - target the day that contains today's date
.vc-day.is-today .vc-day-content {
  background-color: var(--color-bg) !important;
  color: var(--color-accent) !important;
  font-weight: var(--font-weight-semibold) !important;
  border: 2px solid var(--color-accent) !important;

  &:hover {
    background-color: var(--color-accent) !important;
    color: var(--color-bg) !important;
  }
}

.vc-dot {
  width: 6px;
  height: 6px;

  @media (max-width: $breakpoint-s) {
    width: 4px;
    height: 4px;
  }
}

.vc-highlight {
  border-radius: var(--border-radius-s);

  // Multi-day event styling
  &.vc-highlight-base-start {
    border-radius: var(--border-radius-s) 0 0 var(--border-radius-s);
  }

  &.vc-highlight-base-middle {
    border-radius: 0;
  }

  &.vc-highlight-base-end {
    border-radius: 0 var(--border-radius-s) var(--border-radius-s) 0;
  }
}

// Custom event color overrides
// Past events
.vc-past {
  .vc-highlight {
    background-color: var(--color-border) !important;
  }

  &.vc-day-content {
    background-color: var(--color-border) !important;
    color: var(--color-text-lighter) !important;
  }
}

.vc-dots .vc-dot.vc-past {
  background-color: var(--color-border-strong) !important;
  border-color: var(--color-border) !important;
}

// Ongoing events
.vc-ongoing {
  .vc-highlight {
    background-color: var(--color-bg-accent-lowered) !important;
  }

  &.vc-day-content {
    background-color: var(--color-bg-accent-lowered) !important;
    color: var(--color-text) !important;
  }
}

:root.dark {
  .vc-ongoing {
    .vc-highlight {
      background-color: var(--color-bg-accent-lowered) !important;
    }

    &.vc-day-content {
      background-color: var(--color-bg-accent-lowered) !important;
      color: var(--dark-color-text) !important;
    }
  }
}

.vc-dots .vc-dot.vc-ongoing {
  background-color: var(--color-bg) !important;
}

// Future events
.vc-future {
  .vc-highlight {
    background-color: var(--color-bg-raised) !important;
    z-index: 2;
  }

  &.vc-day-content {
    border: none !important;
    color: var(--color-text) !important;
  }
}

.vc-dots .vc-dot.vc-future {
  background-color: var(--color-accent) !important;
}

// Mobile optimizations
@media (max-width: $breakpoint-s) {
  .events-calendar {
    min-height: 300px;
  }

  .event-popover {
    min-width: 280px;
    max-width: 300px;

    &__header {
      padding: var(--space-s) var(--space-s) var(--space-xs);
      font-size: var(--font-size-xs);
    }

    &__content {
      padding: var(--space-xs) var(--space-s) var(--space-s);
    }

    &__count {
      font-size: var(--font-size-xxs);
    }

    &__title {
      font-size: var(--font-size-xs);
    }

    &__time {
      font-size: var(--font-size-xxs);
      padding: 1px 4px;
    }

    &__location,
    &__duration {
      font-size: var(--font-size-xxs);
    }

    &__rsvp {
      .vui-badge {
        font-size: var(--font-size-xxs);
        padding: 1px 4px;
      }
    }

    &__action {
      font-size: var(--font-size-xxs);
    }

    &__item {
      padding: var(--space-xs);
    }
  }
}
</style>
