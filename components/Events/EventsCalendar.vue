<script setup lang="ts">
import type { Tables } from '@/types/database.types'
import { Flex, theme } from '@dolanske/vui'

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

const date = ref(new Date())

// Theme detection
const isDark = computed(() => theme.value === 'dark')

// Convert events to calendar attributes
const calendarAttributes = computed(() => {
  if (!props.events)
    return []

  const now = new Date()

  return props.events.map((event) => {
    const eventStart = new Date(event.date)
    const eventEnd = event.duration_minutes
      ? new Date(eventStart.getTime() + event.duration_minutes * 60 * 1000)
      : null

    const isUpcoming = eventStart > now
    const isOngoing = (() => {
      if (!eventEnd)
        return false
      return eventStart <= now && now <= eventEnd
    })()
    const isPast = eventEnd ? eventEnd < now : eventStart < now

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
      ? { start: eventStart, end: eventEnd }
      : eventStart

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

  const eventStart = new Date(event.date)
  const eventEnd = new Date(eventStart.getTime() + event.duration_minutes * 60 * 1000)

  // If it spans multiple days, show the date range
  if (eventEnd.toDateString() !== eventStart.toDateString()) {
    const daysDiff = Math.ceil((eventEnd.getTime() - eventStart.getTime()) / (1000 * 60 * 60 * 24))
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

  if (dayEvents && dayEvents.length > 0) {
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
  const eventDate = new Date(event.date)
  return eventDate.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}

// Check if we should show time for this event on this day
function shouldShowTime(event: Tables<'events'>, dayTitle: string) {
  const eventStart = new Date(event.date)
  const eventEnd = event.duration_minutes
    ? new Date(eventStart.getTime() + event.duration_minutes * 60 * 1000)
    : null

  // If it's not a multi-day event, always show time
  if (!eventEnd || eventEnd.toDateString() === eventStart.toDateString()) {
    return true
  }

  // For multi-day events, only show time on the start day
  // Parse the dayTitle to get the date (format is like "Monday, Jun 16, 2025")
  const dayDate = new Date(dayTitle)
  return dayDate.toDateString() === eventStart.toDateString()
}
</script>

<template>
  <div class="events-calendar">
    <div v-if="loading" class="calendar-loading">
      <Flex column gap="l" y-center>
        <Icon name="ph:calendar" size="64" class="color-text-lighter" />
        <p class="color-text-lighter">
          Loading events...
        </p>
      </Flex>
    </div>

    <div v-else-if="errorMessage" class="calendar-error">
      <Flex column gap="l" y-center>
        <Icon name="ph:warning" size="64" class="color-text-red" />
        <p class="color-text-red">
          {{ errorMessage }}
        </p>
      </Flex>
    </div>

    <ClientOnly v-else>
      <VCalendar
        v-model="date"
        :attributes="calendarAttributes as any"
        expanded
        :is-dark="isDark"
        transparent
        borderless
        :rows="3"
        :first-day-of-week="2"
        @dayclick="onDayClick"
      >
        <template #day-popover="{ dayTitle, attributes }">
          <div class="event-popover">
            <div class="event-popover__header">
              <Icon name="ph:calendar-check" size="16" class="event-popover__icon" />
              {{ dayTitle }}
            </div>
            <div v-if="attributes.length === 0" class="event-popover__empty">
              No events scheduled
            </div>
            <div v-else class="event-popover__content">
              <div class="event-popover__count">
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
                  <div v-if="customData.location" class="event-popover__location">
                    <Icon name="ph:map-pin" size="12" />
                    {{ customData.location }}
                  </div>
                  <div v-if="customData.duration_minutes" class="event-popover__duration">
                    <Icon name="ph:clock" size="12" />
                    {{ formatEventDuration(customData) }}
                  </div>
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
    </ClientOnly>
  </div>
</template>

<style lang="scss">
@use '@/assets/breakpoints.scss' as *;

.events-calendar {
  min-height: 400px;
  display: flex;
  align-items: center;
  justify-content: center;

  .vc-container {
    width: 100%;
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
  min-width: 300px;
  max-width: 340px;
  border-radius: var(--border-radius-m);
  overflow: hidden;
  background: var(--color-bg-medium);
  border: 1px solid var(--color-border);
  box-shadow: 0 12px 48px rgba(0, 0, 0, 0.15);

  &__header {
    font-weight: var(--font-weight-semibold);
    color: var(--color-text);
    font-size: var(--font-size-s);
    padding: var(--space-m) var(--space-m) var(--space-s);
    background: var(--color-bg-medium);
    border-bottom: 1px solid var(--color-border);
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    text-align: left;
  }

  &__icon {
    color: var(--color-accent);
    flex-shrink: 0;
  }

  &__content {
    padding: var(--space-s) var(--space-m) var(--space-m);
    background: var(--color-bg);
  }

  &__count {
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
    background: var(--color-bg-raised);
    border: 1px solid var(--color-border);

    &:hover {
      background-color: var(--color-surface-lighter);
      border-color: var(--color-accent);
      transform: translateY(-1px);
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

  @media (max-width: $breakpoint-sm) {
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
  color: var(--color-text);
  font-weight: var(--font-weight-semibold);

  @media (max-width: $breakpoint-sm) {
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
  color: var(--color-text-lighter);
  font-weight: var(--font-weight-medium);
  font-size: var(--font-size-xs);
  padding: var(--space-xs);

  @media (max-width: $breakpoint-sm) {
    font-size: var(--font-size-xxs);
    padding: var(--space-xxs);
  }
}

.vc-day {
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

  @media (max-width: $breakpoint-sm) {
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

  @media (max-width: $breakpoint-sm) {
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
    background-color: var(--color-accent) !important;
  }

  &.vc-day-content {
    background-color: var(--color-accent) !important;
    color: var(--color-bg) !important;
  }
}

.vc-dots .vc-dot.vc-ongoing {
  background-color: var(--color-bg) !important;
}

// Future events
.vc-future {
  .vc-highlight {
    background-color: var(--color-bg-raised) !important;
  }

  &.vc-day-content {
    background-color: var(--color-bg-raised) !important;
    color: var(--color-text) !important;
  }
}

.vc-dots .vc-dot.vc-future {
  background-color: var(--color-accent) !important;
}

// Mobile optimizations
@media (max-width: $breakpoint-sm) {
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

    &__action {
      font-size: var(--font-size-xxs);
    }

    &__item {
      padding: var(--space-xs);
    }
  }
}
</style>
