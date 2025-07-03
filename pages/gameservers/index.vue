<script setup lang="ts">
import type { QueryData } from '@supabase/supabase-js'
import type { Tables } from '@/types/database.types'

import { searchString, Tab, Tabs } from '@dolanske/vui'
import GameLibrary from '~/components/GameServers/GameServerLibrary.vue'
import GameListing from '~/components/GameServers/GameServerListing.vue'

const supabase = useSupabaseClient()
const gameserversQuery = supabase.from('gameservers').select(`
  *,
  container (
    name,
    running,
    healthy
  ),
  administrator
`)
type GameserversType = QueryData<typeof gameserversQuery>

// Tab management
const activeTab = ref('library')

watch(activeTab, (newVal) => {
  window.location.hash = newVal === 'list' ? '#list' : ''
})

onMounted(() => {
  if (window.location.hash.includes('#list')) {
    activeTab.value = 'list'
  }
})

// Fetch data
const loading = ref(true)
const errorMessage = ref('')
const games = ref<Tables<'games'>[]>()
const gameservers = ref<GameserversType>()

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
  return games.value?.filter(game => game.name !== null).map(game => ({
    label: game.name ?? 'Unassigned',
    value: game.id,
  })) ?? []
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
    const matchesSearch = search.value
      ? (
          gameserver.name?.toLowerCase().includes(search.value.toLowerCase())
          || gameserver.region?.toLowerCase().includes(search.value.toLowerCase())
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

    const matchesSearch = search.value
      ? (
          game.name?.toLowerCase().includes(search.value.toLowerCase())
          || game.shorthand?.toLowerCase().includes(search.value.toLowerCase())
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
      <h1>Game Servers</h1>
      <p>
        Hop on. Get in.
      </p>
    </section>

    <!-- Tabs Navigation -->
    <Tabs v-model="activeTab" class="my-m">
      <Tab value="library">
        Library
      </Tab>
      <Tab value="list">
        List
      </Tab>
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
  </div>
</template>
