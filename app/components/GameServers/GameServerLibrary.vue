<script setup lang="ts">
import type { Tables } from '@/types/database.overrides'
import { Alert, Badge, BadgeGroup, Indicator, Popout, Skeleton, Tooltip } from '@dolanske/vui'
import EventPopoverList from '@/components/Events/EventPopoverList.vue'
import GameServerModal from '@/components/GameServers/GameServerModal.vue'
import ErrorAlert from '@/components/Shared/ErrorAlert.vue'

import GlowCard from '@/components/Shared/GlowCard.vue'
import GlowGroup from '@/components/Shared/GlowGroup.vue'
import { useDataMetrics } from '@/composables/useDataMetrics'
import { useOngoingEvents } from '@/composables/useOngoingEvents'

const props = defineProps<Props>()

type GameserverWithContainer = Tables<'network_gameservers'> & {
  container?: (Tables<'network_containers'> & {
    server?: {
      docker_control?: boolean | null
      accessible?: boolean | null
    } | null
  }) | null
}

type GameserversType = GameserverWithContainer[]

interface Props {
  games?: Tables<'games'>[]
  gameservers?: GameserversType
  loading: boolean
  errorMessage: string
  filteredGames: Tables<'games'>[]
}

const { metrics, fetchMetrics } = useDataMetrics()
const { getOngoingEventsForGame, hasOngoingEventForGame } = useOngoingEvents()

const livePopoutOpen = ref<Map<number, boolean>>(new Map())
function toggleLivePopout(gameId: number, event: Event) {
  event.stopPropagation()
  livePopoutOpen.value = new Map(livePopoutOpen.value)
  livePopoutOpen.value.set(gameId, !(livePopoutOpen.value.get(gameId) ?? false))
}
function closeLivePopout(gameId: number) {
  if (livePopoutOpen.value.get(gameId)) {
    livePopoutOpen.value = new Map(livePopoutOpen.value)
    livePopoutOpen.value.set(gameId, false)
  }
}

const liveIndicatorRefs = ref<Map<number, HTMLElement>>(new Map())
function setLiveIndicatorRef(gameId: number, el: HTMLElement | null) {
  if (el)
    liveIndicatorRefs.value.set(gameId, el)
  else liveIndicatorRefs.value.delete(gameId)
}

onMounted(() => {
  if (metrics.value === null)
    fetchMetrics()
})

function getPlayersForGame(gameId: number): number | null {
  if (!metrics.value || !props.gameservers)
    return null
  const byServer = metrics.value.gameservers.byServer
  const servers = props.gameservers.filter(gs => gs.game === gameId && gs.query_protocol != null)
  if (!servers.length)
    return null
  let total = 0
  for (const gs of servers) {
    const detail = byServer[String(gs.id)]
    if (!detail?.data)
      continue
    const count = detail.protocol === 'minecraft'
      ? detail.data.numPlayers
      : detail.protocol === 'source'
        ? detail.data.players
        : null
    total += count ?? 0
  }
  return total
}

const showModal = ref(false)
const selectedGame = ref<Tables<'games'> | null>(null)
const selectedGameServers = ref<GameserversType>([])
const gameCovers = ref<Map<number, string>>(new Map())
const coverLoadingStates = ref<Set<number>>(new Set())

function compareGameServerName(a: GameserversType[0], b: GameserversType[0]) {
  const nameA = a.name ?? ''
  const nameB = b.name ?? ''

  const byName = nameA.localeCompare(nameB, undefined, { sensitivity: 'base' })
  return byName !== 0 ? byName : String(a.id ?? '').localeCompare(String(b.id ?? ''))
}

async function openGameModal(game: Tables<'games'>) {
  selectedGame.value = game
  selectedGameServers.value = props.gameservers?.filter((gs: GameserversType[0]) => gs.game === game.id) || [].toSorted(compareGameServerName)
  showModal.value = true
}

function closeModal() {
  showModal.value = false
  selectedGame.value = null
  selectedGameServers.value = []
}

function getServerCountForGame(gameId: number) {
  return props.gameservers?.filter((gs: GameserversType[0]) => gs.game === gameId).length || 0
}

// Get game cover image using the cached composable
async function getGameCover(game: Tables<'games'>) {
  const { getGameCoverUrl } = useDataGameAssets()
  const coverUrl = await getGameCoverUrl(game)
  // Return empty string if no cover to show only the small logo
  return coverUrl || ''
}

function handleCoverLoad(event: Event) {
  const target = event.target as HTMLImageElement
  if (target) {
    // Trigger the fade-in effect
    target.classList.add('cover-loaded')
  }
}

