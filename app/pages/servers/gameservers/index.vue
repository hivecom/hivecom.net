<script setup lang="ts">
import type { QueryData } from '@supabase/supabase-js'
import type { Tables } from '@/types/database.types'

import { Button, Tab, Tabs } from '@dolanske/vui'
import GameLibrary from '@/components/GameServers/GameServerLibrary.vue'
import GameListing from '@/components/GameServers/GameServerListing.vue'
import SupportModal from '@/components/Shared/SupportModal.vue'

const supabase = useSupabaseClient()
const gameserversQuery = supabase.from('gameservers').select(`
  *,
  container (
    name,
    running,
    healthy,
    reported_at,
    server (
      docker_control,
      accessible
    )
  ),
  administrator
`)
type GameserversType = QueryData<typeof gameserversQuery>

// Tab management
const activeTab = ref('library')
const route = useRoute()
const router = useRouter()

const queryTab = computed(() => {
  const tab = route.query.tab ?? (route.query.list ? 'list' : undefined)
  return Array.isArray(tab) ? tab[0] : tab
})

watch(queryTab, (tab) => {
  if (tab === 'library' || tab === 'list')
    activeTab.value = tab
}, { immediate: true })

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
const loading = ref(true)
const errorMessage = ref('')
const games = ref<Tables<'games'>[]>()
const gameservers = ref<GameserversType>()
const supportModalOpen = ref(false)

useSeoMeta({
  title: 'Game Servers',
  description: 'Browse the Hivecom game server library and live server listings.',
  ogTitle: 'Game Servers',
  ogDescription: 'Browse the Hivecom game server library and live server listings.',
})

onBeforeMount(async () => {
  // Make our requests at the same time.
  const requests = [
    supabase.from('games').select('*'),
    gameserversQuery,
  ] as const
  const [responseGames, responseGameservers] = await Promise.all(requests)
  loading.value = false

  if (responseGames.error || responseGameservers.error) {
    errorMessage.value = (responseGames.error?.message || responseGameservers.error?.message) || 'Unknown error'
    return
  }

  games.value = responseGames.data
  gameservers.value = responseGameservers.data
})

const search = ref('')
const selectedGames = ref<{ label: string, value: number }[]>()
const selectedRegions = ref<{ label: string, value: string }[]>()
const gameOptions = computed(() => {
  return (
    games.value?.filter(game => game.name !== null)
      .map(game => ({
        label: game.name ?? 'Unassigned',
        value: game.id,
      }))
      .sort((a, b) => a.label.localeCompare(b.label))
      ?? []
  )
})

const regionOptions = [
  { label: 'Europe', value: 'eu' },
  { label: 'North America', value: 'na' },
  { label: 'Multi-Region', value: 'all' },
  { label: 'No Region', value: 'none' },
]

const filteredGameservers = computed(() => {
  if (!gameservers.value)
    return []

  return gameservers.value.filter((gameserver) => {
    // Find the game object for this gameserver
    const gameObj = games.value?.find(g => g.id === gameserver.game)
    const searchLower = search.value?.toLowerCase() || ''
    const matchesSearch = search.value
      ? (
          gameserver.name?.toLowerCase().includes(searchLower)
          || gameserver.region?.toLowerCase().includes(searchLower)
          || gameObj?.name?.toLowerCase().includes(searchLower)
          || gameObj?.shorthand?.toLowerCase().includes(searchLower)
        )
      : true

    const matchesSelectedGame = selectedGames.value
      ? selectedGames.value.some(selectedGame => selectedGame.value === gameserver.game)
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
  if (!games.value || !gameservers.value)
    return []

  return games.value.filter((game) => {
    const gameServers = gameservers.value!.filter((gameserver) => {
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

    const matchesSelectedGame = selectedGames.value
      ? selectedGames.value.some(selectedGame => selectedGame.value === game.id)
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
  if (!gameservers.value)
    return []

  return gameservers.value.filter((gameserver) => {
    // Check if gameserver doesn't have a game or the game doesn't exist
    const hasNoGame = !gameserver.game || !games.value?.some(game => game.id === gameserver.game)

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
    const matchesSelectedGame = !selectedGames.value

    return matchesSearch && matchesSelectedGame && matchesSelectedRegion
  })
})

function clearFilters() {
  selectedGames.value = undefined
  selectedRegions.value = undefined
  search.value = ''
}
</script>

<template>
  <div class="page">
    <section class="page-title">
      <div>
        <h1>Game Servers</h1>
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
        :loading="loading"
        :error-message="errorMessage"
        :filtered-games="filteredGames"
        :filtered-gameservers="filteredGameservers"
        :gameservers-without-game="gameserversWithoutGame"
        :search="search"
        :selected-games="selectedGames"
        :selected-regions="selectedRegions"
        :game-options="gameOptions"
        :region-options="regionOptions"
        @update:search="search = $event"
        @update:selected-games="selectedGames = $event"
        @update:selected-regions="selectedRegions = $event"
        @clear-filters="clearFilters"
      />

      <!-- Library View -->
      <GameLibrary
        v-else-if="activeTab === 'library'"
        :games="games"
        :gameservers="gameservers"
        :loading="loading"
        :error-message="errorMessage"
        :filtered-games="filteredGames"
      />
    </div>

    <SupportModal
      v-model:open="supportModalOpen"
      title="Request Game Server"
      message="Got an idea for a game server? Let us know!"
    />
  </div>
</template>

<style scoped lang="scss">
.page-title {
  margin-bottom: var(--space-m);

  &__header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--space-m);
    flex-wrap: wrap;
  }

  &__cta {
    flex-shrink: 0;
  }
}
</style>
