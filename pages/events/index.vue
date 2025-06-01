<script setup lang="ts">
import type { Tables } from '~/types/database.types'
import { Divider, Flex, Grid, Sheet, Spinner } from '@dolanske/vui'
import Event from '~/components/Events/Event.vue'

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

// Split events into upcoming and past
const upcomingEvents = computed(() => {
  if (!events.value)
    return []
  const today = new Date()
  today.setHours(0, 0, 0, 0) // Reset time to start of day for accurate comparison

  return events.value.filter((event) => {
    const eventDate = new Date(event.date)
    eventDate.setHours(0, 0, 0, 0)
    return eventDate >= today
  })
})

const pastEvents = computed(() => {
  if (!events.value)
    return []
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  return events.value.filter((event) => {
    const eventDate = new Date(event.date)
    eventDate.setHours(0, 0, 0, 0)
    return eventDate < today
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
            <div class="flex-1">
              <span class="color-text-lighter text-s">Event</span>
            </div>
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

      <p>Markdown will be rendered here and more details will be added too.</p>
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
  }
}

.time-ago-header {
  min-width: 296px;
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

.no-events {
  text-align: center;
  padding: 3rem 0;
}

// Mobile responsiveness
@media (max-width: $breakpoint-sm) {
  .time-ago-header {
    min-width: 200px;
  }

  .event-item-countdown {
    span {
      width: 40px;
    }
  }
}

@media (max-width: $breakpoint-xs) {
  .events-section {
    margin-bottom: 2rem;
  }

  .section-title {
    font-size: 1.25rem;
    margin-bottom: 1rem;
  }

  .time-ago-header {
    min-width: 150px;
  }

  .event-item-countdown {
    span {
      width: 30px;
      font-size: var(--font-size-xs);
    }
  }

  .no-events {
    padding: 2rem 0;
  }
}
</style>
