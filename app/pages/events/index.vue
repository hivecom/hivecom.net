<script setup lang="ts">
import type { Tables } from '@/types/database.types'
import { Tab, Tabs } from '@dolanske/vui'
import CalendarButtons from '@/components/Events/CalendarButtons.vue'
import EventsCalendar from '@/components/Events/EventsCalendar.vue'
import EventsListing from '@/components/Events/EventsListing.vue'

// Tab management
const activeTab = ref('listing')
const route = useRoute()
const router = useRouter()

const queryTab = computed(() => {
  const tab = route.query.tab ?? (route.query.calendar ? 'calendar' : undefined)
  return Array.isArray(tab) ? tab[0] : tab
})

watch(queryTab, (tab) => {
  if (tab === 'list' || tab === 'calendar')
    activeTab.value = tab
}, { immediate: true })

watch(activeTab, (tab) => {
  if (tab !== 'list' && tab !== 'calendar')
    return

  const currentQueryTab = queryTab.value ?? 'list'
  if (currentQueryTab === tab)
    return

  const { tab: _ignoredTab, calendar: _ignoredCalendar, ...restQuery } = route.query
  const nextQuery = tab === 'list' ? restQuery : { ...restQuery, tab }

  router.replace({ query: nextQuery })
})

// Fetch data
const supabase = useSupabaseClient()
const loading = ref(true)
const errorMessage = ref('')
const events = ref<Tables<'events'>[]>()

useSeoMeta({
  title: 'Events',
  description: 'Discover upcoming, ongoing, and past events in the Hivecom community.',
  ogTitle: 'Events',
  ogDescription: 'Discover upcoming, ongoing, and past events in the Hivecom community.',
})

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
      <Tab value="list">
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
        v-if="activeTab === 'list'"
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
      color: var(--text-color);
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
@media (max-width: $breakpoint-s) {
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
