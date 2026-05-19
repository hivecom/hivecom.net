<script setup lang="ts">
import type { MetricsPeriod } from '@/composables/useDataMetrics'
import type { Tables } from '@/types/database.overrides'
import type { Database } from '@/types/database.types'
import { Badge, Button, Card, Flex, Grid, Indicator, Marquee, Skeleton, Tooltip } from '@dolanske/vui'
import { computed, onMounted, ref, watch } from 'vue'
import GameServerModal from '@/components/GameServers/GameServerModal.vue'
import BulkAvatarDisplay from '@/components/Shared/BulkAvatarDisplay.vue'
import ChartActivityHistogramModal from '@/components/Shared/Charts/ChartActivityHistogramModal.vue'
import ChartGameActivity from '@/components/Shared/Charts/ChartGameActivity.vue'
import GameCover from '@/components/Shared/GameCover.vue'
import GameIcon from '@/components/Shared/GameIcon.vue'
import GlowCard from '@/components/Shared/GlowCard.vue'
import GlowGroup from '@/components/Shared/GlowGroup.vue'
import OnlineBadge from '@/components/Shared/OnlineBadge.vue'
import { useDataGameAssets } from '@/composables/useDataGameAssets'
import { useDataGames } from '@/composables/useDataGames'
import { useDataGameservers } from '@/composables/useDataGameservers'
import { useDataMetrics } from '@/composables/useDataMetrics'
import { useBreakpoint } from '@/lib/mediaQuery'

const { games, loading: gamesLoading } = useDataGames()
const { gameservers } = useDataGameservers()
const { metrics, fetchMetrics, metricsHistory, loadingHistory, fetchMetricsHistory, scheduleRefresh } = useDataMetrics()
const { getGameCoverUrl, getGameBackgroundUrl } = useDataGameAssets()
const supabase = useSupabaseClient<Database>()
const user = useSupabaseUser()

const isMobile = useBreakpoint('<s')
const HISTORY_PERIOD: MetricsPeriod = '14d'

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
  scheduleRefresh(HISTORY_PERIOD)
  if (user.value)
    fetchCurrentPlayers()
})

watch(user, (u) => {
  if (u)
    fetchCurrentPlayers()
})

// ── Current players (authenticated only) ──────────────────────────────────────
// Map of steam_id (number) -> profile_ids of members playing right now
const currentPlayersBySteamId = ref<Map<number, string[]>>(new Map())

