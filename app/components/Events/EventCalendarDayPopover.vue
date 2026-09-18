<script setup lang="ts">
import type { Tables } from '@/types/database.overrides'
import { Flex } from '@dolanske/vui'
import dayjs from 'dayjs'

// The hover card VCalendar shows for a day. Shared by the events page calendar
// and the dashboard month grid, so a day reads the same wherever it's drawn.
// Takes the `day-popover` slot payload as is.
defineProps<{
  dayTitle: string
  attributes: { key: string, customData: Tables<'events'> }[]
}>()

function formatEventDuration(event: Tables<'events'>) {
  if (!event.duration_minutes)
    return ''

  const eventStart = dayjs(event.date)
  const eventEnd = eventStart.add(event.duration_minutes, 'minute')

  // Spanning midnight reads better as days than as a pile of hours.
  if (eventEnd.format('YYYY-MM-DD') !== eventStart.format('YYYY-MM-DD')) {
    const daysDiff = Math.ceil(eventEnd.diff(eventStart, 'day', true))
    return `${daysDiff} day${daysDiff > 1 ? 's' : ''}`
  }

  const hours = Math.floor(event.duration_minutes / 60)
  const minutes = event.duration_minutes % 60

  if (hours === 0)
    return `${minutes}m`
  if (minutes === 0)
    return `${hours}h`

  return `${hours}h ${minutes}m`
}

function formatEventTime(event: Tables<'events'>) {
  return dayjs(event.date).format('h:mm A')
}

// A multi-day event only carries its start time on the day it starts. The
// popover title is a date string like "Monday, Jun 16, 2025", which dayjs reads.
function shouldShowTime(event: Tables<'events'>, dayTitle: string) {
  const eventStart = dayjs(event.date)
  const eventEnd = event.duration_minutes
    ? eventStart.add(event.duration_minutes, 'minute')
    : null

  if (!eventEnd || eventEnd.toString() === eventStart.toString())
    return true

  return dayjs(dayTitle).format('YYYY-MM-DD') === eventStart.format('YYYY-MM-DD')
}

function navigateToEvent(event: Tables<'events'>) {
  navigateTo(`/events/${event.id}`)
}
</script>

<template>
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
            </div>
            <div v-if="customData.duration_minutes" class="event-popover__duration">
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

<style lang="scss" scoped>
.event-popover {
  padding: 0;
  min-width: 288px;
  max-width: 340px;
  overflow: hidden;

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

@media (max-width: $breakpoint-s) {
  .event-popover {
    min-width: 280px;
    max-width: 300px;

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
