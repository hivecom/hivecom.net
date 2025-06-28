<script setup lang="ts">
import type { QueryData } from '@supabase/supabase-js'
import type { Tables } from '@/types/database.types'
import { Alert, Badge, Button, Flex, Modal, Skeleton } from '@dolanske/vui'
import GameIcon from '@/components/GameServers/GameIcon.vue'
import GameServerRow from '@/components/GameServers/GameServerRow.vue'
import ErrorAlert from '@/components/Shared/ErrorAlert.vue'
import { getGameAssetUrl } from '@/utils/storage'

const props = defineProps<Props>()
// Define the type inline to match what the parent component provides
const supabase = useSupabaseClient()
const _gameserversQuery = supabase.from('gameservers').select(`
  *,
  container (
    name,
    running,
    healthy
  ),
  administrator
`)
type GameserversType = QueryData<typeof _gameserversQuery>

interface Props {
  games?: Tables<'games'>[]
  gameservers?: GameserversType
  loading: boolean
  errorMessage: string
  filteredGames: Tables<'games'>[]
}

const showModal = ref(false)
const selectedGame = ref<Tables<'games'> | null>(null)
const selectedGameServers = ref<GameserversType>([])
const gameCovers = ref<Map<number, string>>(new Map())
const coverLoadingStates = ref<Set<number>>(new Set())

async function openGameModal(game: Tables<'games'>) {
  selectedGame.value = game
  selectedGameServers.value = props.gameservers?.filter((gs: GameserversType[0]) => gs.game === game.id) || []
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

// Get game cover image - only return actual covers, not fallbacks
async function getGameCover(game: Tables<'games'>) {
  if (game.shorthand) {
    const supabase = useSupabaseClient()
    const coverUrl = await getGameAssetUrl(supabase, game.shorthand, 'cover')
    if (coverUrl)
      return coverUrl
  }

  // No cover available - return empty string to show only the small logo
  return ''
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
          <TransitionGroup
            name="card-fade"
            tag="div"
            class="game-grid-container"
            appear
          >
            <div
              v-for="(game, index) in filteredGames"
              :key="game.id"
              class="game-card"
              :class="{
                'content-loaded': !isCoverLoading(game.id),
              }"
              :style="{ '--delay': `${index * 50}ms` }"
              @click="openGameModal(game)"
            >
              <div class="game-cover">
                <div class="cover-image-container">
                  <!-- Base fallback: Hivecom logo -->
                  <div class="cover-fallback">
                    <img
                      src="/icon.svg"
                      alt="Hivecom logo"
                      class="fallback-logo"
                    >
                  </div>

                  <!-- Loading skeleton -->
                  <Skeleton
                    v-if="isCoverLoading(game.id)"
                    :height="280"
                    :radius="0"
                    class="cover-skeleton"
                  />

                  <!-- Actual cover image (custom or Steam) -->
                  <img
                    v-else-if="getCachedGameCover(game.id)"
                    :src="getCachedGameCover(game.id)"
                    :alt="game.name || 'Game cover'"
                    class="cover-image"
                    @load="handleCoverLoad"
                  >
                </div>
              </div>
              <div class="game-info">
                <div class="game-header">
                  <h3 class="game-title">
                    {{ game.name }}
                  </h3>
                  <Badge>
                    {{ getServerCountForGame(game.id) }}
                  </Badge>
                </div>
              </div>
            </div>
          </TransitionGroup>
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
    <Modal
      v-if="showModal"
      :open="showModal"
      @close="closeModal"
    >
      <template v-if="selectedGame" #header>
        <Flex gap="s" y-center expand>
          <GameIcon :game="selectedGame" size="medium" />
          <Flex y-center gap="s" expand x-between>
            <h3>{{ selectedGame.name }}</h3>
          </Flex>
        </Flex>
      </template>
      <div class="modal-content">
        <div v-if="selectedGameServers.length > 0" class="servers-list">
          <GameServerRow
            v-for="gameserver in selectedGameServers"
            :key="gameserver.id"
            :gameserver="(gameserver as Tables<'gameservers'>)"
            :container="(gameserver.container as Tables<'containers'> | null)"
            :game="(selectedGame as Tables<'games'>)"
            compact
          />
        </div>

        <Alert v-else variant="info">
          No servers available for this game.
        </Alert>
      </div>

      <template #footer>
        <Button @click="closeModal">
          Close
        </Button>
      </template>
    </Modal>
  </div>
</template>

<style lang="scss" scoped>
.game-library {
  width: 100%;
}

.game-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: var(--space-m);
  width: 100%;
}

.game-grid-container {
  display: contents; /* Make the transition group container not affect grid layout */
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
  background: var(--color-background);
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius-m);
  overflow: hidden;
  cursor: pointer;
  transition:
    transform 0.2s ease,
    box-shadow 0.2s ease,
    border-color 0.2s ease,
    opacity 0.3s ease;

  /* Initial state - slightly faded until content loads */
  opacity: 0.7;

  &.content-loaded {
    opacity: 1;
  }

  &:hover {
    transform: translateY(-4px);
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
  aspect-ratio: 2/3;
  overflow: hidden;
  border-radius: var(--border-radius-m) var(--border-radius-m) 0 0;

  .cover-image-container {
    width: 100%;
    height: 100%;
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--color-background-secondary);
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
    height: 100%;
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
}

.game-info {
  border-top: 1px solid var(--color-border);
  padding: var(--space-m);
}

.game-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-s);
}

.game-title {
  margin: 0;
  font-size: var(--font-size-m);
  font-weight: 600;
  line-height: 1.2;
  color: var(--color-text);
  flex: 1;
  min-width: 0; /* Allow text truncation */
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
