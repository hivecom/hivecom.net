<script setup lang="ts">
import { Flex, Tab, Tabs } from '@dolanske/vui'
import { ref } from 'vue'

import GameTable from '@/components/Admin/Games/GameTable.vue'
import SteamGamesTable from '@/components/Admin/Games/SteamGamesTable.vue'

definePageMeta({ layout: 'admin' })

type GameTab = 'Games' | 'Steam Games'

const activeTab = ref<GameTab>('Games')
</script>

<template>
  <Flex column gap="l">
    <Flex column :gap="0">
      <h1>Games</h1>
      <p class="text-color-light">
        Create rich game entries used across the platform
      </p>
    </Flex>

    <Tabs v-model="activeTab">
      <Tab value="Games">
        Games
      </Tab>
      <Tab value="Steam Games">
        Steam Game Data
      </Tab>
    </Tabs>

    <GameTable v-if="activeTab === 'Games'" />
    <SteamGamesTable v-else-if="activeTab === 'Steam Games'" />
  </Flex>
</template>
