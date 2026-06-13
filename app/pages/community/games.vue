<script setup lang="ts">
import type { MetricsPeriod } from '@/composables/useDataMetrics'
import type { Tables } from '@/types/database.overrides'
import { Flex, Grid, PopoutHover, Skeleton } from '@dolanske/vui'
import { computed, defineAsyncComponent, onMounted, ref } from 'vue'
import GameEventsSection from '@/components/Community/Games/GameEventsSection.vue'
import GameMarquee from '@/components/Community/Games/GameMarquee.vue'
import GamePoppedOffCard from '@/components/Community/Games/GamePoppedOffCard.vue'
import GameRunnerUpCard from '@/components/Community/Games/GameRunnerUpCard.vue'
import GameSteamCallout from '@/components/Community/Games/GameSteamCallout.vue'
import GameTopCard from '@/components/Community/Games/GameTopCard.vue'
import RecentGameActivitySection from '@/components/Community/Games/RecentGameActivitySection.vue'
import GameServerModal from '@/components/GameServers/GameServerModal.vue'
import ChartActivityHistogramModal from '@/components/Shared/Charts/ChartActivityHistogramModal.vue'
import MetricsRefreshCountdown from '@/components/Shared/Charts/MetricsRefreshCountdown.vue'
import GameDetailsModal from '@/components/Shared/GameDetailsModal.vue'
import GlowGroup from '@/components/Shared/GlowGroup.vue'
import OnlineBadge from '@/components/Shared/OnlineBadge.vue'
import UserAvatar from '@/components/Shared/UserAvatar.vue'
import UserDisplay from '@/components/Shared/UserDisplay.vue'
import { useDataEvents } from '@/composables/useDataEvents'
import { useDataGameAssets } from '@/composables/useDataGameAssets'
import { useDataGames } from '@/composables/useDataGames'
import { useDataGameservers } from '@/composables/useDataGameservers'
import { useDataMetrics } from '@/composables/useDataMetrics'
import { useDataSteamPresences } from '@/composables/useDataSteamPresences'
import { useBreakpoint } from '@/lib/mediaQuery'
import { metricsPlayerCount } from '@/types/metrics'

const ChartGameActivity = defineAsyncComponent(() => import('@/components/Shared/Charts/ChartGameActivity.vue'))

const { games, loading: gamesLoading } = useDataGames()
const { gameservers } = useDataGameservers()
const { metrics, fetchMetrics, metricsHistory, loadingHistory, fetchMetricsHistory, scheduleRefresh, fetchMetricsHistoryIsolated } = useDataMetrics()
const { events, loading: eventsLoading } = useDataEvents()
const { getGameCoverUrl, getGameBackgroundUrl } = useDataGameAssets()
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

const { currentPlayersBySteamId, presencesLoading, currentPlayersForSteamId } = useDataSteamPresences()

function currentPlayersForGame(game: Tables<'games'>): string[] {
  return currentPlayersForSteamId(game.steam_id)
}

onMounted(() => {
  fetchMetrics()
  fetchMetricsHistory(HISTORY_PERIOD)
  loadingHistory30d.value = true
  fetchMetricsHistoryIsolated(POPPED_OFF_PERIOD)
    .then((entries) => { metricsHistory30d.value = entries })
    .finally(() => { loadingHistory30d.value = false })
  scheduleRefresh(HISTORY_PERIOD)
})

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

  const score = (id: string) => {
    const sum = gamePlaySums.value.get(id) ?? 0
    const peak = gamePlayTotals.value.get(id) ?? 0
    return sum + peak * 2
  }

  return [...games.value]
    .filter(g => gamePlaySums.value.has(String(g.id)))
    .sort((a, b) => score(String(b.id)) - score(String(a.id)))
    .slice(0, 3)
})

