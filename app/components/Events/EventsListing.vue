<script setup lang="ts">
import type { Tables } from '@/types/database.types'
import { Button, Flex, Skeleton } from '@dolanske/vui'
import Event from './Event.vue'
import EventPast from './EventPast.vue'

interface Props {
  events: Tables<'events'>[] | undefined
  loading: boolean
  errorMessage: string
}

const props = defineProps<Props>()

const expandPastList = ref(false)

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
      <Skeleton :height="162" :radius="8" />

      <!-- Another section skeleton -->
      <Skeleton :width="150" :height="36" :radius="8" class="mt-xl" />

      <!-- Upcoming events skeleton -->
      <Skeleton v-for="i in 2" :key="`past-${i}`" :height="108" :radius="8" />

      <Skeleton :width="150" :height="36" :radius="8" class="mt-xl" />

      <!-- Past events skeletons -->
      <div class="events-section__past-list">
        <Skeleton v-for="i in 4" :key="`past-${i}`" :width="322" :height="164" style="min-width: 322px;" />
      </div>
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
          v-for="event in ongoingEvents"
          :key="event.id"
          :data="event"
          :is-ongoing="true"
          :is-highlight="true"
        />
      </div>
    </div>

    <!-- Upcoming Events Section -->
    <div v-if="upcomingEvents.length > 0" class="events-section">
      <h2 class="events-section__title">
        Upcoming Events
      </h2>

      <div class="events-section__list">
        <Event
          v-for="(event, index) in upcomingEvents"
          :key="event.id"
          :data="event"
          :is-highlight="index === 0 && ongoingEvents.length === 0"
        />
      </div>
    </div>

    <!-- Past Events Section -->
    <div v-if="pastEvents.length > 0" class="events-section events-section--past">
      <h2 class="events-section__title">
        Past Events
      </h2>

      <div class="events-section__past-list" :class="{ 'events-section__past-list--expanded': !!expandPastList }">
        <EventPast
          v-for="event in pastEvents"
          :key="event.id"
          :data="event"
        />
      </div>

      <Flex x-end :class="{ 'mt-l': !!expandPastList }">
        <Button size="s" @click="expandPastList = !expandPastList">
          {{ expandPastList ? 'Collapse' : 'Unroll' }}
          <template #end>
            <Icon name="bx:expand-vertical" />
          </template>
        </Button>
      </Flex>
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
  margin-bottom: var(--space-xxxl);

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
    display: flex;
    flex-direction: column;
    gap: var(--space-m);

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

    // Scrollbar gutter padding
    padding-bottom: 16px;

    &--expanded {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      overflow-x: unset;

      .event-past {
        width: auto !important;
        min-width: auto !important;
      }
    }
  }

  &__no-events {
    text-align: center;
    padding: 3rem 0;
  }

  // Past events styling - grayed out with hover effect
  &--past {
    .events-section__title {
      color: var(--color-text-light);
    }

    &:hover {
      .events-section__past-list {
        opacity: 1;
      }
    }

    .events-section__past-list {
      opacity: 0.7;
      transition: var(--transition-slow);
    }
  }

  // Ongoing events styling - highlighted with accent color
  &--ongoing {
    .events-section__title {
      display: flex;
      align-items: center;
      gap: 8px;
      color: var(--color-accent);
      position: relative;
      font-size: var(--font-size-xxl);

      &::before {
        content: '';
        display: block;
        width: 10px;
        height: 10px;
        background: var(--color-text-red);
        border-radius: 10px;
        animation: pulse 1.5s infinite;
      }
    }

    .events-section__list {
      .event-item {
        border: 1px solid var(--color-accent);
        background-color: color-mix(in srgb, var(--color-bg-accent-lowered) 5%, transparent);

        &:hover {
          background-color: color-mix(in srgb, var(--color-bg-accent-lowered) 25%, transparent);
        }
      }
    }
  }
}

:root.light {
  .events-section--past .events-section__past-list {
    opacity: 0.5;

    &:hover {
      opacity: 1;
    }
  }
}

@media (max-width: $breakpoint-m) {
  .events-section__past-list--expanded {
    grid-template-columns: repeat(2, 1fr);
  }
}

// Mobile responsiveness
@media (max-width: $breakpoint-s) {
  .events-section {
    text-align: center !important;
  }

  .events-section__past-list--expanded {
    grid-template-columns: 1fr;
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
