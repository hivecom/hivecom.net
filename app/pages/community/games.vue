<script setup lang="ts">
import type { MetricsPeriod } from '@/composables/useDataMetrics'
import type { Tables } from '@/types/database.overrides'
import type { Database } from '@/types/database.types'
import { Button, Card, Flex, Grid, Skeleton } from '@dolanske/vui'
import { computed, onMounted, ref, watch } from 'vue'
import GameMarquee from '@/components/Community/Games/GameMarquee.vue'
import GamePoppedOffCard from '@/components/Community/Games/GamePoppedOffCard.vue'
import GameRunnerUpCard from '@/components/Community/Games/GameRunnerUpCard.vue'
import GamesPlayingNowSection from '@/components/Community/Games/GamesPlayingNowSection.vue'
import GameTopCard from '@/components/Community/Games/GameTopCard.vue'
import RecentGameEventsSection from '@/components/Community/Games/RecentGameEventsSection.vue'
import GameServerModal from '@/components/GameServers/GameServerModal.vue'
import ChartActivityHistogramModal from '@/components/Shared/Charts/ChartActivityHistogramModal.vue'
import ChartGameActivity from '@/components/Shared/Charts/ChartGameActivity.vue'
import GlowGroup from '@/components/Shared/GlowGroup.vue'
import OnlineBadge from '@/components/Shared/OnlineBadge.vue'
import { useDataEvents } from '@/composables/useDataEvents'
import { useDataGameAssets } from '@/composables/useDataGameAssets'
import { useDataGames } from '@/composables/useDataGames'
import { useDataGameservers } from '@/composables/useDataGameservers'
import { useDataMetrics } from '@/composables/useDataMetrics'
import { useBreakpoint } from '@/lib/mediaQuery'

const { games, loading: gamesLoading } = useDataGames()
const { gameservers } = useDataGameservers()
const { metrics, fetchMetrics, metricsHistory, loadingHistory, fetchMetricsHistory, scheduleRefresh, fetchMetricsHistoryIsolated } = useDataMetrics()
const { events, loading: eventsLoading } = useDataEvents()
const { getGameCoverUrl, getGameBackgroundUrl } = useDataGameAssets()
const supabase = useSupabaseClient<Database>()
const user = useSupabaseUser()

const isMobile = useBreakpoint('<s')
const HISTORY_PERIOD: MetricsPeriod = '14d'
const POPPED_OFF_PERIOD: MetricsPeriod = '30d'
const metricsHistory30d = ref<import('@/composables/useDataMetrics').MetricsHistoryEntry[]>([])
const loadingHistory30d = ref(false)

useSeoMeta({
  title: 'Games',
  description: 'Discover the games played in the Hivecom community.',
  ogTitle: 'Games',
  ogDescription: 'Discover the games played in the Hivecom community.',
})

defineOgImage('Default', {
  title: 'Games',
  description: 'Discover the games played in the Hivecom community.',
})

onMounted(() => {
  fetchMetrics()
  fetchMetricsHistory(HISTORY_PERIOD)
  loadingHistory30d.value = true
  fetchMetricsHistoryIsolated(POPPED_OFF_PERIOD)
    .then((entries) => { metricsHistory30d.value = entries })
    .finally(() => { loadingHistory30d.value = false })
  scheduleRefresh(HISTORY_PERIOD)
  if (user.value)
    fetchCurrentPlayers()
})

watch(user, (u) => {
  if (u)
    fetchCurrentPlayers()
})

// ── Current players (authenticated only) ─────────────────────────────────────────────
// Map of steam_id (number) -> profile_ids of members playing right now
const currentPlayersBySteamId = ref<Map<number, string[]>>(new Map())
const presencesLoading = ref(false)

async function fetchCurrentPlayers() {
  presencesLoading.value = true
  const { data } = await supabase
    .from('presences_steam')
    .select('profile_id, current_app_id')
    .not('current_app_id', 'is', null)
  if (!data)
    return
  const map = new Map<number, string[]>()
  for (const row of data) {
    if (row.current_app_id == null)
      continue
    const existing = map.get(row.current_app_id) ?? []
    existing.push(row.profile_id)
    map.set(row.current_app_id, existing)
  }
  currentPlayersBySteamId.value = map
  presencesLoading.value = false
}

