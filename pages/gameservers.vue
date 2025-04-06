<script setup lang="ts">
import { Button, Card, Divider, Input, Select } from '@dolanske/vui'

const search = ref('')

const gameOptions = [{ label: 'Minecraft', value: 0 }, { label: 'GMod', value: 1 }, { label: 'Counter Strike Source', value: 3 }]
const game = ref()

function clearFilters() {
  game.value = undefined
  search.value = ''
}
</script>

<template>
  <div class="container gameservers-page">
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
    <div class="gameservers-wrap">
      <div>
        <div class="grid col-2 g-m">
          <Card v-for="item in 12" :key="item">
            <template #header>
              Server {{ item }}
            </template>
            <p>Lorem ipsum dolor sit amet consectetur, adipisicing elit. Atque, illum. Perspiciatis dolorum a non aliquam numquam eveniet in cum similique qui dicta voluptas, hic accusantium aut soluta, architecto saepe fugit?</p>
          </Card>
        </div>
      </div>

      <div>
        <strong class="flex g-s y-center mb-xs">
          GMOD
          <div class="counter">3</div>
        </strong>
        <ul class="game-server-list">
          <li class="game-server-item">
            <div class="game-server-indicator online" />
            <span class="flex-1">Prop hunt</span>
            <Button size="s">
              Join
            </Button>
          </li>
          <li class="game-server-item">
            <div class="game-server-indicator online" />
            <span class="flex-1">TTT #1</span>
            <Button size="s">
              Join
            </Button>
          </li>
          <li class="game-server-item">
            <div class="game-server-indicator offline" />
            <span class="flex-1">Deathrun</span>
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
            <span class="flex-1">Server #1</span>
            <Button size="s">
              Join
            </Button>
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>

<style lang="scss">
.gameservers-page {
  padding-block: 6.5rem;
}

.gameservers-wrap {
  display: grid;
  grid-template-columns: 1fr 300px;
  gap: 64px;
}

.vui-card {
  --color-bg: white;
}

:root.dark .vui-card {
  --color-bg: var(--color-bg-medium);
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

  // .vui-button {
  //   visibility: hidden;
  // }

  // &:hover {
  //   .vui-button {
  //     visibility: visible;
  //   }
  // }
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
