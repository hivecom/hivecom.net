<script setup lang="ts">
import type { GameserverWithContainer } from '@/composables/useDataGameservers'
import type { Tables } from '@/types/database.overrides'
import type { Database } from '@/types/database.types'
import { Button, Flex, Tab, Tabs } from '@dolanske/vui'
import { defineAsyncComponent } from 'vue'
import GameLibrary from '@/components/GameServers/GameServerLibrary.vue'
import GameListing from '@/components/GameServers/GameServerListing.vue'
import ChartActivityHistogramModal from '@/components/Shared/Charts/ChartActivityHistogramModal.vue'
import OnlineBadge from '@/components/Shared/OnlineBadge.vue'
import SupportModal from '@/components/Shared/SupportModal.vue'
import { useDataGames } from '@/composables/useDataGames'
import { useDataGameservers } from '@/composables/useDataGameservers'
import { useDataMetrics } from '@/composables/useDataMetrics'

const ChartGameserversPlayers = defineAsyncComponent(() => import('@/components/Shared/Charts/ChartGameserversPlayers.vue'))

const supabase = useSupabaseClient<Database>()

// Tab management
const route = useRoute()
const router = useRouter()

const queryTab = computed(() => {
  const tab = route.query.tab ?? (route.query.list ? 'list' : undefined)
  return Array.isArray(tab) ? tab[0] : tab
})

const activeTab = ref(queryTab.value === 'list' ? 'list' : 'library')

watch(activeTab, (tab) => {
  if (tab !== 'library' && tab !== 'list')
    return

  const currentQueryTab = queryTab.value ?? 'library'
  if (currentQueryTab === tab)
    return

  const { tab: _ignoredTab, list: _ignoredList, ...restQuery } = route.query
  const nextQuery = tab === 'library' ? restQuery : { ...restQuery, tab }

  router.replace({ query: nextQuery })
})

onBeforeRouteLeave(() => {
  sessionStorage.setItem('gameservers_active_tab', activeTab.value)
})

onMounted(() => {
  if (queryTab.value === 'library' || queryTab.value === 'list')
    return

  activeTab.value = sessionStorage.getItem('gameservers_active_tab') ?? 'library'
})

// Fetch data
const supportModalOpen = ref(false)
const activityModalOpen = ref(false)

const { games } = useDataGames()
const { gameservers, error: gameserversError } = useDataGameservers()
const { metrics, fetchMetrics } = useDataMetrics()

const [{ data: ssrGames, status: gamesStatus }, { data: ssrGameservers, status: gameserversStatus }] = await Promise.all([
  useAsyncData('games:all', async () => {
    const { data } = await supabase.from('games').select('*').order('name', { ascending: true })
    return (data ?? []) as Tables<'games'>[]
  }),
  useAsyncData('gameservers:all', async () => {
    const { data } = await supabase
      .from('network_gameservers')
      .select(`*, container (name, running, healthy, reported_at, server (docker_control, accessible)), administrator`)
      .order('name', { ascending: true })
    return (data ?? []) as unknown as GameserverWithContainer[]
  }),
])

if (ssrGames.value && ssrGames.value.length > 0 && games.value.length === 0)
  games.value = ssrGames.value
if (ssrGameservers.value && ssrGameservers.value.length > 0 && gameservers.value.length === 0)
  gameservers.value = ssrGameservers.value

const isLoading = computed(() =>
  gamesStatus.value === 'pending' || gameserversStatus.value === 'pending',
)

onMounted(() => {
  if (metrics.value === null)
    fetchMetrics()
})

const totalOnline = computed<number | null>(() => metrics.value?.gameservers.players ?? null)
const errorMessage = computed(() => gameserversError.value ?? '')

useSeoMeta({
  title: 'Game Servers',
  description: 'Browse the Hivecom game server library and live server listings.',
  ogTitle: 'Game Servers',
  ogDescription: 'Browse the Hivecom game server library and live server listings.',
})

defineOgImage('Default', {
  title: 'Game Servers',
  description: 'Browse the Hivecom game server library and live server listings.',
})

const search = ref('')
const selectedGameIds = ref<number[]>([])
const selectedRegions = ref<{ label: string, value: string }[]>()

onMounted(() => {
  const raw = route.query.game
  const id = raw ? Number(Array.isArray(raw) ? raw[0] : raw) : null
  if (id && !Number.isNaN(id)) {
    const applyFilter = () => {
      if (games.value.some(g => g.id === id))
        selectedGameIds.value = [id]
    }
    if (games.value.length > 0) {
      applyFilter()
    }
    else {
      const stop = watch(games, () => {
        applyFilter()
        stop()
      })
    }
  }
})

const gamesWithServers = computed(() =>
  games.value.filter(g => gameservers.value.some(gs => gs.game === g.id)),
)

const regionOptions = [
  { label: 'Europe', value: 'eu' },
  { label: 'North America', value: 'na' },
  { label: 'Multi-Region', value: 'all' },
  { label: 'No Region', value: 'none' },
]

const filteredGameservers = computed(() => {
  if (!gameservers.value.length)
    return []

  return gameservers.value.filter((gameserver) => {
    // Find the game object for this gameserver
    const gameObj = games.value.find(g => g.id === gameserver.game)
    const searchLower = search.value?.toLowerCase() || ''
    const matchesSearch = search.value
      ? (
          gameserver.name?.toLowerCase().includes(searchLower)
          || gameserver.region?.toLowerCase().includes(searchLower)
          || gameObj?.name?.toLowerCase().includes(searchLower)
          || gameObj?.shorthand?.toLowerCase().includes(searchLower)
        )
      : true

    const matchesSelectedGame = selectedGameIds.value.length > 0
      ? selectedGameIds.value.includes(gameserver.game ?? -1)
      : true

    const matchesSelectedRegion = selectedRegions.value
      ? selectedRegions.value.some((selectedRegion) => {
          if (selectedRegion.value === 'none') {
            return !gameserver.region
          }
          return selectedRegion.value === gameserver.region
        })
      : true

    return matchesSearch && matchesSelectedGame && matchesSelectedRegion
  })
})

