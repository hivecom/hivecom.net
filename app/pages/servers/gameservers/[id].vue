<script setup lang="ts">
import type { GameserverWithContainer } from '@/composables/useDataGameservers'
import type { Tables } from '@/types/database.overrides'
import { Button, Flex } from '@dolanske/vui'
import Discussion from '@/components/Discussions/Discussion.vue'
import GameServerHeader from '@/components/GameServers/GameServerHeader.vue'
import GameServerMarkdown from '@/components/GameServers/GameServerMarkdown.vue'
import DetailStates from '@/components/Shared/DetailStates.vue'
import { useDataGames } from '@/composables/useDataGames'
import { useDataGameservers } from '@/composables/useDataGameservers'

// Get route parameter
const route = useRoute()
const router = useRouter()

function goBack() {
  const prev = window.history.state?.back as string | undefined
  if (prev && prev.startsWith('/servers/gameservers'))
    router.back()
  else
    router.push('/servers/gameservers')
}
const gameserverId = Number.parseInt(route.params.id as string)

// Reactive data
const gameserver = ref<Tables<'network_gameservers'> | null>(null)
const game = ref<Tables<'games'> | null>(null)
const error = ref<string | null>(null)
const gameBackground = ref<string | null>(null)

const { gameservers, loading, error: gameserversError, getById: getGameserverById } = useDataGameservers()
const { getById: getGameById } = useDataGames()

// Derive container from the cached gameserver entry
const container = computed((): GameserverWithContainer['container'] => {
  const gs = gameserver.value
  if (!gs)
    return null
  const cached = getGameserverById(gs.id)
  return cached?.container ?? null
})

// Typed as Tables<'network_containers'> for GameServerHeader prop - the joined shape is compatible
const containerForHeader = computed((): Tables<'network_containers'> | null =>
  container.value as Tables<'network_containers'> | null,
)

// Computed server state
const state = computed(() => {
  if (!container.value)
    return 'unknown'

  if (container.value.server?.docker_control === false)
    return 'unknown'

  if (container.value.server?.docker_control && container.value.server?.accessible === false)
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

// Resolve gameserver and related game from cache once loaded
watch([gameservers, loading], () => {
  const found = getGameserverById(gameserverId)
  if (found != null) {
    gameserver.value = found
    game.value = found.game != null ? getGameById(found.game) : null
  }
  else if (!loading.value && gameservers.value.length > 0) {
    // Only report not-found after the fetch has completed and returned data
    error.value = 'Gameserver not found'
  }
}, { immediate: true })

// Propagate fetch error
watch(gameserversError, (err) => {
  if (err != null)
    error.value = err
})

// Load game background when game data is available
watch(game, async (newGame) => {
  if (newGame) {
    try {
      const { getGameBackgroundUrl } = useDataGameAssets()
      gameBackground.value = await getGameBackgroundUrl(newGame)
    }
    catch {
      gameBackground.value = null
    }
  }
}, { immediate: true })

// User-friendly error message; raw errors are demoted to technical detail.
const displayError = computed(() => {
  if (loading.value)
    return null
  if (error.value === 'Gameserver not found')
    return 'This game server was not found. It may have been removed or never existed.'
  if (error.value)
    return 'Unable to load game server details. Please try again later.'
  return null
})

// Raw error shown as copyable technical detail only for unexpected fetch errors.
const displayErrorDetail = computed(() => {
  if (error.value === 'Gameserver not found')
    return undefined
  return error.value ?? undefined
})

// Fetch minimal gameserver data at SSR/prerender time so meta tags are
// populated. useDataGameservers fetches client-only (onMounted), so during
// prerendering gameserver.value stays null and every card falls back to
// "Game Server Details" / "Game server details" - the doubled label crawlers
// were seeing.
const supabase = useSupabaseClient()
const { data: seoGameserver } = await useAsyncData(`gameserver-seo-${gameserverId}`, async () => {
  const { data } = await supabase
    .from('network_gameservers')
    .select('name, description')
    .eq('id', gameserverId)
    .maybeSingle()
  return data
})

const seoTitle = computed(() => {
  const source = gameserver.value ?? seoGameserver.value
  return source?.name ? `${source.name} | Game Servers` : 'Game Server Details'
})

const seoDescription = computed(() => {
  const source = gameserver.value ?? seoGameserver.value
  return source?.description || 'Game server details'
})

// SEO and page metadata
useSeoMeta({
  title: seoTitle,
  description: seoDescription,
  ogTitle: seoTitle,
  ogDescription: seoDescription,
})

defineOgImage('Gameserver', {
  gameserverId,
})

// Page title
useHead({
  title: computed(() => (gameserver.value ?? seoGameserver.value)?.name ?? 'Game Server Details'),
})
</script>

<template>
  <div class="page container-m">
    <DetailStates
      :loading="loading"
      :error="displayError"
      :back-to="goBack"
      back-label="Game Servers"
      :error-message="displayErrorDetail"
    />

    <!-- Gameserver Content -->
    <div v-if="gameserver && !loading && !error" class="page-content">
      <!-- Back button -->
      <Flex x-start>
        <NuxtLink to="/servers/gameservers">
          <Button
            variant="gray"
            plain
            size="s"
            aria-label="Go back to Game Servers"
          >
            <template #start>
              <Icon name="ph:arrow-left" />
            </template>
            Game Servers
          </Button>
        </NuxtLink>
      </Flex>

      <!-- Background Image -->
      <div
        v-if="gameBackground"
        class="game-background-section"
        :style="{ backgroundImage: `url(${gameBackground})` }"
      >
        <div class="background-overlay" />
      </div>

      <!-- Header -->
      <GameServerHeader
        :gameserver="gameserver"
        :game="game"
        :container="containerForHeader"
        :state="state"
        :state-config="stateConfig"
      />

      <!-- Server Details (Markdown) -->
      <GameServerMarkdown :gameserver="gameserver" />

      <Discussion
        :id="String(gameserver.id)"
        type="gameserver"
        class="gameserver-discussion"
      />
    </div>
  </div>
</template>

<style lang="scss" scoped>
/* .gameserver-discussion {
  max-width: 728px;
} */

.page-content {
  display: flex;
  flex-direction: column;
  gap: var(--space-l);
}

.game-background-section {
  position: relative;
  width: 100%;
  height: 320px;
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

  @media screen and (max-width: $breakpoint-m) {
    height: 256px;
  }
  @media screen and (max-width: $breakpoint-s) {
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
