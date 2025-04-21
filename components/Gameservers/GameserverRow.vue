<script setup lang="ts">
import type { Tables } from '~/types/database.types'

import { Button, CopyClipboard, Dropdown, DropdownItem, Flex, Tooltip } from '@dolanske/vui'
import { capitalize } from 'vue'

const props = defineProps<{
  game: Tables<'games'>
  gameserver: Tables<'gameservers'>
  container: Tables<'containers'> | null
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
  <div class="gameserver-row">
    <Flex y-center row x-between gap="s" :class="`gameserver-row-header ${expanded ? 'expanded' : ''}`">
      <Flex y-center row gap="s">
        <Button :icon="expanded ? `ph:caret-down` : `ph:caret-right`" square variant="gray" size="s" @click="expanded = !expanded" />
        <Tooltip placement="top">
          <template #tooltip>
            <p>{{ capitalize(state) }}</p>
          </template>
          <div :class="`gameserver-indicator ${state}`" />
        </Tooltip>
        <span class="flex-1 text-ms">{{ props.gameserver.name }}</span>
        <div>
          <span>{{ props.gameserver.region }}</span>
        </div>
      </Flex>
      <template v-if="props.gameserver.addresses">
        <CopyClipboard v-if="props.gameserver.addresses.length === 1" :text="`${props.gameserver.addresses[0]}${props.gameserver.port ? `:${props.gameserver.port}` : ''}`" confirm>
          <Button size="s" variant="gray">
            Join
          </Button>
        </CopyClipboard>
        <Dropdown v-else>
          <template #trigger="{ toggle }">
            <Button size="s" variant="gray" @click="toggle">
              <Flex y-center gap="xs">
                Join
                <Icon name="ph:caret-down" size="s" />
              </Flex>
            </Button>
          </template>
          <DropdownItem v-for="address in props.gameserver.addresses" :key="address">
            <CopyClipboard :text="`${address}${props.gameserver.port ? `:${props.gameserver.port}` : ''}`" confirm>
              {{ `${address}${props.gameserver.port ? `:${props.gameserver.port}` : ''}` }}
            </CopyClipboard>
          </DropdownItem>
        </Dropdown>
      </template>
    </Flex>
    <Flex v-if="expanded" class="gameserver-row-child">
      {{ props.gameserver.description }}
    </Flex>
  </div>
</template>

<style scoped lang="scss">
.gameserver-row {
  width: 100% !important;
}

.gameserver-row-header {
  padding: var(--space-xs) var(--space-m);
  border-radius: var(--border-radius-m);
  background-color: var(--color-bg-raised);
  transition: background-color 0.2s ease-in-out;

  &.expanded {
    border-bottom-left-radius: 0;
    border-bottom-right-radius: 0;
  }
}

.gameserver-row-child {
  padding: var(--space-s) var(--space-m);
  border-radius: var(--border-radius-m);
  border-top-left-radius: 0;
  border-top-right-radius: 0;
  border: 1px solid var(--color-bg-raised);
  transition: background-color 0.2s ease-in-out;
}

.gameserver-indicator {
  width: 10px;
  height: 10px;
  border-radius: 99px;

  &.healthy {
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
