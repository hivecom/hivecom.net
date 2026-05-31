<script setup lang="ts">
import type { MetricsHistoryEntry } from '@/composables/useDataMetrics'
import type { Tables } from '@/types/database.overrides'
import { Button, Card, Flex, Grid, Sheet, Skeleton, Spinner } from '@dolanske/vui'
import { computed, nextTick, onUnmounted, ref, watch } from 'vue'
import RecentGameActivityTile from '@/components/Community/Games/RecentGameActivityTile.vue'
import GlowCard from '@/components/Shared/GlowCard.vue'
import GlowGroup from '@/components/Shared/GlowGroup.vue'
import { useDataMetrics } from '@/composables/useDataMetrics'
import { useBreakpoint } from '@/lib/mediaQuery'

const props = defineProps<{
  // Map of steam_id (number) -> array of profile_ids currently playing
  currentPlayersBySteamId: Map<number, string[]>
  // Full games list to cross-reference steam_id -> game
  games: Tables<'games'>[]
  // Whether the current user is authenticated
  isLoggedIn: boolean
  // Whether the presences data is still loading
  loading: boolean
  // Metrics history buckets for "recently played" fallback
  metricsHistory?: MetricsHistoryEntry[]
}>()

const isMobile = useBreakpoint('<s')
const { fetchMetricsHistoryIsolated } = useDataMetrics()

interface NowPlayingEntry {
  game: Tables<'games'>
  playerIds: string[]
  live: true
}

interface RecentlyPlayedEntry {
  game: Tables<'games'>
  playerIds: string[]
  live: false
  lastSeen: number
  peakCount: number
}

type PlayingEntry = NowPlayingEntry | RecentlyPlayedEntry

// Games with live players right now (auth-gated)
const nowPlaying = computed<NowPlayingEntry[]>(() => {
  if (!props.isLoggedIn)
    return []

  const entries: NowPlayingEntry[] = []
  for (const [steamId, playerIds] of props.currentPlayersBySteamId) {
    const game = props.games.find(g => g.steam_id === steamId)
    if (game)
      entries.push({ game, playerIds, live: true })
  }
  return entries.sort((a, b) => b.playerIds.length - a.playerIds.length).slice(0, 4)
})

// Set of game IDs already shown as live - used to avoid duplication
const liveGameIds = computed(() => new Set(nowPlaying.value.map(e => e.game.id)))

// Build a map of game id -> { lastSeen, peakCount } from the full metrics history
function buildRecentlyPlayedMap(history: MetricsHistoryEntry[]): Map<number, { lastSeen: number, peakCount: number }> {
  const byGameId = new Map<number, { lastSeen: number, peakCount: number }>()
  const sortedHistory = [...history].sort((a, b) => new Date(a.capturedAt).getTime() - new Date(b.capturedAt).getTime())
  for (const entry of sortedHistory) {
    if (!entry.usersByGame)
      continue
    const capturedAt = new Date(entry.capturedAt).getTime()
    for (const [idStr, count] of Object.entries(entry.usersByGame)) {
      if (!count || count < 1)
        continue
      const id = Number(idStr)
      if (Number.isNaN(id))
        continue
      const existing = byGameId.get(id)
      if (existing === undefined || capturedAt > existing.lastSeen) {
        byGameId.set(id, { lastSeen: capturedAt, peakCount: count })
      }
      else if (existing && count > existing.peakCount) {
        existing.peakCount = count
      }
    }
  }
  return byGameId
}

// Recently played games from metricsHistory (last ~14d), excluding live ones
// We pick the most recently active bucket per game and take top results
const recentlyPlayed = computed<RecentlyPlayedEntry[]>(() => {
  const history = props.metricsHistory
  if (!history?.length || !props.isLoggedIn)
    return []

  const byGameId = buildRecentlyPlayedMap(history)
  const entries: RecentlyPlayedEntry[] = []
  for (const [gameId, { lastSeen, peakCount }] of byGameId) {
    if (liveGameIds.value.has(gameId))
      continue
    const game = props.games.find(g => g.id === gameId)
    if (!game)
      continue
    entries.push({ game, playerIds: [], live: false, lastSeen, peakCount })
  }

  const slots = Math.max(0, 4 - nowPlaying.value.length)
  return entries.sort((a, b) => b.lastSeen - a.lastSeen).slice(0, slots)
})

const allEntries = computed<PlayingEntry[]>(() => [
  ...nowPlaying.value,
  ...recentlyPlayed.value,
])

const sectionTitle = computed(() => {
  if (!props.isLoggedIn)
    return null
  if (allEntries.value.length === 0)
    return null
  return 'Most Recently Played'
})

// ── Sheet ──────────────────────────────────────────────────────────────────

const PAGE_SIZE = 12

const sheetOpen = ref(false)
const sheetHistory = ref<MetricsHistoryEntry[]>([])
const sheetHistoryLoading = ref(false)
const sheetPage = ref(1)
const sentinel = ref<HTMLElement | null>(null)
let observer: IntersectionObserver | null = null

