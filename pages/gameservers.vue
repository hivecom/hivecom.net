<script setup lang="ts">
import type { QueryData } from '@supabase/supabase-js'
import type { Tables } from '~/types/database.types'

import { Alert, Button, Card, Divider, Flex, Input, Select, Skeleton } from '@dolanske/vui'

import GameserverRow from '~/components/Gameservers/GameserverRow.vue'
import ErrorAlert from '~/components/Shared/ErrorAlert.vue'

const supabase = useSupabaseClient()
const gameserversQuery = supabase.from('gameservers').select(`
  id,
  name,
  region,
  description,
  game,
  addresses,
  container (
    name,
    running,
    healthy
  )
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
const gameOptions = computed(() => {
  return games.value?.filter(game => game.name !== null).map(game => ({
    label: game.name ?? 'Unknown',
    value: game.id,
  })) ?? []
})

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

    return matchesSearch && matchesSelectedGame
  })
})

const filteredGames = computed(() => {
  if (!games.value || !gameservers.value)
    return []

  return games.value.filter((game) => {
    const gameServers = gameservers.value!.filter(gameserver => gameserver.game === game.id)
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

function clearFilters() {
  selectedGames.value = undefined
  search.value = ''
}

function getServersByGameId(gameId: number) {
  return gameservers.value?.filter(gameserver => gameserver.game === gameId) ?? []
}
</script>

<template>
  <div class="page">
    <section>
      <h1>Game servers</h1>
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
          <Flex gap="s" x-start class="mb-l">
            <Input v-model="search" placeholder="Search servers">
              <template #start>
                <Icon name="ph:magnifying-glass" />
              </template>
            </Input>
            <Select v-model="selectedGames" :options="gameOptions" placeholder="Select game" />
            <Button v-if="selectedGames || search" plain outline @click="clearFilters">
              Clear
            </Button>
          </Flex>

          <template v-for="game in filteredGames" :key="game.id">
            <Card v-if="filteredGameservers.length > 0">
              <h3 class="mb-s">
                <Flex gap="m" y-center>
                  {{ game.name }}
                  <div class="counter">
                    {{ filteredGameservers.length }}
                  </div>
                </Flex>
              </h3>
              <Flex column class="w-100">
                <GameserverRow
                  v-for="gameserver in getServersByGameId(game.id)" :key="gameserver.id"
                  :gameserver="(gameserver as any)"
                  :container="(gameserver.container as any)"
                  :game
                />
              </Flex>
            </Card>
          </template>
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