// Load game covers when filtered games change
watch(() => props.filteredGames, async (newGames) => {
  if (newGames && newGames.length > 0) {
    for (const game of newGames) {
      // Load cover if not cached
      if (!gameCovers.value.has(game.id)) {
        coverLoadingStates.value.add(game.id)
        try {
          const coverUrl = await getGameCover(game)
          gameCovers.value.set(game.id, coverUrl)
        }
        catch (error) {
          console.error(`Failed to load cover for game ${game.id}:`, error)
          // On error, don't fall back to anything - just show the small logo
          gameCovers.value.set(game.id, '')
        }
        finally {
          coverLoadingStates.value.delete(game.id)
        }
      }
    }
  }
}, { immediate: true })

// Helper function to get cached game cover
function getCachedGameCover(gameId: number): string {
  return gameCovers.value.get(gameId) || ''
}

// Check if cover is loading
function isCoverLoading(gameId: number): boolean {
  return coverLoadingStates.value.has(gameId)
}
</script>

<template>
  <div class="game-library">
    <!-- Error message -->
    <template v-if="errorMessage">
      <ErrorAlert message="An error occurred while fetching games." :error="errorMessage" />
    </template>

    <!-- Loading skeletons -->
    <div v-if="loading" class="game-grid">
      <template v-for="i in 12" :key="i">
        <div class="game-card-skeleton">
          <Skeleton :height="280" :radius="8" />
          <Skeleton :height="24" :radius="4" class="mt-s" />
        </div>
      </template>
    </div>

    <template v-if="!loading && !errorMessage">
      <!-- Content -->
      <template v-if="games && gameservers && filteredGames.length > 0">
        <div class="game-grid">
          <GlowGroup>
            <TransitionGroup name="card-fade" tag="div" class="game-grid-container" appear>
              <GlowCard
                v-for="(game, index) in filteredGames" :key="game.id"
                no-glow
                halo
              >
                <button
                  class="game-card"
                  :class="{ 'content-loaded': !isCoverLoading(game.id) }"
                  :style="{ '--delay': `${index * 50}ms` }"
                  @click="openGameModal(game)"
                >
                  <div class="game-cover">
                    <div class="cover-image-container">
                      <!-- Base fallback: Hivecom logo -->
                      <div class="cover-fallback">
                        <img src="/icon.svg" alt="Hivecom logo" class="fallback-logo">
                      </div>
                      <!-- Loading skeleton -->
                      <Skeleton v-if="isCoverLoading(game.id)" :height="280" :radius="0" class="cover-skeleton" />
                      <!-- Actual cover image (custom or Steam) -->
                      <img
                        v-else-if="getCachedGameCover(game.id)"
                        :src="getCachedGameCover(game.id)"
                        :alt="game.name || 'Game cover'"
                        class="cover-image"
                        @load="handleCoverLoad"
                      >
                    </div>
                    <ClientOnly>
                      <template v-if="hasOngoingEventForGame(game.id)">
                        <span
                          :ref="(el) => setLiveIndicatorRef(game.id, el as HTMLElement | null)"
                          class="cover-live-indicator-anchor"
                        >
                          <Indicator
                            variant="alert"
                            class="cover-live-indicator"
                            outline
                            ripple
                            @click.stop="toggleLivePopout(game.id, $event)"
                          />
                        </span>
                        <Popout
                          :anchor="liveIndicatorRefs.get(game.id) ?? null"
                          :visible="livePopoutOpen.get(game.id) ?? false"
                          placement="bottom-end"
                          :offset="8"
                          @click-outside="closeLivePopout(game.id)"
                        >
                          <EventPopoverList :events="getOngoingEventsForGame(game.id)" />
                        </Popout>
                      </template>
                      <Tooltip v-else-if="(getPlayersForGame(game.id) ?? 0) > 0" placement="top">
                        <Indicator
                          variant="online"
                          class="cover-live-indicator"
                          outline
                          ripple
                        />
                        <template #tooltip>
                          <p>{{ getPlayersForGame(game.id) }} online</p>
                        </template>
                      </Tooltip>
                    </ClientOnly>
                  </div>
                  <div class="game-info">
                    <h3 class="game-title">
                      {{ game.name }}
                    </h3>
                    <BadgeGroup>
                      <Tooltip placement="top">
                        <Badge variant="neutral" size="s" circle>
                          {{ getServerCountForGame(game.id) }}
                        </Badge>
                        <template #tooltip>
                          <p>Servers</p>
                        </template>
                      </Tooltip>
                      <Tooltip v-if="(getPlayersForGame(game.id) ?? 0) > 0" placement="top">
                        <Badge variant="accent" size="s" circle>
                          {{ getPlayersForGame(game.id) }}
                        </Badge>
                        <template #tooltip>
                          <p>Players online</p>
                        </template>
                      </Tooltip>
                    </BadgeGroup>
                  </div>
                </button>
              </GlowCard>
            </TransitionGroup>
          </GlowGroup>
        </div>
      </template>

      <!-- No content -->
      <template v-else>
        <Alert variant="info">
          No games found.
        </Alert>
      </template>
    </template>

    <!-- Game Servers Modal -->
    <GameServerModal :open="showModal" :game="selectedGame" :gameservers="selectedGameServers" @close="closeModal" />
  </div>
