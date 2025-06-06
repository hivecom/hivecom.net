<script setup lang="ts">
import { Flex, Tooltip } from '@dolanske/vui'

defineProps<{
  status: 'active' | 'inactive'
  showLabel?: boolean
}>()

const statusLabels = {
  active: 'Active',
  inactive: 'Inactive',
}

const statusDescriptions = {
  active: 'The server is active and available.',
  inactive: 'The server is inactive or unavailable.',
}
</script>

<template>
  <Tooltip placement="top">
    <template #tooltip>
      <div class="tooltip-content">
        {{ statusDescriptions[status] }}
      </div>
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

  &.active {
    background-color: var(--color-text-green);
  }

  &.inactive {
    background-color: var(--color-text-red);
  }
}

.tooltip-content {
  color: var(--color-text-light);
  font-size: var(--font-size-xs);
  line-height: 1.4;
}
</style>
