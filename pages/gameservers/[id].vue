<script setup lang="ts">
import type { Tables } from '@/types/database.types'
import GameServerHeader from '@/components/GameServers/GameServerHeader.vue'
import GameServerMarkdown from '@/components/GameServers/GameServerMarkdown.vue'
import DetailStates from '@/components/Shared/DetailStates.vue'
import MetadataCard from '@/components/Shared/MetadataCard.vue'

// Get route parameter
const route = useRoute()
const router = useRouter()
const gameserverId = Number.parseInt(route.params.id as string)

// Supabase client
const supabase = useSupabaseClient()

// Reactive data
const gameserver = ref<Tables<'gameservers'> | null>(null)
const game = ref<Tables<'games'> | null>(null)
const container = ref<Tables<'containers'> | null>(null)
const loading = ref(true)
const error = ref<string | null>(null)
const gameBackground = ref<string | null>(null)

// Computed server state
const state = computed(() => {
  if (!container.value)
    return 'unknown'

  if (container.value.running && container.value.healthy === null) {
    return 'running'
  }

  if (container.value.running && container.value.healthy) {
    return 'healthy'
  }
  else if (container.value.running && !container.value.healthy) {
    return 'unhealthy'
  }
  else {
    return 'offline'
  }
})

// State display properties
const stateConfig = computed(() => {
  const configs = {
    healthy: {
      color: 'success' as const,
      icon: 'ph:check-circle-fill',
      label: 'Healthy',
      description: 'Server is running and healthy',
    },
    running: {
      color: 'info' as const,
      icon: 'ph:play-circle-fill',
      label: 'Running',
      description: 'Server is running but health status is unknown',
    },
    unhealthy: {
      color: 'warning' as const,
      icon: 'ph:warning-circle-fill',
      label: 'Unhealthy',
      description: 'Server is running but experiencing issues',
    },
    offline: {
      color: 'danger' as const,
      icon: 'ph:x-circle-fill',
      label: 'Offline',
      description: 'Server is not running',
    },
    unknown: {
      color: 'neutral' as const,
      icon: 'ph:question-fill',
      label: 'Unknown',
      description: 'Server status is unknown',
    },
  }
  return configs[state.value] || configs.unknown
})

// Fetch gameserver data
async function fetchGameserver() {
  try {
    loading.value = true
    error.value = null

    const { data: gameserverData, error: gameserverError } = await supabase
      .from('gameservers')
      .select('*')
      .eq('id', gameserverId)
      .single()

    if (gameserverError) {
      if (gameserverError.code === 'PGRST116') {
        error.value = 'Gameserver not found'
      }
      else {
        error.value = gameserverError.message
      }
      return
    }

    gameserver.value = gameserverData

    // Fetch related game data
    if (gameserverData.game) {
      const { data: gameData } = await supabase
        .from('games')
        .select('*')
        .eq('id', gameserverData.game)
        .single()
      game.value = gameData
    }

    // Fetch related container data
    if (gameserverData.container) {
      const { data: containerData } = await supabase
        .from('containers')
        .select('*')
        .eq('name', gameserverData.container)
        .single()
      container.value = containerData
    }
  }
  catch (err: unknown) {
    error.value = (err as Error).message || 'An error occurred while loading the gameserver'
  }
  finally {
    loading.value = false
  }
}

// Get game background image using the cached composable
async function getGameBackground(game: Tables<'games'>) {
  const { getGameBackgroundUrl } = useGameAssets()
  return await getGameBackgroundUrl(game)
}

// Load game background when game data is available
async function loadGameBackground() {
  if (game.value) {
    try {
      gameBackground.value = await getGameBackground(game.value)
    }
    catch (error) {
      console.error('Failed to load game background:', error)
      gameBackground.value = null
    }
  }
}

// Fetch data on mount
onMounted(() => {
  fetchGameserver()
})

// Watch for game changes to load background
watch(game, (newGame) => {
  if (newGame) {
    loadGameBackground()
  }
}, { immediate: true })

// SEO and page metadata
useSeoMeta({
  title: computed(() => gameserver.value ? `${gameserver.value.name} | Game Servers` : 'Game Server Details'),
  description: computed(() => gameserver.value?.description || 'Game server details'),
  ogTitle: computed(() => gameserver.value ? `${gameserver.value.name} | Game Servers` : 'Game Server Details'),
  ogDescription: computed(() => gameserver.value?.description || 'Game server details'),
})

// Page title
useHead({
  title: computed(() => gameserver.value ? gameserver.value.name : 'Game Server Details'),
})
</script>

<template>
  <div class="page">
    <DetailStates
      :loading="loading"
      :error="error"
      :back-to="() => router.back()"
      back-label="Game Servers"
    >
      <template #error-message>
        The game server you're looking for might have been removed or doesn't exist.
      </template>
    </DetailStates>

    <!-- Gameserver Content -->
    <div v-if="gameserver && !loading && !error" class="page-content">
      <!-- Header -->
      <GameServerHeader
        :gameserver="gameserver"
        :game="game"
        :container="container"
        :state="state"
        :state-config="stateConfig"
      />

      <!-- Background Image -->
      <div
        v-if="gameBackground"
        class="game-background-section"
        :style="{ backgroundImage: `url(${gameBackground})` }"
      >
        <div class="background-overlay" />
      </div>

      <!-- Server Details (Markdown) -->
      <GameServerMarkdown :gameserver="gameserver" />

      <!-- Server Metadata -->
      <MetadataCard
        :created-at="gameserver.created_at"
        :created-by="gameserver.created_by"
        :modified-at="gameserver.modified_at"
        :modified-by="gameserver.modified_by"
      />
    </div>
  </div>
</template>

<style lang="scss" scoped>
.page-content {
  display: flex;
  flex-direction: column;
  gap: var(--space-l);
}

.game-background-section {
  position: relative;
  width: 100%;
  height: 480px;
  border-radius: var(--border-radius-m);
  overflow: hidden;
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;

  .background-overlay {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: linear-gradient(135deg, rgba(0, 0, 0, 0.4) 0%, rgba(0, 0, 0, 0.2) 50%, rgba(0, 0, 0, 0.1) 100%);
  }

  @media (max-width: 768px) {
    height: 150px;
  }
}

.game-background {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: -1;
  background-size: cover;
  background-position: center;
  opacity: 0.1;
}
</style>
