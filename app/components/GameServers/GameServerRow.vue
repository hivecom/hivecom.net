<script setup lang="ts">
import type { Tables } from '@/types/database.types'
import { Button, CopyClipboard, Dropdown, DropdownItem, Flex, Tooltip } from '@dolanske/vui'
import { capitalize } from 'vue'
import RegionIndicator from '@/components/Shared/RegionIndicator.vue'
import { useBreakpoint } from '@/lib/mediaQuery'

type ContainerWithServer = Tables<'containers'> & {
  server?: {
    docker_control?: boolean | null
    accessible?: boolean | null
  } | null
}

const props = defineProps<{
  game?: Tables<'games'> | null
  gameserver: Tables<'gameservers'>
  container: ContainerWithServer | null
  compact?: boolean
}>()

const router = useRouter()

const state = computed(() => {
  if (!props.container)
    return 'unknown'

  if (props.container.server?.docker_control !== true)
    return 'unknown'

  if (props.container.server?.accessible === false)
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

const isCompactLayout = useBreakpoint('<s')
</script>

<template>
  <button class="gameserver-row" @click="router.push(`/servers/gameservers/${props.gameserver.id}`)">
    <Flex
      y-center
      row
      gap="s"
      class="gameserver-row-header gameserver-row-clickable"
    >
      <Flex
        y-center
        row
        x-start
        gap="s"
        expand
        style="min-width: 0;"
      >
        <Tooltip placement="top">
          <template #tooltip>
            <p>{{ capitalize(state) }}{{ state === 'offline' ? ' - Ask an administrator to start it' : state === 'unknown' ? ' - Docker Control is unavailable for this server' : '' }}</p>
          </template>
          <div :class="`gameserver-indicator ${state}`" />
        </Tooltip>
        <Flex expand x-between>
          <span
            :class="isCompactLayout ? 'text-xxs' : 'text-m'"
            style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0;"
          >
            {{ props.gameserver.name }}
          </span>
        </Flex>
      </Flex>
      <Flex y-center row x-end gap="s">
        <!-- <div v-if="props.gameserver.description && !props.compact" class="gameserver-description-main">
          <span class="description-text">{{ props.gameserver.description }}</span>
        </div> -->
        <div class="region-badge">
          <RegionIndicator :region="props.gameserver.region" :show-label="!isCompactLayout" />
        </div>
        <div v-if="props.gameserver.addresses && !isCompactLayout" data-dropdown-ignore @click.stop="() => {}">
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
    </Flex>
  </button>
</template>

<style lang="scss">
@use '@/assets/breakpoints.scss' as *;

.gameserver-row {
  width: 100% !important;
  display: block;
  border: none;
  background: none;
  padding: 0;
  color: var(--color-text);
  text-align: left;
}

.gameserver-row-header {
  padding: var(--space-xs) var(--space-m);
  border-radius: var(--border-radius-m);
  background-color: var(--color-bg-medium);
  transition: var(--transition-fast);
  cursor: pointer;
  overflow: hidden;
  min-width: 0;
  width: 100%;
  box-sizing: border-box;

  &.gameserver-row-clickable:hover {
    background-color: var(--color-bg-raised);

    .gameserver-row-arrow {
      transform: translateX(4px);
      color: var(--color-accent);
    }
  }
}

.gameserver-row-arrow {
  color: var(--color-text-lighter);
  transition: var(--transition-fast);
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

  @media screen and (max-width: $breakpoint-m) {
    display: none;
  }
}

.gameserver-indicator {
  width: 10px;
  height: 10px;
  border-radius: 99px;
  flex-shrink: 0;

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
  padding: var(--space-xxs) var(--space-xs);
  border-radius: var(--border-radius-s);
  border: 1px solid var(--color-border);
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

.region-badge .region-indicator {
  font-size: var(--font-size-s);
  color: var(--color-text-light);
}
</style>
