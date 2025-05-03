<script setup lang="ts">
import { Flex, Tooltip } from '@dolanske/vui'
import { defineProps } from 'vue'

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
      <p>{{ statusDescriptions[status] }}</p>
    </template>
    <Flex class="status-indicator-wrapper" y-center>
      <span :class="`status-indicator ${status}`" />
      <span v-if="showLabel">{{ statusLabels[status] }}</span>
    </Flex>
  </Tooltip>
</template>

<style scoped>
.status-indicator-wrapper {
  display: inline-flex;
  align-items: center;
  gap: var(--space-xs);
}

.status-indicator {
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
    background-color: var(--color-text-lighter);
  }
}
</style>
