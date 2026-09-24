<script setup lang="ts">
import type { Tables } from '@/types/database.overrides'
import type { Database } from '@/types/database.types'
import { Flex, Sheet, Skeleton, Spinner, Tab, Tabs } from '@dolanske/vui'
import { computed, onUnmounted, ref, watch } from 'vue'
import EventSmall from '@/components/Events/EventSmall.vue'
import GlowGroup from '@/components/Shared/GlowGroup.vue'
import { useDataGames } from '@/composables/useDataGames'

// Every EventSmall fetches its own attendees, so the lists mount a page at a time
// as they scroll. Past is only fetched once its tab opens.
const props = defineProps<{
  open: boolean
  ongoing: Tables<'events'>[]
  attending: Tables<'events'>[]
  openToJoin: Tables<'events'>[]
}>()

const emit = defineEmits<{ close: [] }>()

const PAGE_SIZE = 12

const supabase = useSupabaseClient<Database>()
const { games } = useDataGames()

const activeTab = ref<'upcoming' | 'past'>('upcoming')
const sentinel = ref<HTMLElement | null>(null)
const pastSentinel = ref<HTMLElement | null>(null)

// ── Upcoming ───────────────────────────────────────────────────────────────

interface Row {
  event: Tables<'events'>
  /** Set on the first row of a group */
  heading: string | null
}

function group(events: Tables<'events'>[], heading: string): Row[] {
  return events.map((event, i) => ({ event, heading: i === 0 ? heading : null }))
}

const upcomingRows = computed<Row[]>(() => [
  ...group(props.ongoing, 'Happening now'),
  ...group(props.attending, 'Going'),
  ...group(props.openToJoin, 'Open to join'),
])

const upcomingPage = ref(1)
const upcomingVisible = computed(() => upcomingRows.value.slice(0, upcomingPage.value * PAGE_SIZE))
const upcomingExhausted = computed(() => upcomingVisible.value.length >= upcomingRows.value.length)

// ── Past ───────────────────────────────────────────────────────────────────

// No official-only filter, since the dashboard is only shown signed in
const pastEvents = ref<Tables<'events'>[]>([])
const pastLoading = ref(false)
const pastLoadingMore = ref(false)
const pastExhausted = ref(false)
let pastRequested = false

async function fetchPast(): Promise<void> {
  const { data, error } = await supabase.rpc('get_past_events_paginated', {
    p_limit: PAGE_SIZE,
    p_offset: pastEvents.value.length,
  })

  if (error) {
    console.error('[HomeDashboardEventsSheet] past events fetch error:', error.message)
    pastExhausted.value = true
    return
  }

  const rows = (data ?? []) as Tables<'events'>[]
  pastEvents.value = [...pastEvents.value, ...rows]

  pastExhausted.value = rows.length < PAGE_SIZE
}

// Once per mount. History doesn't change between opens.
async function ensurePast(): Promise<void> {
  if (pastRequested)
    return

  pastRequested = true
  pastLoading.value = true
  await fetchPast()
  pastLoading.value = false
}

async function loadMorePast(): Promise<void> {
  if (pastLoading.value || pastLoadingMore.value || pastExhausted.value)
    return

  pastLoadingMore.value = true
  await fetchPast()
  pastLoadingMore.value = false
}

watch(activeTab, (tab) => {
  if (tab === 'past')
    void ensurePast()
})

// ── Infinite scroll sentinels ──────────────────────────────────────────────

// A sentinel only exists once its tab renders past the skeletons, so the
// observers follow the elements rather than the open state
let observer: IntersectionObserver | null = null
let pastObserver: IntersectionObserver | null = null

function observe(el: HTMLElement, onIntersect: () => void): IntersectionObserver {
  const obs = new IntersectionObserver(
    (entries) => {
      if (entries[0]?.isIntersecting)
        onIntersect()
    },
    { threshold: 0.1 },
  )

  obs.observe(el)

  return obs
}

watch(sentinel, (el) => {
  observer?.disconnect()
  observer = null

  if (el === null)
    return

  observer = observe(el, () => {
    if (!upcomingExhausted.value)
      upcomingPage.value++
  })
})

watch(pastSentinel, (el) => {
  pastObserver?.disconnect()
  pastObserver = null

  if (el === null)
    return

  pastObserver = observe(el, () => {
    void loadMorePast()
  })
})

// The past pages stay loaded across reopens
watch(() => props.open, (open) => {
  if (open)
    return

  activeTab.value = 'upcoming'
  upcomingPage.value = 1
})

onUnmounted(() => {
  observer?.disconnect()
  pastObserver?.disconnect()
})
</script>

<template>
  <Sheet :open="open" :size="456" @close="emit('close')">
    <template #header>
      <h4 class="mb-s">
        Events
      </h4>

      <Tabs v-model="activeTab" class="events-sheet__tabs">
        <Tab value="upcoming">
          Upcoming
        </Tab>
        <Tab value="past">
          Past
        </Tab>
      </Tabs>
    </template>

    <Flex v-if="activeTab === 'upcoming'" column gap="m" class="pt-s">
      <GlowGroup>
        <Flex column gap="m" expand>
          <template v-for="row in upcomingVisible" :key="row.event.id">
            <h5 v-if="row.heading" class="events-sheet__heading">
              {{ row.heading }}
            </h5>
            <EventSmall :data="row.event" :games="games" class="events-sheet__card" />
          </template>
        </Flex>
      </GlowGroup>

      <p v-if="!upcomingRows.length" class="text-s text-color-lighter">
        Nothing on the calendar yet.
      </p>

      <div v-else ref="sentinel" class="events-sheet__sentinel">
        <Spinner v-if="!upcomingExhausted" />
        <span v-else class="text-xs text-color-lighter">All caught up</span>
      </div>
    </Flex>

    <Flex v-else column gap="m" class="pt-s">
      <template v-if="pastLoading">
        <Skeleton v-for="i in 4" :key="i" width="100%" :height="164" :radius="8" />
      </template>

      <template v-else>
        <GlowGroup>
          <Flex column gap="m" expand>
            <EventSmall
              v-for="event in pastEvents"
              :key="event.id"
              :data="event"
              :games="games"
              class="events-sheet__card"
            />
          </Flex>
        </GlowGroup>

        <p v-if="!pastEvents.length" class="text-s text-color-lighter">
          No past events yet.
        </p>

        <div v-else ref="pastSentinel" class="events-sheet__sentinel">
          <Spinner v-if="pastLoadingMore" />
          <span v-else-if="pastExhausted" class="text-xs text-color-lighter">That's everything</span>
        </div>
      </template>
    </Flex>
  </Sheet>
</template>

<style lang="scss" scoped>
// Matches the dashboard's section labels
.events-sheet__heading {
  font-size: var(--font-size-xs);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--color-text-lighter);
  margin: 0;

  &:not(:first-child) {
    margin-top: var(--space-s);
  }
}

// EventSmall's root is an inline link, which would shrink to its content
.events-sheet__card {
  display: block;
  width: 100%;
}

// Pulls the tab underline onto the sheet header's border
.events-sheet__tabs {
  margin-bottom: -13px;
}

.events-sheet__sentinel {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  padding: var(--space-m) 0;
  min-height: 48px;
}
</style>