</template>

<style lang="scss" scoped>
@use '@/assets/breakpoints.scss' as *;
.game-library {
  width: 100%;
}

.game-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: var(--space-m);
  width: 100%;

  @media (max-width: $breakpoint-xs) {
    grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  }
}

.game-grid-container {
  display: contents;
  /* Make the transition group container not affect grid layout */
}

:deep(.glow-card) {
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius-m);
}

/* Card fade-in animations */
.card-fade-enter-active {
  transition: all 0.6s ease;
  transition-delay: var(--delay, 0ms);
}

.card-fade-enter-from {
  opacity: 0;
  transform: translateY(20px) scale(0.95);
}

.card-fade-enter-to {
  opacity: 1;
  transform: translateY(0) scale(1);
}

.card-fade-leave-active {
  transition: all 0.3s ease;
}

.card-fade-leave-from {
  opacity: 1;
  transform: scale(1);
}

.card-fade-leave-to {
  opacity: 0;
  transform: scale(0.95);
}

.card-fade-move {
  transition: transform 0.4s ease;
}

/* Modal fade animations */
.modal-fade-enter-active,
.modal-fade-leave-active {
  transition: all 0.3s ease;
}

.modal-fade-enter-from {
  opacity: 0;
  transform: scale(0.95);
}

.modal-fade-leave-to {
  opacity: 0;
  transform: scale(0.95);
}

.game-card {
  width: 100%;
  padding: 0;
  display: flex;
  flex-direction: column;
  background: var(--color-bg-medium);
  border-radius: var(--border-radius-m);
  overflow: hidden;
  text-align: left;
  cursor: pointer;
  transition:
    box-shadow 0.2s ease,
    border-color 0.2s ease,
    opacity 0.3s ease;

  /* Initial state - slightly faded until content loads */
  opacity: 0.7;

  &.content-loaded {
    opacity: 1;
  }

  &:hover {
    box-shadow: var(--shadow-l);
    border-color: var(--color-border-hover);
  }
}

.game-card-skeleton {
  display: flex;
  flex-direction: column;
}

.game-cover {
  position: relative;
  aspect-ratio: 2 / 2.8;
  height: auto;
  border-radius: var(--border-radius-m) var(--border-radius-m) 0 0;

  .cover-image-container {
    width: 100%;
    height: 100%;
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--color-background-secondary);
    overflow: hidden;
    border-radius: var(--border-radius-m) var(--border-radius-m) 0 0;
  }

  .cover-fallback {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--color-background-secondary);
    z-index: 1;

    .fallback-logo {
      width: 64px;
      height: 64px;
      opacity: 0.3;
      filter: grayscale(1);
    }
  }

  .cover-skeleton {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100% !important;
    z-index: 2;
  }

  .cover-image {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    background: var(--color-background-secondary);
    opacity: 0;
    transition: opacity 0.4s ease;
    z-index: 3;

    &.cover-loaded {
      opacity: 1;
    }
  }

  .cover-live-indicator-anchor {
    position: absolute;
    top: var(--space-s);
    right: var(--space-s);
    z-index: 4;
    display: flex;
  }

  .cover-live-indicator {
    cursor: pointer;
  }
}

.game-info {
  border-top: 1px solid var(--color-border);
  padding: var(--space-m);
  width: 100%;
  display: flex;
  justify-content: space-between;
}

.game-title {
  margin: 0;
  font-size: var(--font-size-m);

  @media (max-width: $breakpoint-xs) {
    font-size: var(--font-size-xs);
  }
  font-weight: 600;
  line-height: 1.2;
  color: var(--color-text);
  flex: 1;
  min-width: 0;
  /* Allow text truncation */
}

.game-meta {
  display: flex;
  align-items: center;
  gap: var(--space-s);

  .shorthand {
    font-size: var(--font-size-s);
    color: var(--color-text-secondary);
    background: var(--color-background-tertiary);
    padding: var(--space-xs) var(--space-s);
    border-radius: var(--border-radius-m);
  }
}

.modal-content {
  &[style*='background-image'] {
    color: var(--color-text-inverse);

    h3 {
      color: var(--color-text-inverse);
    }

    .text-muted {
      color: rgba(255, 255, 255, 0.8);
    }
  }

  .modal-game-header {
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .modal-icon-container {
    position: relative;
    width: 48px;
    height: 48px;
  }

  .modal-icon-fallback {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--color-background-secondary);
    border-radius: var(--border-radius-m);
    border: 2px solid var(--color-background);

    .fallback-logo {
      width: 24px;
      height: 24px;
      opacity: 0.3;
      filter: grayscale(1);
    }
  }

  .servers-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }
}
</style>