function recentPlayersForGame(gameId: number): number {
  return gamePlayTotals.value.get(String(gameId)) ?? 0
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
    total += metricsPlayerCount(byServer[String(gs.id)]) ?? 0
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

// Game details modal
const showDetailsModal = ref(false)
const selectedDetailsGameId = ref<number | null>(null)

function openDetailsModal(game: Tables<'games'>) {
  selectedDetailsGameId.value = game.id
  showDetailsModal.value = true
}

function openDetailsModalById(gameId: number) {
  selectedDetailsGameId.value = gameId
  showDetailsModal.value = true
}

function closeDetailsModal() {
  showDetailsModal.value = false
  selectedDetailsGameId.value = null
}

function handleDetailsOpenServers(gameId: number) {
  closeDetailsModal()
  const game = games.value.find(g => g.id === gameId)
  if (game)
    openServerModal(game)
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

// Popped-off game is "live" when there's an ongoing event featuring it
const isPoppedOffLive = computed(() => {
  const gameId = poppedOffGameId.value
  if (gameId == null)
    return false
  const now = Date.now()
  return events.value.some((e) => {
    if (!e.games?.includes(gameId))
      return false
    const start = new Date(e.date).getTime()
    const end = start + (e.duration_minutes ?? 120) * 60 * 1000
    return now >= start && now <= end
  })
})

// Convenience ref - TS can't narrow top3Games[0] through v-if in template
const topGame = computed(() => top3Games.value[0] ?? null)
const runnerUpGames = computed(() => top3Games.value.slice(1))

const allCurrentPlayerIds = computed<string[]>(() => {
  const seen = new Set<string>()
  for (const ids of currentPlayersBySteamId.value.values()) {
    for (const id of ids)
      seen.add(id)
  }
  return [...seen]
})

const totalCurrentPlayers = computed<number | null>(() => {
  if (currentPlayersBySteamId.value.size === 0)
    return 0
  let total = 0
  for (const players of currentPlayersBySteamId.value.values())
    total += players.length
  return total
})

// For anon users: sum active players from the latest metrics snapshot (byGame = Hivecom tracking, no auth required)
const metricsGameTotal = computed<number | null>(() => {
  const byGame = metrics.value?.users.byGame
  if (!byGame)
    return null
  return Object.values(byGame).reduce((a, b) => a + b, 0)
})

// Whichever count is appropriate for the current auth state
const displayPlayerCount = computed(() => user.value ? totalCurrentPlayers.value : metricsGameTotal.value)
</script>

<template>
  <div class="page container-l">
    <section class="page-title">
      <Flex y-center x-between expand>
        <h1>Games</h1>
        <PopoutHover v-if="user" :disabled="!totalCurrentPlayers || totalCurrentPlayers <= 0" placement="bottom-end">
          <template #trigger>
            <OnlineBadge
              :count="totalCurrentPlayers"
              label="Playing"
              :clickable="totalCurrentPlayers !== null"
              @click="totalCurrentPlayers !== null && (activityModalOpen = true)"
            />
          </template>
          <Flex column gap="xs" class="px-m py-s">
            <UserDisplay
              v-for="id in allCurrentPlayerIds"
              :key="id"
              :user-id="id"
              size="s"
              show-profile-preview
            />
          </Flex>
        </PopoutHover>
        <OnlineBadge
          v-else
          :count="metricsGameTotal"
          label="Playing"
          :clickable="!!metricsGameTotal && metricsGameTotal > 0"
          @click="metricsGameTotal && metricsGameTotal > 0 && (activityModalOpen = true)"
        />
      </Flex>
      <p>Something new something old - join the crowd!</p>
    </section>

    <ClientOnly>
      <!-- Top 3 games this week -->
      <section class="mb-xl">
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
              @open-details="openDetailsModal"
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
                @open-details="openDetailsModal"
              />
            </Grid>
          </GlowGroup>
        </template>
      </section>

      <!-- Recent games -->
      <section class="mt-m">
        <RecentGameActivitySection
          :current-players-by-steam-id="currentPlayersBySteamId"
          :games="games"
          :is-logged-in="!!user"
          :loading="presencesLoading"
          :metrics-history="metricsHistory"
        />
      </section>

      <!-- Game activity chart (no controls, always 14d) -->
      <section class="mt-m chart-section">
        <ChartGameActivity
          :period="HISTORY_PERIOD"
          :window="null"
          :skeleton-height="130"
          colorize
          :show-y-axis="true"
          hide-title
          hide-untracked
        >
          <Flex y-center x-between gap="s" expand>
            <Flex class="chart-section__subtitle" gap="xxs" y-center @click="activityModalOpen = true">
              <p class="text-color-lighter text-xxs">
                Last 14 days of game activity
              </p>
              <Icon size="14" name="ph:arrows-out" class="text-color-lighter" />
            </Flex>
          </Flex>
        </ChartGameActivity>
      </section>

      <!-- Marquee: game covers -->
      <GameMarquee v-if="marqueeGames.length > 0" :games="marqueeGames" :speed="marqueeSpeed" class="mb-xl" @select="openDetailsModalById" />

      <!-- Popped off (live) - rendered above events when an ongoing event features the game -->
      <section v-if="isPoppedOffLive && (poppedOffGameId !== null || loadingHistory30d)">
        <GamePoppedOffCard
          :metrics-history30d="metricsHistory30d"
          :loading="loadingHistory30d"
          :games="games"
          :events="events"
          :background-url="poppedOffGameId !== null ? getCachedBackground(poppedOffGameId) : ''"
          :cover-url="poppedOffGameId !== null ? getCachedCover(poppedOffGameId) : ''"
          live
        />
      </section>

      <!-- Game events -->
      <section class="mt-m">
        <Flex y-center x-between class="mb-s">
          <h3 class="section-title">
            Game Events
          </h3>
        </Flex>
        <GameEventsSection
          :events="events"
          :loading="eventsLoading"
          :games="games"
        />
      </section>

      <!-- Popped off (historical) -->
      <section v-if="!isPoppedOffLive && (poppedOffGameId !== null || loadingHistory30d)" class="mt-m">
        <GamePoppedOffCard
          :metrics-history30d="metricsHistory30d"
          :loading="loadingHistory30d"
          :games="games"
          :events="events"
          :background-url="poppedOffGameId !== null ? getCachedBackground(poppedOffGameId) : ''"
          :cover-url="poppedOffGameId !== null ? getCachedCover(poppedOffGameId) : ''"
        />
      </section>

      <GameSteamCallout class="mt-m" />
      <Flex x-end class="mt-s">
        <MetricsRefreshCountdown />
      </Flex>
      <ChartActivityHistogramModal
        v-model:open="activityModalOpen"
        title="Game Activity"
        :count="displayPlayerCount"
        count-label="Playing"
        count-singular="Playing"
        :series="['usersGameActivity']"
        :initial-period="HISTORY_PERIOD"
      >
        <template v-if="allCurrentPlayerIds.length > 0 || presencesLoading" #above-chart>
          <Flex expand wrap gap="xs" class="playing-users-modal__grid" y-center x-center>
            <template v-if="presencesLoading">
              <Skeleton
                v-for="n in Math.min(totalCurrentPlayers ?? 8, 20)"
                :key="n"
                width="40px"
                height="40px"
                style="border-radius: var(--border-radius-pill);"
              />
            </template>
            <template v-else>
              <UserAvatar
                v-for="id in allCurrentPlayerIds"
                :key="id"
                :user-id="id"
                size="m"
                linked
                show-preview
              />
            </template>
          </Flex>
        </template>
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
      <GameDetailsModal
        v-model:open="showDetailsModal"
        :game-id="selectedDetailsGameId"
        @close="closeDetailsModal"
        @open-servers="handleDetailsOpenServers"
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
    cursor: pointer;
    position: absolute;
    bottom: var(--space-s);
    right: var(--space-m);
  }
}

// ── Playing users modal grid ──────────────────────────────────────────────────
.playing-users-modal__grid {
  max-height: 148px;
  overflow-y: auto;
  padding: var(--space-xs);
  background: var(--color-bg-card);
  border-radius: var(--border-radius-m);
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
