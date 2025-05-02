<script setup lang="ts">
import { Tooltip } from '@dolanske/vui'
import { defineProps } from 'vue'

defineProps<{
  status: 'healthy' | 'unhealthy' | 'offline' | 'unknown'
  showLabel?: boolean
}>()

const statusLabels = {
  healthy: 'Healthy',
  unhealthy: 'Unhealthy',
  offline: 'Offline',
  unknown: 'Unknown',
}
</script>

<template>
  <Tooltip placement="top">
    <template #tooltip>
      <p>{{ statusLabels[status] }}</p>
    </template>
    <div class="status-indicator-wrapper">
      <span :class="`status-indicator ${status}`" />
      <span v-if="showLabel">{{ statusLabels[status] }}</span>
    </div>
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

  &.healthy {
    background-color: var(--color-text-green);
  }

  &.unhealthy {
    background-color: var(--color-text-red);
  }

  &.offline {
    background-color: var(--color-text-gray);
  }

  &.unknown {
    background-color: var(--color-text-yellow);
  }
}
</style>