function currentPlayersForGame(game: Tables<'games'>): string[] {
  if (game.steam_id == null)
    return []
  return currentPlayersBySteamId.value.get(game.steam_id) ?? []
}

// ── Top 3 games this week ─────────────────────────────────────────────────────
// Sum across history for ranking; peak for display
const gamePlaySums = computed(() => {
  const totals = new Map<string, number>()
  for (const entry of metricsHistory.value) {
    if (!entry.usersByGame)
      continue
    for (const [id, count] of Object.entries(entry.usersByGame))
      totals.set(id, (totals.get(id) ?? 0) + count)
  }
  return totals
})

const gamePlayTotals = computed(() => {
  const totals = new Map<string, number>()
  for (const entry of metricsHistory.value) {
    if (!entry.usersByGame)
      continue
    for (const [id, count] of Object.entries(entry.usersByGame))
      totals.set(id, Math.max(totals.get(id) ?? 0, count))
  }
  return totals
})

// Aggregate usersByGame across all history buckets, pick top 3
const top3Games = computed(() => {
  if (!games.value.length || !metricsHistory.value.length)
    return []

  return [...games.value]
    .filter(g => gamePlaySums.value.has(String(g.id)))
    .sort((a, b) => (gamePlaySums.value.get(String(b.id)) ?? 0) - (gamePlaySums.value.get(String(a.id)) ?? 0))
    .slice(0, 3)
})

function recentPlayersForGame(gameId: number): number {
  return gamePlayTotals.value.get(String(gameId)) ?? 0
}

// ── Marquee: up to 100 random games ──────────────────────────────────────────
const marqueeSpeed = ref(30)

const marqueeGames = computed(() => {
  const shuffled = [...games.value].sort(() => Math.random() - 0.5)
  return shuffled.slice(0, 100)
})

// Load covers for marquee games
watch(marqueeGames, (list) => {
  if (list.length > 0)
    loadAssetsForGames(list)
}, { immediate: true })

function serverCountForGame(gameId: number): number {
  return gameservers.value.filter(gs => gs.game === gameId).length
}

function gameserversForGame(gameId: number) {
  return gameservers.value.filter(gs => gs.game === gameId)
}

// Players on gameservers (from metrics, not presences)
function gameserverPlayersForGame(gameId: number): number {
  if (!metrics.value)
    return 0
  const byServer = metrics.value.gameservers.byServer
  const servers = gameservers.value.filter(gs => gs.game === gameId && gs.query_protocol != null)
  let total = 0
  for (const gs of servers) {
    const detail = byServer[String(gs.id)]
    if (!detail?.data)
      continue
    const count = detail.protocol === 'minecraft'
      ? (detail.data as { numPlayers?: number }).numPlayers
      : detail.protocol === 'source'
        ? (detail.data as { players?: number }).players
        : null
    total += count ?? 0
  }
  return total
}

// Gameserver modal
const activityModalOpen = ref(false)
const showServerModal = ref(false)
const serverModalGame = ref<typeof games.value[0] | null>(null)

function openServerModal(game: typeof games.value[0]) {
  serverModalGame.value = game
  showServerModal.value = true
}

function closeServerModal() {
  showServerModal.value = false
  serverModalGame.value = null
}

// ── Background loading for top 3 cards ───────────────────────────────────────
const gameBackgrounds = ref<Map<number, string>>(new Map())
const gameCovers = ref<Map<number, string>>(new Map())

function getCachedBackground(gameId: number): string {
  return gameBackgrounds.value.get(gameId) ?? ''
}

function getCachedCover(gameId: number): string {
  return gameCovers.value.get(gameId) ?? ''
}

