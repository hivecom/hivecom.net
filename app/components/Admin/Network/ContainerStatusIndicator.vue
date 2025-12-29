<script setup lang="ts">
import { Flex, Tooltip } from '@dolanske/vui'

defineProps<{
  status: 'running' | 'healthy' | 'unhealthy' | 'stopped' | 'stale' | 'unknown'
  showLabel?: boolean
}>()

const statusLabels = {
  running: 'Running',
  healthy: 'Healthy',
  unhealthy: 'Unhealthy',
  stopped: 'Stopped',
  stale: 'Stale',
  unknown: 'Unknown',
}

const statusDescriptions = {
  running: 'The container is running.',
  healthy: 'The container is running and functioning properly.',
  unhealthy: 'The container is running but may not be functioning properly.',
  stopped: 'The container is stopped and not running.',
  stale: 'The container has not reported status in a while and might have been removed.',
  unknown: 'The status of the container is unknown.',
}
</script>

<template>
  <Tooltip placement="top">
    <template #tooltip>
      <div class="containers__tooltip-content">
        {{ statusDescriptions[status] }}
      </div>
    </template>
    <Flex class="containers__status-indicator-wrapper" y-center>
      <span :class="`containers__status-indicator ${status}`" />
      <span v-if="showLabel" class="text-s">{{ statusLabels[status] }}</span>
    </Flex>
  </Tooltip>
</template>

<style lang="scss">
.containers__status-indicator-wrapper {
  display: inline-flex;
  align-items: center;
  gap: var(--space-xs);
}

.containers__status-indicator {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 50%;

  &.running {
    background-color: var(--color-text-green);
  }

  &.healthy {
    background-color: var(--color-text-green);
  }

  &.unhealthy,
  &.unknown {
    background-color: var(--color-text-red);
  }

  &.stopped {
    background-color: var(--color-text);
  }

  &.stale {
    background-color: var(--color-text-yellow);
  }
}

.containers__tooltip-content {
  color: var(--color-text-light);
  font-size: var(--font-size-xs);
  line-height: 1.4;
}
</style>