// Full sorted entry list for the sheet, built from 90d history once loaded,
// falling back to the 14d prop until then
const allEntriesSheet = computed<PlayingEntry[]>(() => {
  const history = sheetHistory.value.length
    ? [...(props.metricsHistory ?? []), ...sheetHistory.value]
    : (props.metricsHistory ?? [])
  if (!history.length || !props.isLoggedIn)
    return [...nowPlaying.value]

  const byGameId = buildRecentlyPlayedMap(history)
  const recent: RecentlyPlayedEntry[] = []
  for (const [gameId, { lastSeen, peakCount }] of byGameId) {
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

const sheetVisible = computed(() => allEntriesSheet.value.slice(0, sheetPage.value * PAGE_SIZE))
const sheetExhausted = computed(() => sheetVisible.value.length >= allEntriesSheet.value.length)

function setupSentinel() {
  if (!sentinel.value)
    return
  observer = new IntersectionObserver(
    (entries) => {
      if (entries[0]?.isIntersecting && !sheetExhausted.value)
        sheetPage.value++
    },
    { threshold: 0.1 },
  )
  observer.observe(sentinel.value)
}

watch(sheetOpen, async (open) => {
  if (!open) {
    observer?.disconnect()
    observer = null
    sheetPage.value = 1
    return
  }

  if (!sheetHistory.value.length) {
    sheetHistoryLoading.value = true
    sheetHistory.value = await fetchMetricsHistoryIsolated('90d')
    sheetHistoryLoading.value = false
  }

  await nextTick()
  setupSentinel()
})

onUnmounted(() => {
  observer?.disconnect()
})
</script>

<template>
  <!-- Sign-in CTA for unauthenticated users -->
  <template v-if="!isLoggedIn">
    <Card class="recent-game-activity-signin">
      <Flex column gap="l" y-center class="recent-game-activity-signin__content">
        <div class="recent-game-activity-signin__icon">
          <Icon name="ph:game-controller" size="5rem" />
        </div>
        <h3 class="text-bold text-xxl">
          See Who's Playing
        </h3>
        <p class="text-color-light text-center">
          Sign in to see which games are being played right now
        </p>
        <NuxtLink to="/auth/sign-in">
          <Button variant="accent">
            <template #start>
              <Icon name="ph:sign-in" />
            </template>
            Sign In
          </Button>
        </NuxtLink>
      </Flex>
    </Card>
  </template>

  <!-- Loading skeleton -->
  <template v-else-if="loading">
    <Grid :columns="isMobile ? 1 : 4" gap="m">
      <Skeleton v-for="i in 4" :key="i" :height="100" :radius="8" />
    </Grid>
  </template>

  <!-- Empty state: no live players and no recent history -->
  <template v-else-if="allEntries.length === 0">
    <p class="text-s text-color-lighter">
      No recent game activity to show.
    </p>
  </template>

  <!-- Tiles -->
  <template v-else>
    <Flex y-center x-between gap="s" class="mb-s">
      <h3 v-if="sectionTitle" class="section-title">
        {{ sectionTitle }}
      </h3>
      <Button size="s" outline @click="sheetOpen = true">
        View All
        <template #end>
          <Icon name="ph:caret-up-down" />
        </template>
      </Button>
    </Flex>

    <Sheet :open="sheetOpen" :size="456" @close="sheetOpen = false">
      <template #header>
        <h4>Recently Played</h4>
      </template>

      <!-- Loading skeleton while fetching 90d history -->
      <Flex v-if="sheetHistoryLoading" column gap="s" class="pt-s">
        <Skeleton v-for="i in 8" :key="i" width="100%" height="62px" :radius="8" />
      </Flex>

      <Flex v-else column gap="s" class="pt-s">
        <RecentGameActivityTile
          v-for="entry in sheetVisible"
          :key="entry.game.id"
          :game="entry.game"
          :live="entry.live"
          :player-ids="entry.playerIds"
          :last-seen="entry.live ? undefined : entry.lastSeen"
          :peak-count="entry.live ? undefined : entry.peakCount"
        />

        <div ref="sentinel" class="recent-game-activity__sentinel">
          <Spinner v-if="!sheetExhausted" />
          <span v-else class="text-xs text-color-lighter">All caught up</span>
        </div>
      </Flex>
    </Sheet>

    <GlowGroup>
      <Grid :columns="isMobile ? 1 : 4" gap="m">
        <GlowCard v-for="entry in allEntries" :key="entry.game.id">
          <RecentGameActivityTile
            :game="entry.game"
            :live="entry.live"
            :player-ids="entry.playerIds"
            :last-seen="entry.live ? undefined : entry.lastSeen"
            :peak-count="entry.live ? undefined : entry.peakCount"
          />
        </GlowCard>
      </Grid>
    </GlowGroup>
  </template>
</template>

<style lang="scss" scoped>
// Sign-in Prompt
.recent-game-activity-signin {
  min-height: 200px;
  border: 2px dashed var(--color-border);
  text-align: center;

  &__content {
    padding: var(--space-xl);
  }

  &__icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 80px;
    height: 80px;
    border-radius: var(--border-radius-pill);
    background: linear-gradient(135deg, var(--color-accent-weak), var(--color-accent-alpha));
    color: var(--color-accent);
    margin: 0 auto;
  }
}

// Infinite-scroll sentinel
.recent-game-activity__sentinel {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  padding: var(--space-m) 0;
  min-height: 48px;
}
</style>
