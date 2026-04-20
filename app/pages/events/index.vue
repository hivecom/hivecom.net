<script setup lang="ts">
import { Tab, Tabs } from '@dolanske/vui'
import CalendarButtons from '@/components/Events/CalendarButtons.vue'
import EventsCalendar from '@/components/Events/EventsCalendar.vue'
import EventsListing from '@/components/Events/EventsListing.vue'
import { useDataEvents } from '@/composables/useDataEvents'

// Tab management
const activeTab = ref('list')
const route = useRoute()
const router = useRouter()

const queryTab = computed(() => {
  const tab = route.query.tab
    ?? (route.query.calendar ? 'calendar' : undefined)
    ?? (route.query.list ? 'list' : undefined)
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

  const { tab: _ignoredTab, calendar: _ignoredCalendar, list: _ignoredList, ...restQuery } = route.query
  const nextQuery = tab === 'list' ? restQuery : { ...restQuery, tab }

  router.replace({ query: nextQuery })
})

onBeforeRouteLeave(() => {
  sessionStorage.setItem('events_active_tab', activeTab.value)
})

onMounted(() => {
  if (queryTab.value === 'list' || queryTab.value === 'calendar')
    return

  activeTab.value = sessionStorage.getItem('events_active_tab') ?? 'list'
})

// Fetch data for the listing view only - the calendar self-fetches its own windowed data
const { events, loading, error } = useDataEvents()
const errorMessage = computed(() => error.value ?? '')

useSeoMeta({
  title: 'Events',
  description: 'Discover upcoming, ongoing, and past events in the Hivecom community.',
  ogTitle: 'Events',
  ogDescription: 'Discover upcoming, ongoing, and past events in the Hivecom community.',
})

defineOgImage('Default', {
  title: 'Events',
  description: 'Discover upcoming, ongoing, and past events in the Hivecom community.',
})
</script>

<template>
  <div class="page container-l">
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
      <!-- EventsCalendar self-fetches only the visible month window -->
      <EventsCalendar v-else-if="activeTab === 'calendar'" />
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
</style>
