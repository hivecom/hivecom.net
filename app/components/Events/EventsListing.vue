<script setup lang="ts">
import type { Tables } from '@/types/database.types'
import { Flex, Grid, Skeleton } from '@dolanske/vui'
import Event from '@/components/Events/Event.vue'
import EventPast from './EventPast.vue'

interface Props {
  events: Tables<'events'>[] | undefined
  loading: boolean
  errorMessage: string
}

const props = defineProps<Props>()

// Split events into upcoming, ongoing, and past
const upcomingEvents = computed(() => {
  if (!props.events)
    return []
  const now = new Date()

  return props.events.filter((event) => {
    const eventStart = new Date(event.date)
    return eventStart > now
  })
})

const ongoingEvents = computed(() => {
  if (!props.events)
    return []
  const now = new Date()

  return props.events.filter((event) => {
    const eventStart = new Date(event.date)
    const eventEnd = event.duration_minutes
      ? new Date(eventStart.getTime() + event.duration_minutes * 60 * 1000)
      : eventStart

    return eventStart <= now && now <= eventEnd
  })
})

const pastEvents = computed(() => {
  if (!props.events)
    return []
  const now = new Date()

  return props.events.filter((event) => {
    const eventStart = new Date(event.date)
    const eventEnd = event.duration_minutes
      ? new Date(eventStart.getTime() + event.duration_minutes * 60 * 1000)
      : eventStart

    return eventEnd < now
  }).reverse()
})
</script>

<template>
  <div v-if="loading">
    <!-- Loading skeletons -->
    <Flex column gap="l">
      <!-- Section title skeleton -->
      <Skeleton :width="200" :height="36" :radius="8" />

      <!-- Event list skeletons -->
      <template v-for="i in 4" :key="i">
        <Skeleton :height="80" :radius="8" />
      </template>

      <!-- Another section skeleton -->
      <Skeleton :width="150" :height="36" :radius="8" class="mt-xl" />

      <!-- More event skeletons -->
      <template v-for="i in 3" :key="`past-${i}`">
        <Skeleton :height="80" :radius="8" />
      </template>
    </Flex>
  </div>
  <template v-else>
    <!-- Ongoing Events Section -->
    <div v-if="ongoingEvents.length > 0" class="events-section events-section--ongoing">
      <h2 class="events-section__title">
        Happening Now
      </h2>

      <div class="events-section__list">
        <Event
          v-for="(event, index) in ongoingEvents"
          :key="event.id"
          :data="event"
          :index="index"
          :is-ongoing="true"
        />
      </div>
    </div>

    <!-- Upcoming Events Section -->
    <div v-if="upcomingEvents.length > 0" class="events-section">
      <h2 class="events-section__title">
        Upcoming Events
      </h2>
      <Flex gap="xxl">
        <Grid :columns="4" gap="l" class="events-section__countdown-header">
          <span>Days</span>
          <span>Hours</span>
          <span>Minutes</span>
          <span>Seconds</span>
        </Grid>
        <Flex expand class="events-section__event-header">
          <span>Event</span>
        </Flex>
      </Flex>

      <div class="events-section__list">
        <Event
          v-for="(event, index) in upcomingEvents"
          :key="event.id"
          :data="event"
          :index="index"
        />
      </div>
    </div>

    <!-- Past Events Section -->
    <div v-if="pastEvents.length > 0" class="events-section events-section--past">
      <h2 class="events-section__title">
        Past Events
      </h2>

      <div class="events-section__past-list">
        <EventPast
          v-for="event in pastEvents"
          :key="event.id"
          :data="event"
        />
      </div>
    </div>

    <!-- No Events Message -->
    <div v-if="upcomingEvents.length === 0 && pastEvents.length === 0 && ongoingEvents.length === 0" class="events-section__no-events">
      <p class="text-color-lighter">
        No events found.
      </p>
    </div>
  </template>
</template>

<style lang="scss">
@use '@/assets/breakpoints.scss' as *;

.events-section {
  margin-bottom: 4rem;

  &:last-child {
    margin-bottom: 0;
  }

  &__title {
    font-size: var(--font-size-xl);
    font-weight: var(--font-weight-semibold);
    margin-bottom: 1.5rem;
    color: var(--color-text);
  }

  &__list {
    .vui-divider:last-of-type {
      display: none;
    }
  }

  &__past-list {
    display: flex;
    flex-wrap: nowrap;
    overflow-x: auto;
    max-width: 100%;
    gap: var(--space-m);
  }

  &__countdown-header {
    span {
      text-align: center;
      display: block;
      width: 56px;
      color: var(--color-text-lighter) !important;

      @media (max-width: $breakpoint-s) {
        min-width: 80px;
      }

      @media (max-width: $breakpoint-xs) {
        min-width: 60px;
      }
    }
  }

  &__event-header {
    flex: 1;
    color: var(--color-text-lighter);
    text-align: left;
  }

  &__time-header {
    text-align: center;
    color: var(--color-text-lighter);

    min-width: 294px;
  }

  &__no-events {
    text-align: center;
    padding: 3rem 0;
  }

  // Past events styling - grayed out with hover effect
  &--past {
    .events-section__title {
      color: var(--color-text-lighter);
    }

    .events-section__list {
      opacity: 0.5;
      transition: opacity 0.2s ease;

      &:hover {
        opacity: 0.8;
      }

      // Individual event hover effect
      .event-item {
        transition: opacity 0.2s ease;

        &:hover {
          opacity: 1 !important;
        }
      }
    }
  }

  // Ongoing events styling - highlighted with accent color
  &--ongoing {
    .events-section__title {
      color: var(--color-accent);
      position: relative;

      &::before {
        content: '';
        display: inline-block;
        position: relative;
        width: 8px;
        height: 8px;
        background: var(--color-text-red);
        border-radius: 50%;
        animation: pulse 2s infinite;
      }
    }

    .events-section__list {
      .event-item {
        border: 1px solid var(--color-accent);
        padding-left: var(--space-m);
        background: linear-gradient(to right, var(--color-accent-muted) 0%, transparent 100%);
        border-radius: var(--border-radius-m);
      }
    }
  }
}

// Mobile responsiveness
@media (max-width: $breakpoint-s) {
  .events-section {
    text-align: center !important;
  }

  .events-section__title {
    text-align: center !important;
  }

  // Hide the header row on mobile since individual events are centered
  .events-section > .vui-flex:has(.events-section__countdown-header),
  .events-section > .vui-flex:has(.time-ago-header),
  .events-section > .vui-flex:has(.ongoing-header) {
    display: none !important;
  }

  .time-ago-header,
  .ongoing-header {
    min-width: 200px;
    text-align: center !important;
    justify-content: center !important;
  }

  .events-section__countdown-header {
    justify-content: center !important;

    span {
      width: 40px;
      text-align: center !important;
    }
  }
}

@media (max-width: $breakpoint-xs) {
  .events-section {
    margin-bottom: 2rem;
    text-align: center !important;
  }

  .events-section__title {
    margin-bottom: 1rem;
    text-align: center !important;
  }

  .time-ago-header,
  .ongoing-header {
    text-align: center !important;
    justify-content: center !important;
  }

  .events-section__countdown-header {
    justify-content: center !important;

    span {
      width: 30px;
      text-align: center !important;
    }
  }

  .no-events {
    padding: 2rem 0;
    text-align: center !important;
  }
}
</style>