async function fetchCurrentPlayers() {
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
const marqueePaused = ref(false)

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
        <ClientOnly>
          <OnlineBadge :count="totalCurrentPlayers" label="Playing" clickable @click="activityModalOpen = true" />
          <template #fallback>
            <OnlineBadge :count="null" label="Playing" />
          </template>
        </ClientOnly>
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
            <!-- #1 - hero card: background fill, cover to the right -->
            <GlowCard halo>
              <Card class="top-game-hero" :padding="false">
                <div class="top-game-hero__info">
                  <Tooltip placement="top">
                    <Badge variant="neutral" size="s" circle>
                      <Icon name="ph:info" size="10" />
                    </Badge>
                    <template #tooltip>
                      <p>Most played games over the last 2 weeks by play duration</p>
                    </template>
                  </Tooltip>
                </div>
                <div
                  class="top-game-hero__bg"
                  :style="getCachedBackground(topGame.id)
                    ? { backgroundImage: `url(${getCachedBackground(topGame.id)})` }
                    : getCachedCover(topGame.id)
                      ? { backgroundImage: `url(${getCachedCover(topGame.id)})` }
                      : {}"
                />
                <div class="top-game-hero__inner">
                  <Flex expand x-between gap="l" :column="isMobile">
                    <!-- Left: info -->
                    <Flex column gap="s" class="top-game-hero__text">
                      <span class="text-xs text-bold text-color-lighter top-game-hero__rank">#1</span>
                      <Flex y-center gap="s">
                        <GameIcon :game="topGame" size="l" />
                        <h2 class="text-bold text-xxxxl">
                          {{ topGame.name }}
                        </h2>
                      </Flex>
                      <span class="text-s text-color-lighter">Played by {{ recentPlayersForGame(topGame.id) === 1 ? '1 person' : `${recentPlayersForGame(topGame.id)} people` }} recently</span>
                      <Flex class="top-game-hero__bottom" y-center gap="s">
                        <Flex v-if="user && currentPlayersForGame(topGame).length > 0" y-center gap="xs">
                          <Tooltip placement="top">
                            <Indicator variant="online" outline ripple />
                            <template #tooltip>
                              <p>Playing</p>
                            </template>
                          </Tooltip>
                          <BulkAvatarDisplay
                            :user-ids="currentPlayersForGame(topGame)"
                            :max-users="8"
                            :avatar-size="22"
                            :gap="-6"
                            :show-names="false"
                            cluster
                            no-empty-state
                          />
                        </Flex>
                        <Tooltip v-if="serverCountForGame(topGame.id) > 0" placement="top">
                          <Badge
                            variant="neutral"
                            size="m"
                            class="server-badge"
                            @click="openServerModal(topGame)"
                          >
                            <Icon name="ph:hard-drives" size="14" />
                            {{ serverCountForGame(topGame.id) }}
                          </Badge>
                          <template #tooltip>
                            <p>
                              {{ gameserverPlayersForGame(topGame.id) > 0 ? `${gameserverPlayersForGame(topGame.id)} playing on servers` : 'View servers' }}
                            </p>
                          </template>
                        </Tooltip>
                      </Flex>
                    </Flex>
                    <!-- Right: cover art -->
                    <Flex v-if="!isMobile" y-center class="top-game-hero__cover">
                      <GameCover :game="topGame" size="xl" aspect-ratio="card" :show-fallback="false" />
                    </Flex>
                  </Flex>
                </div>
              </Card>
            </GlowCard>

            <!-- #2 and #3 - smaller cards with background wash -->
            <Grid v-if="runnerUpGames.length > 0" :columns="isMobile ? 1 : 2" gap="m" align="stretch" class="mt-m">
              <GlowCard
                v-for="(game, i) in runnerUpGames"
                :key="game.id"
                halo
              >
                <Card class="top-game-card" :padding="false">
                  <div
                    class="top-game-card__bg"
                    :style="getCachedBackground(game.id)
                      ? { backgroundImage: `url(${getCachedBackground(game.id)})` }
                      : getCachedCover(game.id)
                        ? { backgroundImage: `url(${getCachedCover(game.id)})` }
                        : {}"
                  />
                  <div class="top-game-card__content">
                    <span class="text-xs text-bold text-color-lighter top-game-card__rank">#{{ i + 2 }}</span>
                    <Flex y-center gap="s">
                      <GameIcon :game="game" size="m" />
                      <span class="text-xxl text-bold">{{ game.name }}</span>
                    </Flex>
                    <span class="text-s text-color-lighter">Played by {{ recentPlayersForGame(game.id) === 1 ? '1 person' : `${recentPlayersForGame(game.id)} people` }} recently</span>
                    <Flex class="top-game-card__bottom" y-center gap="s">
                      <Flex v-if="user && currentPlayersForGame(game).length > 0" y-center gap="xs">
                        <Tooltip placement="top">
                          <Indicator variant="online" outline ripple />
                          <template #tooltip>
                            <p>Playing</p>
                          </template>
                        </Tooltip>
                        <BulkAvatarDisplay
                          :user-ids="currentPlayersForGame(game)"
                          :max-users="6"
                          :avatar-size="22"
                          :gap="-6"
                          :show-names="false"
                          cluster
                          no-empty-state
                        />
                      </Flex>
                      <Tooltip v-if="serverCountForGame(game.id) > 0" placement="top">
                        <Badge
                          variant="neutral"
                          size="m"
                          circle
                          class="server-badge"
                          @click="openServerModal(game)"
                        >
                          <Icon name="ph:hard-drives" size="14" />
                          {{ serverCountForGame(game.id) }}
                        </Badge>
                        <template #tooltip>
                          <p>
                            {{ gameserverPlayersForGame(game.id) > 0 ? `${gameserverPlayersForGame(game.id)} playing on servers` : 'View servers' }}
                          </p>
                        </template>
                      </Tooltip>
                    </Flex>
                  </div>
                </Card>
              </GlowCard>
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

      <!-- Marquee: game icons + names -->
      <section v-if="marqueeGames.length > 0" class="mt-m marquee-section" :class="{ 'marquee-section--paused': marqueePaused }" @mouseenter="marqueePaused = true" @mouseleave="marqueePaused = false">
        <Marquee direction="left" :speed="marqueeSpeed">
          <GlowGroup>
            <div
              v-for="game in marqueeGames"
              :key="game.id"
              class="marquee-item"
            >
              <GlowCard>
                <GameCover :game="game" size="xl" aspect-ratio="card" :show-fallback="false" />
              </GlowCard>
            </div>
          </GlowGroup>
        </Marquee>
      </section>

      <!-- CTA -->
      <section class="mt-m mb-m">
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

// ── #1 Hero card ──────────────────────────────────────────────────────────────
.top-game-hero {
  position: relative;
  overflow: hidden;
  padding: 0;

  :deep(.vui-card-content) {
    position: relative;
    overflow: hidden;
    height: 100%;
  }

  &__bg {
    position: absolute;
    inset: 0;
    z-index: 0;
    background-size: cover;
    background-position: center;
    opacity: 0.18;
    filter: blur(4px);
    scale: 1.08;
    pointer-events: none;
  }

  &__inner {
    position: relative;
    z-index: 1;
    isolation: isolate;
    padding: var(--space-xl);
    display: flex;
    min-height: 100%;
  }

  &__text {
    flex: 1;
    min-width: 0;
    height: 100%;

    :deep(.bulk-avatar-display__list) {
      justify-content: flex-start;
      margin: 0;
    }
  }

  &__info {
    position: absolute;
    top: var(--space-s);
    right: var(--space-s);
    z-index: 2;
  }

  &__bottom {
    margin-top: auto;
  }

  &__rank {
    text-transform: uppercase;
    letter-spacing: 0.1em;
  }

  &__cover {
    flex-shrink: 0;
    filter: drop-shadow(0 8px 24px rgba(0, 0, 0, 0.4));
  }
}

// ── #2 / #3 cards ─────────────────────────────────────────────────────────────
.top-game-card {
  position: relative;
  overflow: hidden;
  padding: 0;
  min-height: 140px;
  height: 100%;

  :deep(.vui-card-content) {
    position: relative;
    overflow: hidden;
    height: 100%;
  }

  &__bg {
    position: absolute;
    inset: 0;
    z-index: 0;
    background-size: cover;
    background-position: center;
    opacity: 0.12;
    filter: blur(3px);
    scale: 1.05;
    pointer-events: none;
  }

  &__content {
    position: relative;
    z-index: 1;
    isolation: isolate;
    padding: var(--space-m);
    display: flex;
    flex-direction: column;
    gap: var(--space-s);
    height: 100%;
  }

  &__rank {
    text-transform: uppercase;
    letter-spacing: 0.1em;
  }

  &__bottom {
    margin-top: auto;
  }
}

// ── Marquee ───────────────────────────────────────────────────────────────────
.marquee-section {
  mask-image: linear-gradient(to right, transparent, black 8%, black 92%, transparent);
  height: 20rem;
  overflow: hidden;

  &--paused {
    :deep(.marquee-track) {
      animation-play-state: paused;
    }
  }
}

.marquee-item {
  height: 18rem;
  margin-top: var(--space-xs);
  margin-bottom: var(--space-xs);
  flex-shrink: 0;

  :deep(.game-cover-container) {
    height: 100%;
    width: auto;
    aspect-ratio: 2 / 2.8;
  }

  :deep(.game-cover) {
    height: 100%;
    object-fit: cover;
    border-radius: var(--border-radius-s);
    filter: saturate(0);
    opacity: 0.5;
    transition: var(--transition-slow);
  }

  :deep(.glow-card:hover .game-cover),
  &:hover :deep(.game-cover) {
    filter: saturate(1);
    opacity: 1;
  }
}

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
.server-badge {
  cursor: pointer;
}

.cta-card {
  padding: var(--space-xl);
  background: linear-gradient(135deg, var(--color-bg-raised) 0%, var(--color-bg-medium) 100%);
  border: 1px solid var(--color-border);
}
</style>
