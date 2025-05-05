<script setup lang="ts">
import { Flex } from '@dolanske/vui'

import GameTable from '~/components/Admin/Games/GameTable.vue'
</script>

<template>
  <Flex column gap="m">
    <Flex x-between>
      <h3>Games</h3>
    </Flex>

    <!-- Games Tab -->
    <GameTable />
  </Flex>
</template>
