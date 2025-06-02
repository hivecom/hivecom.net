<script setup lang="ts">
import type { Tables } from '~/types/database.types'
import { Divider, Flex, Grid, Sheet, Spinner } from '@dolanske/vui'
import Event from '~/components/Events/Event.vue'
import TimestampDate from '~/components/Shared/TimestampDate.vue'
import { formatDurationFromMinutes } from '~/utils/duration'

// Fetch data
const supabase = useSupabaseClient()
const loading = ref(true)
const errorMessage = ref('')
const events = ref<Tables<'events'>[]>()

onMounted(async () => {
  loading.value = true

  const responseEvents = await supabase.from('events').select('*').order('date', { ascending: true })
  if (responseEvents.error) {
    errorMessage.value = responseEvents.error.message
    return
  }

  loading.value = false
  events.value = responseEvents.data
})

// Split events into upcoming, ongoing, and past
const upcomingEvents = computed(() => {
  if (!events.value)
    return []
  const now = new Date()

  return events.value.filter((event) => {
    const eventStart = new Date(event.date)
    return eventStart > now
  })
})

const ongoingEvents = computed(() => {
  if (!events.value)
    return []
  const now = new Date()

  return events.value.filter((event) => {
    const eventStart = new Date(event.date)
    const eventEnd = event.duration_minutes
      ? new Date(eventStart.getTime() + event.duration_minutes * 60 * 1000)
      : eventStart

    return eventStart <= now && now <= eventEnd
  })
})

const pastEvents = computed(() => {
  if (!events.value)
    return []
  const now = new Date()

  return events.value.filter((event) => {
    const eventStart = new Date(event.date)
    const eventEnd = event.duration_minutes
      ? new Date(eventStart.getTime() + event.duration_minutes * 60 * 1000)
      : eventStart

    return eventEnd < now
  }).reverse()
})

// Display more event information, if there's any
const activeEvent = shallowRef<Tables<'events'>>()
const showDetails = computed({
  // Open sheet when an active event is set
  get: () => !!activeEvent.value,
  // Clear active event when sheet is closed
  set: (v) => {
    if (!v) {
      activeEvent.value = undefined
    }
  },
})
</script>

<template>
  <div class="page">
    <!-- Hero section -->
    <section>
      <h1>
        Events
      </h1>
      <p>
        Discover the latest happenings.
      </p>
    </section>
    <Divider />
    <section class="mt-xl">
      <div v-if="loading">
        <Spinner size="l" />
      </div>
      <template v-else>
        <!-- Ongoing Events Section -->
        <div v-if="ongoingEvents.length > 0" class="events-section ongoing-events">
          <h2 class="section-title">
            Happening Now
          </h2>

          <div class="event-list">
            <Event
              v-for="(event, index) in ongoingEvents"
              :key="event.id"
              :data="event"
              :index
              :is-ongoing="true"
              @open="activeEvent = event"
            />
          </div>
        </div>

        <!-- Upcoming Events Section -->
        <div v-if="upcomingEvents.length > 0" class="events-section">
          <h2 class="section-title">
            Upcoming Events
          </h2>
          <Flex gap="xxl">
            <Grid :columns="4" gap="l" class="event-item-countdown">
              <span class="color-text-lighter text-s">Days</span>
              <span class="color-text-lighter text-s">Hours</span>
              <span class="color-text-lighter text-s">Minutes</span>
              <span class="color-text-lighter text-s">Seconds</span>
            </Grid>
            <Flex expand>
              <span class="color-text-lighter text-s">Event</span>
            </Flex>
          </Flex>

          <div class="event-list">
            <Event
              v-for="(event, index) in upcomingEvents"
              :key="event.id"
              :data="event"
              :index
              @open="activeEvent = event"
            />
          </div>
        </div>

        <!-- Past Events Section -->
        <div v-if="pastEvents.length > 0" class="events-section past-events">
          <h2 class="section-title">
            Past Events
          </h2>
          <Flex gap="xxl">
            <Flex x-center class="time-ago-header">
              <span class="color-text-lighter text-s">When</span>
            </Flex>
            <div class="flex-1">
              <span class="color-text-lighter text-s">Event</span>
            </div>
          </Flex>

          <div class="event-list">
            <Event
              v-for="(event, index) in pastEvents"
              :key="event.id"
              :data="event"
              :index
              :is-past="true"
              @open="activeEvent = event"
            />
          </div>
        </div>

        <!-- No Events Message -->
        <div v-if="upcomingEvents.length === 0 && pastEvents.length === 0" class="no-events">
          <p class="color-text-lighter">
            No events found.
          </p>
        </div>
      </template>
    </section>

    <Sheet v-model="showDetails" size="512">
      <template #header>
        <h3 class="text-bold text-l">
          {{ activeEvent?.title }}
        </h3>
      </template>

      <div v-if="activeEvent" class="event-details">
        <div class="detail-row">
          <strong>Date & Time:</strong>
          <TimestampDate :date="activeEvent.date" format="dddd, MMM D, YYYY [at] HH:mm" />
        </div>

        <div v-if="activeEvent.duration_minutes" class="detail-row">
          <strong>Duration:</strong>
          {{ formatDurationFromMinutes(activeEvent.duration_minutes) }}
        </div>

        <div v-if="activeEvent.location" class="detail-row">
          <strong>Location:</strong>
          {{ activeEvent.location }}
        </div>

        <div v-if="activeEvent.description" class="detail-row">
          <strong>Description:</strong>
          <p>{{ activeEvent.description }}</p>
        </div>

        <div v-if="activeEvent.note" class="detail-row">
          <strong>Note:</strong>
          <p>{{ activeEvent.note }}</p>
        </div>

        <div v-if="activeEvent.link" class="detail-row">
          <strong>Link:</strong>
          <a :href="activeEvent.link" target="_blank" rel="noopener noreferrer" class="event-link">
            {{ activeEvent.link }}
            <Icon name="ph:arrow-square-out" class="ml-xs" size="14" />
          </a>
        </div>
      </div>
    </Sheet>
  </div>
