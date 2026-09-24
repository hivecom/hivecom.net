<script setup lang="ts">
import type { MetricsHistoryEntry } from '@/composables/useDataMetrics'
import type { PlayingEntry, RecentlyPlayedEntry } from '@/lib/games/recentActivity'
import type { Tables } from '@/types/database.overrides'
import { Flex, Sheet, Skeleton, Spinner } from '@dolanske/vui'
import { computed, nextTick, onUnmounted, ref, watch } from 'vue'
import RecentGameActivityTile from '@/components/Community/Games/RecentGameActivityTile.vue'
import { useDataMetrics } from '@/composables/useDataMetrics'
import { buildNowPlaying, buildRecentlyPlayedMap } from '@/lib/games/recentActivity'

// One component for every surface that shows a slice of the list, so they can't
// disagree about what the community has played.
const props = defineProps<{
  open: boolean
  games: Tables<'games'>[]
  currentPlayersBySteamId: Map<number, string[]>
  isLoggedIn: boolean
  /** Shorter window the caller already has, shown until the 90d pull lands. */
  metricsHistory?: MetricsHistoryEntry[]
}>()

const emit = defineEmits<{ close: [] }>()

const PAGE_SIZE = 12

const { fetchMetricsHistoryIsolated } = useDataMetrics()

const history90d = ref<MetricsHistoryEntry[]>([])
const historyLoading = ref(false)
const page = ref(1)
const sentinel = ref<HTMLElement | null>(null)
let observer: IntersectionObserver | null = null

const nowPlaying = computed(() => buildNowPlaying(props.currentPlayersBySteamId, props.games, props.isLoggedIn))
const liveGameIds = computed(() => new Set(nowPlaying.value.map(e => e.game.id)))

// Built from the 90d pull once it's in, falling back to whatever window the
// caller handed us so the sheet has something to show on the first frame.
const allEntries = computed<PlayingEntry[]>(() => {
  const history = history90d.value.length
    ? [...(props.metricsHistory ?? []), ...history90d.value]
    : (props.metricsHistory ?? [])

  if (!history.length || !props.isLoggedIn)
    return [...nowPlaying.value]

  const recent: RecentlyPlayedEntry[] = []

  for (const [gameId, { lastSeen, peakCount }] of buildRecentlyPlayedMap(history)) {
    const game = props.games.find(g => g.id === gameId)
    if (!game)
      continue

    recent.push({ game, playerIds: [], live: false, lastSeen, peakCount })
  }

  recent.sort((a, b) => b.lastSeen - a.lastSeen)

  return [
    ...nowPlaying.value,
    ...recent.filter(e => !liveGameIds.value.has(e.game.id)),
  ]
})

const visible = computed(() => allEntries.value.slice(0, page.value * PAGE_SIZE))
const exhausted = computed(() => visible.value.length >= allEntries.value.length)

function setupSentinel(): void {
  if (!sentinel.value)
    return

  observer = new IntersectionObserver(
    (entries) => {
      if (entries[0]?.isIntersecting && !exhausted.value)
        page.value++
    },
    { threshold: 0.1 },
  )
  observer.observe(sentinel.value)
}

watch(() => props.open, async (open) => {
  if (!open) {
    observer?.disconnect()
    observer = null
    page.value = 1
    return
  }

  // Fetched once per mount: the window is 90 days, so a reopen minutes later
  // has nothing new to learn.
  if (!history90d.value.length) {
    historyLoading.value = true
    history90d.value = await fetchMetricsHistoryIsolated('90d')
    historyLoading.value = false
  }

  await nextTick()
  setupSentinel()
})

onUnmounted(() => {
  observer?.disconnect()
})
</script>

<template>
  <Sheet :open="open" :size="456" @close="emit('close')">
    <template #header>
      <h4>Recently Played</h4>
    </template>

    <Flex v-if="historyLoading" column gap="s" class="pt-s">
      <Skeleton v-for="i in 8" :key="i" width="100%" height="62px" :radius="8" />
    </Flex>

    <Flex v-else column gap="s" class="pt-s">
      <RecentGameActivityTile
        v-for="entry in visible"
        :key="entry.game.id"
        :game="entry.game"
        :live="entry.live"
        :player-ids="entry.playerIds"
        :last-seen="entry.live ? undefined : entry.lastSeen"
        :peak-count="entry.live ? undefined : entry.peakCount"
      />

      <div ref="sentinel" class="recently-played-sheet__sentinel">
        <Spinner v-if="!exhausted" />
        <span v-else class="text-xs text-color-lighter">All caught up</span>
      </div>
    </Flex>
  </Sheet>
</template>

<style lang="scss" scoped>
.recently-played-sheet__sentinel {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  padding: var(--space-m) 0;
  min-height: 48px;
}
</style>