async function loadAssetsForGames(list: Tables<'games'>[]) {
  await Promise.all(list.map(async (game) => {
    if (!gameBackgrounds.value.has(game.id)) {
      const url = await getGameBackgroundUrl(game).catch(() => null)
      gameBackgrounds.value.set(game.id, url ?? '')
    }
    if (!gameCovers.value.has(game.id)) {
      const url = await getGameCoverUrl(game).catch(() => null)
      gameCovers.value.set(game.id, url ?? '')
    }
  }))
}

watch(top3Games, list => list.length > 0 && loadAssetsForGames(list), { immediate: true })

// ── Popped-off game asset loading ─────────────────────────────────────────────
const poppedOffGameId = computed<number | null>(() => {
  if (!metricsHistory30d.value.length || !games.value.length)
    return null
  let bestId: string | null = null
  let peak = 0
  for (const entry of metricsHistory30d.value) {
    if (!entry.usersByGame)
      continue
    for (const [id, count] of Object.entries(entry.usersByGame)) {
      if (count > peak) {
        peak = count
        bestId = id
      }
    }
  }
  if (!bestId || peak < 2)
    return null
  return games.value.find(g => String(g.id) === bestId)?.id ?? null
})

watch(poppedOffGameId, async (id) => {
  if (id == null)
    return
  const game = games.value.find(g => g.id === id)
  if (game)
    await loadAssetsForGames([game])
}, { immediate: true })

// Convenience ref - TS can't narrow top3Games[0] through v-if in template
const topGame = computed(() => top3Games.value[0] ?? null)
const runnerUpGames = computed(() => top3Games.value.slice(1))

const totalCurrentPlayers = computed<number | null>(() => {
  if (currentPlayersBySteamId.value.size === 0)
    return 0
  let total = 0
  for (const players of currentPlayersBySteamId.value.values())
    total += players.length
  return total
})
</script>

