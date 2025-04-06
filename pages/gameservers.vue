<script setup lang="ts">
import { Button, Card, Divider, Input, Select } from '@dolanske/vui'
import type { Database } from '~/types/database.types'

// NOTE: Very WIP feel free to continue the integration + add your flavours
// The idea is we show game servers in a two columnb grid and a sidebar overview

// Fetch data
const supabase = useSupabaseClient()
const servers = ref<Database['public']['Tables']['gameservers']['Row'][]>()

onBeforeMount(() => {
  supabase.from("gameservers").select('*')
    .then((res) => {
      if (res.data) {
        servers.value = res.data
      }
    })
})

// Filters

const search = ref('')

const gameOptions = [{ label: 'Minecraft', value: 0 }, { label: 'GMod', value: 1 }, { label: 'Counter Strike Source', value: 3 }]
const game = ref()

function clearFilters() {
  game.value = undefined
  search.value = ''
}
</script>

<template>
  <div class="game-servers-page">
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
          <Card v-for="server in servers" :key="server.id">
            <template #header>
              <h5>{{server.game}}</h5>
            </template>
            <p>{{ server.description }}</p>
            <pre>
              {{ server }}
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