const filteredGames = computed(() => {
  if (!gameservers.value.length)
    return []

  return games.value.filter((game) => {
    const gameServers = gameservers.value.filter((gameserver) => {
      const belongsToGame = gameserver.game === game.id
      const matchesRegionFilter = selectedRegions.value
        ? selectedRegions.value.some((selectedRegion) => {
            if (selectedRegion.value === 'none') {
              return !gameserver.region
            }
            return selectedRegion.value === gameserver.region
          })
        : true

      return belongsToGame && matchesRegionFilter
    })
    const hasGameServers = gameServers.length > 0

    // Check if search matches game name/shorthand OR any server names belonging to this game
    const matchesSearch = search.value
      ? (
          game.name?.toLowerCase().includes(search.value.toLowerCase())
          || game.shorthand?.toLowerCase().includes(search.value.toLowerCase())
          || gameServers.some(server =>
            server.name?.toLowerCase().includes(search.value.toLowerCase()),
          )
        )
      : true

    const matchesSelectedGame = selectedGameIds.value.length > 0
      ? selectedGameIds.value.includes(game.id)
      : true

    return hasGameServers && matchesSearch && matchesSelectedGame
  }).sort((a, b) => {
    // Sort games alphabetically by name
    const nameA = (a.name || '').toLowerCase()
    const nameB = (b.name || '').toLowerCase()
    return nameA.localeCompare(nameB)
  })
})

const gameserversWithoutGame = computed(() => {
  if (!gameservers.value.length || !games.value.length)
    return []

  return gameservers.value.filter((gameserver) => {
    // Check if gameserver doesn't have a game or the game doesn't exist
    const hasNoGame = !gameserver.game || !games.value.some(game => game.id === gameserver.game)

    if (!hasNoGame)
      return false

    const matchesSearch = search.value
      ? (
          gameserver.name?.toLowerCase().includes(search.value.toLowerCase())
          || gameserver.region?.toLowerCase().includes(search.value.toLowerCase())
        )
      : true

    const matchesSelectedRegion = selectedRegions.value
      ? selectedRegions.value.some((selectedRegion) => {
          if (selectedRegion.value === 'none') {
            return !gameserver.region
          }
          return selectedRegion.value === gameserver.region
        })
      : true

    // If games are selected in filter, don't show gameservers without games
    const matchesSelectedGame = selectedGameIds.value.length === 0

    return matchesSearch && matchesSelectedGame && matchesSelectedRegion
  })
})

function clearFilters() {
  selectedGameIds.value = []
  selectedRegions.value = undefined
  search.value = ''
}
</script>

<template>
  <div class="page container-l">
    <section class="page-title">
      <div>
        <Flex y-center x-between gap="s" expand>
          <h1>Game Servers</h1>
          <ClientOnly>
            <OnlineBadge :count="totalOnline" label="Players Online" singular="Player Online" clickable @click="activityModalOpen = true" />
            <template #fallback>
              <OnlineBadge :count="null" label="Players Online" singular="Player Online" />
            </template>
          </ClientOnly>
        </Flex>
        <p>
          Hop on. Get in.
        </p>
      </div>
    </section>

    <!-- Tabs Navigation -->
    <Tabs v-model="activeTab" class="my-m">
      <Tab value="library">
        Library
      </Tab>
      <Tab value="list">
        List
      </Tab>
      <template #end>
        <Button
          class="page-title__cta"
          size="s"
          @click="supportModalOpen = true"
        >
          <template #start>
            <Icon name="ph:lifebuoy" />
          </template>
          Request Game Server
        </Button>
      </template>
    </Tabs>

    <div class="game-servers">
      <!-- List View -->
      <GameListing
        v-if="activeTab === 'list'"
        :games="games"
        :gameservers="gameservers"
        :loading="isLoading"
        :error-message="errorMessage"
        :filtered-games="filteredGames"
        :filtered-gameservers="filteredGameservers"
        :gameservers-without-game="gameserversWithoutGame"
        :search="search"
        :selected-game-ids="selectedGameIds"
        :games-with-servers="gamesWithServers"
        :selected-regions="selectedRegions"
        :region-options="regionOptions"
        @update:search="search = $event"
        @update:selected-game-ids="selectedGameIds = $event"
        @update:selected-regions="selectedRegions = $event"
        @clear-filters="clearFilters"
      />

      <!-- Library View -->
      <GameLibrary
        v-else-if="activeTab === 'library'"
        :games="games"
        :gameservers="gameservers"
        :loading="isLoading"
        :error-message="errorMessage"
        :filtered-games="filteredGames"
      />
    </div>

    <SupportModal
      v-model:open="supportModalOpen"
      title="Request Game Server"
      message="Got an idea for a game server? Let us know!"
    />

    <ChartActivityHistogramModal
      v-model:open="activityModalOpen"
      title="Game Server Activity"
      :count="totalOnline"
      count-label="players"
      count-singular="player"
      :series="['gameserversPlayers']"
      :initial-period="totalOnline ? '24h' : '14d'"
    >
      <template #default="{ period, window, utc, color }">
        <ChartGameserversPlayers :period :window :utc :color hide-title />
      </template>
    </ChartActivityHistogramModal>
  </div>
</template>

<style scoped lang="scss">
.page-title {
  margin-bottom: var(--space-m);
}
</style>
