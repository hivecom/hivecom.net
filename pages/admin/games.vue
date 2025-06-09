<script setup lang="ts">
import { Flex } from '@dolanske/vui'

import GameTable from '~/components/Admin/Games/GameTable.vue'
</script>

<template>
  <Flex column gap="l">
    <Flex column :gap="0">
      <h1>Games</h1>
      <p class="color-text-light">
        Create definitions for games, which will be highlighted and more
      </p>
    </Flex>

    <!-- Games Tab -->
    <GameTable />
  </Flex>
</template>
