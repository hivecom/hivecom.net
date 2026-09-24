<script setup lang="ts">
import { Flex, Input, Switch, Tab, Tabs } from '@dolanske/vui'
import CalendarButtons from '@/components/Events/CalendarButtons.vue'
import CreateEventModal from '@/components/Events/CreateEventModal.vue'
import EventsCalendar from '@/components/Events/EventsCalendar.vue'
import EventsListing from '@/components/Events/EventsListing.vue'
import ContentRulesModal from '@/components/Shared/ContentRulesModal.vue'
import ExpandableSelect from '@/components/Shared/ExpandableSelect.vue'
import GameSelect from '@/components/Shared/GameSelect.vue'
import ResponsiveButton from '@/components/Shared/ResponsiveButton.vue'
import { useContentRulesAgreement } from '@/composables/useContentRulesAgreement'
import { useDataEvents } from '@/composables/useDataEvents'
import { useDataGames } from '@/composables/useDataGames'
import { useBreakpoint } from '@/lib/mediaQuery'

interface SelectOption {
  label: string
  value: string | number
}

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

const hideRecurring = ref(false)
const recurringFilter = computed<boolean | null>(() => hideRecurring.value ? true : null)

const activeTab = ref('list')
const route = useRoute()
const router = useRouter()

const { games } = useDataGames()

// Listing data only. The calendar fetches its own windowed data.
const { events, loading, error, refresh } = useDataEvents()
const errorMessage = computed(() => error.value ?? '')

const gameFilterIds = ref<number[]>([])

const gameFilter = computed<number[]>(() => gameFilterIds.value)

const eventGameIds = computed(() => {
  const ids = new Set(events.value.flatMap(e => e.games ?? []))
  return Array.from(ids)
})

const eventGames = computed(() =>
  eventGameIds.value
    .map(id => games.value.find(g => g.id === id))
    .filter((g): g is NonNullable<typeof g> => g !== undefined)
    .sort((a, b) => (a.name ?? '').localeCompare(b.name ?? '')),
)

// Sync URL -> gameFilterIds
watch(
  () => route.query.game,
  (raw) => {
    const raws = Array.isArray(raw) ? raw : (raw ? [raw] : [])
    const ids = raws.map(Number).filter(id => !Number.isNaN(id) && id > 0)
    const current = gameFilterIds.value
    if (ids.length === current.length && ids.every((id, i) => id === current[i]))
      return

    gameFilterIds.value = ids
  },
  { immediate: true },
)

// Sync gameFilterIds -> URL
watch(gameFilterIds, (ids) => {
  const currentRaw = route.query.game
  const rawList = Array.isArray(currentRaw) ? currentRaw : (currentRaw ? [currentRaw] : [])
  const current = rawList
    .map(Number)
    .filter(id => !Number.isNaN(id) && id > 0)
  if (ids.length === current.length && ids.every((id, i) => id === current[i]))
    return

  const { game: _game, ...rest } = route.query
  void router.replace({ query: ids.length > 0 ? { ...rest, game: ids.map(String) } : rest })
})

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

const showCreateEventModal = ref(false)
const showContentRulesModal = ref(false)
const user = useSupabaseUser()

const { agreed: contentRulesAgreed, markAgreed } = useContentRulesAgreement()

// Set by a calendar day click so the form opens on that day. Cleared when the
// modal closes so the next plain "create" starts blank.
const createDate = ref<Date | null>(null)

watch(showCreateEventModal, (open) => {
  if (!open)
    createDate.value = null
})

function openCreateOn(date: Date) {
  createDate.value = date
  handleCreateEventClick()
}

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

// ?create=1 opens the create flow through the button's handler, so the content rules
// gate still applies. The query is dropped so a refresh doesn't reopen it.
onMounted(() => {
  if (!route.query.create || !user.value)
    return

  handleCreateEventClick()

  const { create: _create, ...rest } = route.query
  router.replace({ query: rest })
})

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
    <section class="page-title">
      <h1>
        Events
      </h1>
      <p>
        Discover the latest happenings
      </p>
    </section>

    <ClientOnly>
      <Tabs v-model="activeTab" class="mb-m">
        <Tab value="list">
          List
        </Tab>
        <Tab value="calendar">
          Calendar
        </Tab>

        <template #end>
          <Flex gap="xs" y-center>
            <ResponsiveButton v-if="user" variant="accent" size="s" icon="ph:plus" :icon-size="16" label="Create" @click="handleCreateEventClick" />
            <CalendarButtons size="s" :show-labels="!isMobile" :is-authenticated="!!user" />
          </Flex>
        </template>
      </Tabs>

      <section>
        <Flex v-if="activeTab === 'list'" gap="s" wrap class="mb-l" y-center expand>
          <Input v-model="search" placeholder="Search events..." style="min-width: 200px" :expand="isMobile">
            <template #start>
              <Icon name="ph:magnifying-glass" />
            </template>
          </Input>
          <ExpandableSelect
            v-if="user"
            v-model="officialFilterOption"
            :options="officialFilterOptions"
            placeholder="Official"
            single
            show-clear
            :expand="isMobile"
          />
          <GameSelect
            v-model="gameFilterIds"
            :games="eventGames"
            placeholder="Game"
            :expand="isMobile"
          />
          <Flex v-if="user" :gap="0" y-center>
            <Switch v-model="hideRecurring" />
            <span class="text-s text-color-lighter">Hide recurring</span>
          </Flex>
        </Flex>

        <EventsListing
          v-if="activeTab === 'list'"
          :events="events"
          :loading="loading"
          :error-message="errorMessage"
          :search="search"
          :official-filter="officialFilter"
          :recurring-filter="recurringFilter"
          :game-filter="gameFilter"
        />

        <EventsCalendar v-else-if="activeTab === 'calendar'" @create="openCreateOn" />
      </section>

      <CreateEventModal
        v-model:open="showCreateEventModal"
        :initial-date="createDate"
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
