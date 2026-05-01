<script setup lang="ts">
import { Button, Flex, Input, Select, Tab, Tabs } from '@dolanske/vui'
import CalendarButtons from '@/components/Events/CalendarButtons.vue'
import CreateEventModal from '@/components/Events/CreateEventModal.vue'
import EventsCalendar from '@/components/Events/EventsCalendar.vue'
import EventsListing from '@/components/Events/EventsListing.vue'
import ContentRulesModal from '@/components/Shared/ContentRulesModal.vue'
import { useContentRulesAgreement } from '@/composables/useContentRulesAgreement'
import { useDataEvents } from '@/composables/useDataEvents'
import { useBreakpoint } from '@/lib/mediaQuery'

interface SelectOption {
  label: string
  value: string
}

// Filters
const search = ref('')
const officialFilterOption = ref<SelectOption[] | undefined>(undefined)
const officialFilter = computed<boolean | null>(() => {
  const val = officialFilterOption.value?.[0]?.value
  if (val === 'official')
    return true
  if (val === 'unofficial')
    return false
  return null
})

const officialFilterOptions: SelectOption[] = [
  { label: 'Official', value: 'official' },
  { label: 'Community', value: 'unofficial' },
]

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

const isMobile = useBreakpoint('<m')

// Create event modal
const showCreateEventModal = ref(false)
const showContentRulesModal = ref(false)
const user = useSupabaseUser()

const { agreed: contentRulesAgreed, markAgreed } = useContentRulesAgreement()

function handleCreateEventClick() {
  if (contentRulesAgreed.value === true) {
    showCreateEventModal.value = true
  }
  else {
    showContentRulesModal.value = true
  }
}

function handleContentRulesConfirmed() {
  markAgreed()
  showCreateEventModal.value = true
}

// Fetch data for the listing view only - the calendar self-fetches its own windowed data
const { events, loading, error, refresh } = useDataEvents()
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

    <ClientOnly>
      <!-- Tabs Navigation -->
      <Tabs v-model="activeTab" class="my-m">
        <Tab value="list">
          List
        </Tab>
        <Tab value="calendar">
          Calendar
        </Tab>

        <template #end>
          <Flex gap="xs" y-center>
            <Button v-if="user" variant="accent" size="s" :square="isMobile" @click="handleCreateEventClick">
              <template v-if="isMobile">
                <Icon name="ph:plus" :size="16" />
              </template>
              <template v-if="!isMobile" #start>
                <Icon name="ph:plus" :size="16" />
              </template>
              <template v-if="!isMobile">
                Create
              </template>
            </Button>
            <CalendarButtons size="s" :show-labels="!isMobile" :is-authenticated="!!user" />
          </Flex>
        </template>
      </Tabs>

      <section>
        <!-- Filters (list view only) -->
        <Flex v-if="activeTab === 'list'" gap="s" wrap class="mb-l">
          <Input v-model="search" placeholder="Search events..." style="min-width: 200px">
            <template #start>
              <Icon name="ph:magnifying-glass" />
            </template>
          </Input>
          <Select
            v-if="user"
            v-model="officialFilterOption"
            :options="officialFilterOptions"
            placeholder="Official"
            single
            show-clear
          />
        </Flex>

        <!-- Listing View -->
        <EventsListing
          v-if="activeTab === 'list'"
          :events="events"
          :loading="loading"
          :error-message="errorMessage"
          :search="search"
          :official-filter="officialFilter"
        />

        <!-- Calendar View -->
        <!-- EventsCalendar self-fetches only the visible month window -->
        <EventsCalendar v-else-if="activeTab === 'calendar'" />
      </section>

      <CreateEventModal
        v-model:open="showCreateEventModal"
        @saved="refresh"
      />

      <ContentRulesModal
        v-model:open="showContentRulesModal"
        :show-agree-button="true"
        @confirm="handleContentRulesConfirmed"
      />
    </ClientOnly>
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