<template>
  <div class="page container-l">
    <section class="page-title">
      <Flex y-center x-between expand>
        <h1>Games</h1>
        <OnlineBadge
          :count="totalCurrentPlayers"
          label="Playing"
          :clickable="totalCurrentPlayers !== null"
          @click="totalCurrentPlayers !== null && (activityModalOpen = true)"
        />
      </Flex>
      <p>Something new something old - join the crowd!</p>
    </section>

    <ClientOnly>
      <!-- Top 3 games this week -->
      <section>
        <!-- Loading -->
        <template v-if="loadingHistory || gamesLoading">
          <Skeleton :height="isMobile ? 160 : 220" :radius="8" class="mb-m" />
          <Grid :columns="isMobile ? 1 : 2" gap="m">
            <Skeleton v-for="i in 2" :key="i" :height="isMobile ? 120 : 160" :radius="8" />
          </Grid>
        </template>

        <template v-else-if="topGame">
          <GlowGroup>
            <!-- #1 - hero card -->
            <GameTopCard
              :game="topGame"
              :rank="1"
              :recent-players="recentPlayersForGame(topGame.id)"
              :current-player-ids="currentPlayersForGame(topGame)"
              :server-count="serverCountForGame(topGame.id)"
              :server-player-count="gameserverPlayersForGame(topGame.id)"
              :background-url="getCachedBackground(topGame.id)"
              :cover-url="getCachedCover(topGame.id)"
              :show-current-players="!!user"
              @open-server-modal="openServerModal"
            />

            <!-- #2 and #3 - smaller cards -->
            <Grid v-if="runnerUpGames.length > 0" :columns="isMobile ? 1 : 2" gap="m" align="stretch" class="mt-m">
              <GameRunnerUpCard
                v-for="(game, i) in runnerUpGames"
                :key="game.id"
                :game="game"
                :rank="i + 2"
                :recent-players="recentPlayersForGame(game.id)"
                :current-player-ids="currentPlayersForGame(game)"
                :server-count="serverCountForGame(game.id)"
                :server-player-count="gameserverPlayersForGame(game.id)"
                :background-url="getCachedBackground(game.id)"
                :cover-url="getCachedCover(game.id)"
                :show-current-players="!!user"
                @open-server-modal="openServerModal"
              />
            </Grid>
          </GlowGroup>
        </template>
      </section>

      <!-- Game activity chart (no controls, always 14d) -->
      <section class="mt-m chart-section">
        <ChartGameActivity
          :period="HISTORY_PERIOD"
          :window="null"
          colorize
          :show-y-axis="true"
          hide-title
          hide-untracked
        />
        <p class="chart-section__subtitle text-color-lighter text-xxs">
          Last 14 days of game activity
        </p>
      </section>

      <!-- Playing right now -->
      <section class="mt-m">
        <GamesPlayingNowSection
          :current-players-by-steam-id="currentPlayersBySteamId"
          :games="games"
          :is-logged-in="!!user"
          :loading="presencesLoading"
        />
      </section>

      <!-- This popped off -->
      <section v-if="poppedOffGameId !== null || loadingHistory30d" class="mt-m">
        <GamePoppedOffCard
          :metrics-history30d="metricsHistory30d"
          :loading="loadingHistory30d"
          :games="games"
          :events="events"
          :background-url="poppedOffGameId !== null ? getCachedBackground(poppedOffGameId) : ''"
          :cover-url="poppedOffGameId !== null ? getCachedCover(poppedOffGameId) : ''"
        />
      </section>

      <!-- Recent game events -->
      <section class="mt-m">
        <RecentGameEventsSection
          :events="events"
          :loading="eventsLoading"
          :games="games"
        />
      </section>

      <!-- Marquee: game covers -->
      <GameMarquee v-if="marqueeGames.length > 0" :games="marqueeGames" :speed="marqueeSpeed" class="mt-m" />

      <!-- CTA -->
      <section class="mt-m">
        <Card class="cta-card">
          <Flex :column="isMobile" gap="l" y-center x-between expand>
            <Flex column gap="xs">
              <h2 class="text-bold text-xl">
                Ready to play?
              </h2>
              <p class="text-color-lighter">
                Browse our game servers, see who's online, and connect directly from your browser.
              </p>
            </Flex>
            <NuxtLink to="/servers/gameservers" :class="isMobile ? 'w-100' : ''">
              <Button :expand="isMobile" variant="accent">
                <template #end>
                  <Icon name="ph:arrow-right" />
                </template>
                Browse Servers
              </Button>
            </NuxtLink>
          </Flex>
        </Card>
      </section>
      <ChartActivityHistogramModal
        v-model:open="activityModalOpen"
        title="Game Activity"
        :count="totalCurrentPlayers"
        count-label="Playing"
        count-singular="Playing"
        :series="['usersGameActivity']"
        :initial-period="HISTORY_PERIOD"
      >
        <template #default="{ period, window, utc, color }">
          <ChartGameActivity :period :window :utc :color hide-title />
        </template>
      </ChartActivityHistogramModal>
      <GameServerModal
        :open="showServerModal"
        :game="serverModalGame"
        :gameservers="serverModalGame ? gameserversForGame(serverModalGame.id) : []"
        @close="closeServerModal"
      />
    </ClientOnly>
  </div>
</template>

<style lang="scss" scoped>
@use '@/assets/breakpoints.scss' as *;

// ── Chart section ────────────────────────────────────────────────────────────
.chart-section {
  position: relative;

  :deep(.chart-container) {
    min-height: 0;
  }

  :deep(.chart-wrapper) {
    height: 160px;
  }

  :deep(.chart-loading),
  :deep(.chart-error),
  :deep(.chart-empty) {
    height: 160px;
  }

  :deep(.chart-lines-skeleton) {
    height: 130px !important;
  }

  :deep(.y-axis-skeleton) {
    height: 130px !important;
  }

  &__subtitle {
    position: absolute;
    bottom: var(--space-s);
    right: var(--space-m);
  }
}

// ── CTA ───────────────────────────────────────────────────────────────────────
.cta-card {
  padding: var(--space-xl);
  background: linear-gradient(135deg, var(--color-bg-raised) 0%, var(--color-bg-medium) 100%);
  border: 1px solid var(--color-border);
}

// ── Page title row ────────────────────────────────────────────────────────────
// Ensure the h1 shrinks and the online badge stays on the same row
.page-title {
  h1 {
    flex-shrink: 1;
    min-width: 0;
  }
}
</style>
