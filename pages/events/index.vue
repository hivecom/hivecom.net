<script setup lang="ts">
import type { Tables } from '@/types/database.types'
import { Flex, Sheet, Tab, Tabs } from '@dolanske/vui'
import CalendarButtons from '@/components/Events/CalendarButtons.vue'
import EventsCalendar from '@/components/Events/EventsCalendar.vue'
import EventsListing from '@/components/Events/EventsListing.vue'
import TimestampDate from '@/components/Shared/TimestampDate.vue'
import { formatDurationFromMinutes } from '~/utils/duration'

// Tab management
const activeTab = ref('listing')

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

function handleEventOpen(event: Tables<'events'>) {
  activeEvent.value = event
}
</script>

<template>
  <div class="page">
    <!-- Hero section -->
    <section>
      <Flex :gap="0" expand column>
        <Flex y-center x-between expand>
          <h1>
            Events
          </h1>
          <CalendarButtons show-labels />
        </Flex>
        <p>
          Discover the latest happenings
        </p>
      </Flex>
    </section>

    <!-- Tabs Navigation -->
    <Tabs v-model="activeTab" class="my-m">
      <Tab value="listing">
        List
      </Tab>
      <Tab value="calendar">
        Calendar
      </Tab>
    </Tabs>

    <section class="mt-xl">
      <!-- Listing View -->
      <EventsListing
        v-if="activeTab === 'listing'"
        :events="events"
        :loading="loading"
        :error-message="errorMessage"
        @open-event="handleEventOpen"
      />

      <!-- Calendar View -->
      <EventsCalendar
        v-else-if="activeTab === 'calendar'"
        :events="events"
        :loading="loading"
        :error-message="errorMessage"
        @open-event="handleEventOpen"
      />
    </section>

    <Sheet v-model="showDetails" size="512">
      <template #header>
        <h3 class="text-bold text-l">
          {{ activeEvent?.title }}
        </h3>
      </template>

      <div v-if="activeEvent" class="event-details">
        <div class="event-details__row">
          <strong>Date & Time:</strong>
          <TimestampDate :date="activeEvent.date" format="dddd, MMM D, YYYY [at] HH:mm" />
        </div>

        <div v-if="activeEvent.duration_minutes" class="event-details__row">
          <strong>Duration:</strong>
          {{ formatDurationFromMinutes(activeEvent.duration_minutes) }}
        </div>

        <div v-if="activeEvent.location" class="event-details__row">
          <strong>Location:</strong>
          {{ activeEvent.location }}
        </div>

        <div v-if="activeEvent.description" class="event-details__row">
          <strong>Description:</strong>
          <p>{{ activeEvent.description }}</p>
        </div>

        <div v-if="activeEvent.note" class="event-details__row">
          <strong>Note:</strong>
          <p>{{ activeEvent.note }}</p>
        </div>

        <div v-if="activeEvent.link" class="event-details__row">
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

.event-details {
  &__row {
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

// Mobile responsiveness for page header
@media (max-width: $breakpoint-sm) {
  .page section:first-child {
    text-align: center !important;

    h1 {
      text-align: center !important;
    }

    p {
      text-align: center !important;
    }
  }
}
</style>
