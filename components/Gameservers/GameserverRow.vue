<script setup lang="ts">
import type { Tables } from '~/types/database.types'

import { Button, Divider, Flex, Tooltip } from '@dolanske/vui'
import { capitalize } from 'vue'

const props = defineProps<{
  game: Tables<'games'>
  gameserver: Tables<'gameservers'>
  container: Tables<'gameserver_containers'>
}>()

const expanded = ref(false)

const state = computed(() => {
  if (!props.container)
    return 'unknown'

  if (props.container.running && props.container.healthy) {
    return 'healthy'
  }
  else if (props.container.running && !props.container.healthy) {
    return 'unhealthy'
  }
  else {
    return 'offline'
  }
})
</script>

<template>
  <div class="gameserver-row" @click="expanded = !expanded">
    <Flex align-center row space-between gap="s">
      <Flex align-center row gap="s">
        <Tooltip placement="top">
          <template #tooltip>
            <p>{{ capitalize(state) }}</p>
          </template>
          <div :class="`gameserver-indicator ${state}`" />
        </Tooltip>
        <span class="flex-1 text-ms">{{ props.gameserver.description }} (We need a DB column for the name)</span>
      </Flex>
      <div>
        <span>{{ props.gameserver.region }}</span>
      </div>
      <Button v-if="props.gameserver.addresses" size="s">
        Join
      </Button>
    </Flex>
    <div v-if="expanded" class="gameserver-child-row">
      <Divider />
      {{ props.gameserver.description }}
    </div>
  </div>
</template>

<style scoped lang="scss">
.gameserver-row {
  cursor: pointer;
  padding: var(--space-xs) var(--space-m);
  border-radius: var(--border-radius-m);
  background-color: var(--color-bg-raised);
  transition: background-color 0.2s ease-in-out;

  &:hover {
    background-color: var(--color-bg-lowered);
  }
}

.gameserver-child-row {
  border-radius: var(--border-radius-m);
  background-color: var(--color-bg-raised);
  margin-top: var(--space-xs);
  transition: background-color 0.2s ease-in-out;

  &:hover {
    background-color: var(--color-bg-lowered);
  }
}

.gameserver-indicator {
  width: 10px;
  height: 10px;
  border-radius: 99px;

  &.online {
    background-color: var(--color-text-green);
  }

  &.unhealthy {
    background-color: var(--color-text-red);
  }

  &.unknown {
    background-color: var(--color-text-yellow);
  }

  &.offline {
    background-color: var(--color-text-gray);
  }
}
</style>
