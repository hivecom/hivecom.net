<script setup lang="ts">
import { Flex, Tooltip } from '@dolanske/vui'

defineProps<{
  status: 'active' | 'inactive' | 'accessible' | 'inaccessible' | 'not_enabled'
  showLabel?: boolean
}>()

const statusLabels = {
  active: 'Active',
  inactive: 'Inactive',
  accessible: 'Accessible',
  inaccessible: 'Inaccessible',
  not_enabled: 'Not enabled',
}

const statusDescriptions = {
  active: 'The server is active and available.',
  inactive: 'The server is inactive or unavailable.',
  accessible: 'Docker Control responded successfully.',
  inaccessible: 'Docker Control is unresponsive.',
  not_enabled: 'Docker Control is not enabled for this server.',
}
</script>

<template>
  <Tooltip placement="top">
    <template #tooltip>
      <div class="servers__tooltip-content">
        {{ statusDescriptions[status] }}
      </div>
    </template>
    <Flex class="servers__status-indicator-wrapper" y-center>
      <span :class="`servers__status-indicator ${status}`" />
      <span v-if="showLabel" class="text-s">{{ statusLabels[status] }}</span>
    </Flex>
  </Tooltip>
</template>

<style scoped lang="scss">
.servers__status-indicator-wrapper {
  display: inline-flex;
  align-items: center;
  gap: var(--space-xs);
}

.servers__status-indicator {
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

  &.accessible {
    background-color: var(--color-text-green);
  }

  &.inaccessible {
    background-color: var(--color-text-red);
  }

  &.not_enabled {
    background-color: var(--color-text-yellow);
  }
}

.servers__tooltip-content {
  color: var(--color-text-light);
  font-size: var(--font-size-xs);
  line-height: 1.4;
}
</style>
