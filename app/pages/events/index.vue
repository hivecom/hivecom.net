<script setup lang="ts">
import type { Tables } from '@/types/database.types'
import { Tab, Tabs } from '@dolanske/vui'
import CalendarButtons from '@/components/Events/CalendarButtons.vue'
import EventsCalendar from '@/components/Events/EventsCalendar.vue'
import EventsListing from '@/components/Events/EventsListing.vue'

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
</script>

<template>
  <div class="page">
    <!-- Hero section -->
    <section class="page-title">
      <h1>
        Events
      </h1>
      <p>
        Discover the latest happenings
      </p>
    </section>

    <!-- Tabs Navigation -->
    <Tabs v-model="activeTab" class="my-m">
      <Tab value="listing">
        List
      </Tab>
      <Tab value="calendar">
        Calendar
      </Tab>

      <template #end>
        <CalendarButtons size="s" show-labels />
      </template>
    </Tabs>

    <section class="mt-xl">
      <!-- Listing View -->
      <EventsListing
        v-if="activeTab === 'listing'"
        :events="events"
        :loading="loading"
        :error-message="errorMessage"
      />

      <!-- Calendar View -->
      <EventsCalendar
        v-else-if="activeTab === 'calendar'"
        :events="events"
        :loading="loading"
        :error-message="errorMessage"
      />
    </section>
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
