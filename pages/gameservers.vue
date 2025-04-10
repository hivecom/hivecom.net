<script setup lang="ts">
import type { Database } from '~/types/database.types'
import { Button, Card, Divider, Input, Select } from '@dolanske/vui'

// NOTE: Very WIP feel free to continue the integration + add your flavours
// The idea is we show game servers in a two columnb grid and a sidebar overview

// Fetch data
const supabase = useSupabaseClient()
const loading = ref(true)
const errorMessage = ref('')
const games = ref<Database['public']['Tables']['games']['Row'][]>()
const gameservers = ref<Database['public']['Tables']['gameservers']['Row'][]>()

onMounted(async () => {
  // Make our requests at the same time.
  const requests = [
    supabase.from('games').select('*'),
    supabase.from('gameservers').select('*'),
  ] as const
  const [responseGames, responseGameservers] = await Promise.all(requests)
  loading.value = false

  if (responseGames.error || responseGameservers.error) {
    errorMessage.value = (responseGames.error?.message || responseGameservers.error?.message) || 'Unknown error'
    return
  }

  games.value = responseGames.data as Database['public']['Tables']['games']['Row'][]
  gameservers.value = responseGameservers.data as Database['public']['Tables']['gameservers']['Row'][]
})

// Filters
const search = ref('')

const gameOptions = computed(() => {
  return games.value?.filter(game => game.name !== null).map(game => ({
    label: game.name!,
    value: game.id,
  })) ?? []
})

const game = ref()

function clearFilters() {
  game.value = undefined
  search.value = ''
}
</script>

<template>
  <h3>Game servers</h3>
  <Divider />
  <div class="flex g-s y-center x-start mb-l">
    <Input v-model="search" placeholder="Search servers">
      <template #start>
        <Icon name="ph:magnifying-glass" />
      </template>
    </Input>
    <Select v-model="game" :options="gameOptions" placeholder="Select game" />
    <Button v-if="game || search" plain outline @click="clearFilters">
      Clear
    </Button>
  </div>
  <div class="game-servers-wrap">
    <div>
      <div class="grid col-2 g-m">
        <Card v-for="gameserver in gameservers" :key="gameserver.id">
          <template #header>
            <h5>{{ gameserver.game }}</h5>
          </template>
          <p>{{ gameserver.description }}</p>
          <pre>
              {{ gameserver }}
            </pre>
        </Card>
      </div>
    </div>

        <div>
      <div class="grid col-2 g-m">
        <Card v-for="game in games" :key="game.id">
          <template #header>
            <h5>{{ game.name }}</h5>
          </template>
          <p>{{ game.steam_id }}</p>
          <pre>
              {{ game }}
            </pre>
        </Card>
      </div>
    </div>
    <div>
      <div class="game-servers-sidebar">
        <strong class="flex g-s y-center mb-xs">
          GMOD
          <div class="counter">3</div>
        </strong>
        <ul class="game-server-list">
          <li class="game-server-item">
            <div class="game-server-indicator online" />
            <span class="flex-1 text-ms">Prop hunt</span>
            <Button size="s">
              Join
            </Button>
          </li>
          <li class="game-server-item">
            <div class="game-server-indicator online" />
            <span class="flex-1 text-ms">TTT #1</span>
            <Button size="s">
              Join
            </Button>
          </li>
          <li class="game-server-item">
            <div class="game-server-indicator offline" />
            <span class="flex-1 text-ms">Deathrun</span>
          </li>
        </ul>
        <Divider margin="16px 0" />
        <strong class="flex g-s y-center mb-xs">
          CS Source
          <div class="counter">1</div>
        </strong>
        <ul class="game-server-list">
          <li class="game-server-item">
            <div class="game-server-indicator online" />
            <span class="flex-1 text-ms">Server #1</span>
            <Button size="s">
              Join
            </Button>
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.game-servers-page {
  padding-block: 6.5rem;
}

.game-servers-wrap {
  display: grid;
  grid-template-columns: 1fr 324px;
  gap: 48px;
}

.vui-card {
  --color-bg: white;
}

:root.dark .vui-card {
  --color-bg: var(--color-bg-medium);
}

.game-servers-sidebar {
  padding-top: var(--space-s);
  position: sticky;
  top: var(--navbar-offset);
}

.game-server-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  padding-left: var(--space-m);
}

.game-server-item {
  display: flex;
  align-items: center;
  gap: var(--space-s);
  height: 28px;
}

.game-server-indicator {
  width: 10px;
  height: 10px;
  border-radius: 99px;

  &.online {
    background-color: var(--color-text-green);
  }

  &.offline {
    background-color: var(--color-text-red);
  }
}
</style>
