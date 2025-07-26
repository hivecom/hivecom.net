<script setup lang="ts">
import type { Tables } from '@/types/database.types'
import { Button, CopyClipboard, Dropdown, DropdownItem, Flex, Tooltip } from '@dolanske/vui'
import { capitalize } from 'vue'
import RegionIndicator from '@/components/Shared/RegionIndicator.vue'

const props = defineProps<{
  game?: Tables<'games'> | null
  gameserver: Tables<'gameservers'>
  container: Tables<'containers'> | null
  compact?: boolean
}>()

const router = useRouter()

const state = computed(() => {
  if (!props.container)
    return 'unknown'

  if (props.container.running && props.container.healthy === null) {
    return 'running'
  }

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
  <button class="gameserver-row" @click="router.push(`/gameservers/${props.gameserver.id}`)">
    <Flex y-center row x-between gap="s" class="gameserver-row-header gameserver-row-clickable">
      <Flex y-center row gap="s">
        <Tooltip placement="top">
          <template #tooltip>
            <p>{{ capitalize(state) }}{{ state === 'offline' ? ' - Ask an administrator to start it' : '' }}</p>
          </template>
          <div :class="`gameserver-indicator ${state}`" />
        </Tooltip>
        <span class="flex-1 text-m">{{ props.gameserver.name }}</span>
      </Flex>
      <div class="flex-1" />
      <Flex y-center row gap="s" x-end>
        <!-- <div v-if="props.gameserver.description && !props.compact" class="gameserver-description-main">
          <span class="description-text">{{ props.gameserver.description }}</span>
        </div> -->
        <div class="region-badge">
          <RegionIndicator :region="props.gameserver.region" show-label />
        </div>
        <div v-if="props.gameserver.addresses" data-dropdown-ignore @click.stop="noop">
          <CopyClipboard v-if="props.gameserver.addresses.length === 1" :text="`${props.gameserver.addresses[0]}${props.gameserver.port ? `:${props.gameserver.port}` : ''}`" confirm>
            <Button size="s" variant="gray">
              Join
            </Button>
          </CopyClipboard>
          <Dropdown v-else>
            <template #trigger="{ toggle }">
              <Button size="s" variant="gray" @click.stop="toggle">
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
        </div>
      </Flex>
      <Icon name="ph:caret-right" class="gameserver-row-arrow" size="16" />
    </Flex>
  </button>
</template>

<style lang="scss">
@use '@/assets/breakpoints.scss' as *;

.gameserver-row {
  width: 100% !important;
}

.gameserver-row-header {
  padding: var(--space-xs) var(--space-m);
  border-radius: var(--border-radius-m);
  background-color: var(--color-bg-medium);
  transition: all 0.2s ease-in-out;
  cursor: pointer;

  &.gameserver-row-clickable:hover {
    // transform: translateY(-1px);
    background-color: var(--color-bg-raised);

    .gameserver-row-arrow {
      transform: translateX(4px);
      color: var(--color-accent);
    }
  }
}

.gameserver-row-arrow {
  color: var(--color-text-lighter);
  transition: all 0.2s ease-in-out;
}

.gameserver-description-main {
  display: flex;
  align-items: center;
  margin: 0 var(--space-s);

  .description-text {
    font-size: var(--font-size-s);
    color: var(--color-text-lighter);
    font-style: italic;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 400px;
  }

  @media screen and (max-width: $breakpoint-md) {
    display: none;
  }
}

.gameserver-indicator {
  width: 10px;
  height: 10px;
  border-radius: 99px;

  &.healthy,
  &.running {
    background-color: var(--color-text-green);
  }

  &.unhealthy {
    background-color: var(--color-text-red);
  }

  &.unknown {
    background-color: var(--color-text-yellow);
  }

  &.offline {
    background-color: var(--color-text-lighter);
  }
}

.region-badge {
  background-color: var(--color-bg);
  padding: var(--space-xs) var(--space-s);
  border-radius: var(--border-radius-s);
  border: 1px solid var(--color-border);
  display: flex;
  align-items: center;
}

.region-badge .region-indicator {
  font-size: var(--font-size-s);
  color: var(--color-text-light);
}
</style>
