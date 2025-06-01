<script setup lang="ts">
import type { QueryData } from '@supabase/supabase-js'
import type { Tables } from '~/types/database.types'

import { Alert, Button, Card, Divider, Flex, Input, Select, Skeleton } from '@dolanske/vui'

import GameServerRow from '~/components/Gameservers/GameServerRow.vue'
import ErrorAlert from '~/components/Shared/ErrorAlert.vue'
import SteamLink from '~/components/Shared/SteamLink.vue'

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
type gameserversType = QueryData<typeof gameserversQuery>

// Fetch data
const loading = ref(true)
const errorMessage = ref('')
const games = ref<Tables<'games'>[]>()
const gameservers = ref<gameserversType>()

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
    label: game.name ?? 'Uassigned',
    value: game.id,
  })) ?? []
})

const regionOptions = [
  { label: 'Europe', value: 'eu' },
  { label: 'North America', value: 'na' },
  { label: 'All Regions', value: 'all' },
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

function getServersByGameId(gameId: number) {
  return gameservers.value?.filter(gameserver => gameserver.game === gameId) ?? []
}
</script>

<template>
  <div class="page">
    <section>
      <h1>Game Servers</h1>
      <p>
        Hop on. Get in.
      </p>
    </section>
    <Divider />
    <div class="game-servers">
      <!-- Error message -->
      <template v-if="errorMessage">
        <ErrorAlert message="An error occurred while fetching game servers." :error="errorMessage" />
      </template>

      <!-- Loading skeletons -->
      <Flex v-if="loading" column>
        <Flex>
          <Skeleton :width="240" :height="32" :radius="8" />
          <Skeleton :width="120" :height="32" :radius="8" />
        </Flex>
        <template v-for="i in 6" :key="i">
          <Skeleton :height="48" :radius="8" />
        </template>
      </Flex>

      <template v-if="!loading && !errorMessage">
        <!-- Content -->
        <template v-if="games && gameservers && games.length !== 0 && gameservers.length !== 0">
          <!-- Inputs -->
          <Flex gap="s" x-start class="mb-m">
            <Input v-model="search" placeholder="Search servers">
              <template #start>
                <Icon name="ph:magnifying-glass" />
              </template>
            </Input>
            <Select v-model="selectedGames" :options="gameOptions" placeholder="Select game" />
            <Select v-model="selectedRegions" :options="regionOptions" placeholder="Select region" />
            <Button v-if="selectedGames || selectedRegions || search" plain outline @click="clearFilters">
              Clear
            </Button>
          </Flex>

          <Flex gap="m" column>
            <template v-for="game in filteredGames" :key="game.id">
              <Card v-if="filteredGameservers.length > 0">
                <h3 class="mb-s">
                  <Flex gap="m" y-center x-between>
                    <Flex gap="m" y-center>
                      {{ game.name }}
                      <div class="counter">
                        {{ getServersByGameId(game.id).length }}
                      </div>
                    </Flex>
                    <SteamLink v-if="game.steam_id" :steam-id="game.steam_id" show-icon hide-id />
                  </Flex>
                </h3>
                <Flex column class="w-100">
                  <GameServerRow
                    v-for="gameserver in getServersByGameId(game.id)" :key="gameserver.id"
                    :gameserver="(gameserver as Tables<'gameservers'>)"
                    :container="(gameserver.container as Tables<'containers'> | null)"
                    :game="(game as Tables<'games'>)"
                  />
                </Flex>
              </Card>
            </template>

            <!-- Gameservers without a game -->
            <Card v-if="gameserversWithoutGame.length > 0">
              <h3 class="mb-s">
                <Flex gap="m" y-center>
                  Unassigned Servers
                  <div class="counter">
                    {{ gameserversWithoutGame.length }}
                  </div>
                </Flex>
              </h3>
              <Flex column class="w-100">
                <GameServerRow
                  v-for="gameserver in gameserversWithoutGame" :key="gameserver.id"
                  :gameserver="(gameserver as any)"
                  :container="(gameserver.container as any)"
                  :game="undefined"
                />
              </Flex>
            </Card>
          </Flex>
        </template>
        <!-- No content -->
        <template v-else>
          <Alert variant="info">
            No game servers found.
          </Alert>
        </template>
      </template>
    </div>
  </div>
</template>