</template>

<style lang="scss">
@use '@/assets/breakpoints.scss' as *;

.events-section {
  margin-bottom: 4rem;

  &:last-child {
    margin-bottom: 0;
  }
}

.section-title {
  font-size: 1.5rem;
  font-weight: 600;
  margin-bottom: 1.5rem;
  color: var(--color-text);
}

.event-list {
  .vui-divider:last-of-type {
    display: none;
  }
}

.event-item-countdown {
  span {
    text-align: center;
    display: block;
    width: 56px;

    @media (max-width: $breakpoint-sm) {
      min-width: 80px;
    }

    @media (max-width: $breakpoint-xs) {
      min-width: 60px;
    }
  }
}

.time-ago-header,
.ongoing-header {
  text-align: center;
}

// Past events styling - grayed out with hover effect
.past-events {
  .section-title {
    color: var(--color-text-lighter);
  }

  .event-list {
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
.ongoing-events {
  .section-title {
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

  .event-list {
    .event-item {
      border: 1px solid var(--color-accent);
      padding-left: var(--space-m);
      margin-left: var(--space-xs);
      background: linear-gradient(to right, var(--color-accent-muted) 0%, transparent 100%);
      border-radius: var(--border-radius-m);
    }
  }
}

.no-events {
  text-align: center;
  padding: 3rem 0;
}

.event-details {
  .detail-row {
    margin-bottom: var(--space-m);

    strong {
      display: block;
      margin-bottom: var(--space-xs);
      color: var(--color-text);
    }

    p {
      margin: 0;
      line-height: 1.5;
    }
  }

  .event-link {
    color: var(--color-accent);
    text-decoration: none;
    display: inline-flex;
    align-items: center;

    &:hover {
      text-decoration: underline;
    }
  }
}

// Mobile responsiveness
@media (max-width: $breakpoint-sm) {
  // Center page header on mobile
  .page section:first-child {
    text-align: center !important;

    h1 {
      text-align: center !important;
    }

    p {
      text-align: center !important;
    }
  }

  .events-section {
    text-align: center !important;
  }

  .section-title {
    text-align: center !important;
  }

  // Hide the header row on mobile since individual events are centered
  .events-section > .vui-flex:has(.event-item-countdown),
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

  .event-item-countdown {
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

  .section-title {
    margin-bottom: 1rem;
    text-align: center !important;
  }

  .time-ago-header,
  .ongoing-header {
    min-width: 150px;
    text-align: center !important;
    justify-content: center !important;
  }

  .event-item-countdown {
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
