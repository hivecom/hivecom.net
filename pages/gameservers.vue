<script setup lang="ts">
import type { QueryData } from '@supabase/supabase-js'
import type { Tables } from '~/types/database.types'
import { Button, Card, Divider, Input, Select } from '@dolanske/vui'
import GameserverRow from '~/components/Gameservers/GameserverRow.vue'

const supabase = useSupabaseClient()
const gameserversWithContainersQuery = supabase.from('gameservers').select(`
  id,
  description,
  game,
  container (
    name,
    running,
    healthy
  )
`)
type gameserversWithContainersType = QueryData<typeof gameserversWithContainersQuery>

// Fetch data
const loading = ref(true)
const errorMessage = ref('')
const games = ref<Tables<'games'>[]>()
const gameserversWithContainers = ref<gameserversWithContainersType>()

onMounted(async () => {
  // Make our requests at the same time.
  const requests = [
    supabase.from('games').select('*'),
    gameserversWithContainersQuery,
  ] as const
  const [responseGames, responseGameservers] = await Promise.all(requests)
  loading.value = false

  if (responseGames.error || responseGameservers.error) {
    errorMessage.value = (responseGames.error?.message || responseGameservers.error?.message) || 'Unknown error'
    return
  }

  games.value = responseGames.data
  gameserversWithContainers.value = responseGameservers.data
})

// Filters
const search = ref('')

const gameOptions = computed(() => {
  return games.value?.filter(game => game.name !== null).map(game => ({
    label: game.name!,
    value: game.id,
  })) ?? []
})

const filteredGame = ref()

function clearFilters() {
  filteredGame.value = undefined
  search.value = ''
}
</script>

<template>
  <div class="page">
    <section>
      <h1>Game servers</h1>
      <p>
        Join our game servers and play with the community.
      </p>
    </section>
    <Divider />
    <div class="flex g-s x-start mb-l">
      <Input v-model="search" placeholder="Search servers">
        <template #start>
          <Icon name="ph:magnifying-glass" />
        </template>
      </Input>
      <Select v-model="filteredGame" :options="gameOptions" placeholder="Select game" />
      <Button v-if="filteredGame || search" plain outline @click="clearFilters">
        Clear
      </Button>
    </div>
    <div class="game-servers">
      <template v-for="game in games" :key="game.id">
        <Card v-if="gameserversWithContainers?.some(gameserver => gameserver.game === game.id)" class="game-servers-sidebar">
          <h3 class="flex g-m y-center mb-s">
            {{ game.name }}
            <div class="counter">
              {{ gameserversWithContainers?.filter(gameserver => gameserver.game === game.id).length }}
            </div>
          </h3>
          <ul class="game-server-list">
            <template v-for="gameserver in gameserversWithContainers?.filter(gameserver => gameserver.game === game.id)" :key="gameserver.id">
              <li class="game-server-item">
                <GameserverRow
                  :game="game"
                  :gameserver="gameserver as Tables<'gameservers'>"
                  :container="gameserver.container as Tables<'gameserver_containers'>"
                />
              </li>
            </template>
          </ul>
        </Card>
      </template>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.game-server-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}

.game-servers-sidebar {
  position: sticky;
  top: var(--navbar-offset);
}
</style>
