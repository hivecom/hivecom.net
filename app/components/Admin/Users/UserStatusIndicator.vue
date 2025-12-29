<script setup lang="ts">
import { Flex, Tooltip } from '@dolanske/vui'

defineProps<{
  status: 'active' | 'banned'
  showLabel?: boolean
}>()

const statusLabels = {
  active: 'Active',
  banned: 'Banned',
}

const statusDescriptions = {
  active: 'The user is active and can access the platform.',
  banned: 'The user is currently banned from the platform.',
}
</script>

<template>
  <Tooltip placement="top">
    <template #tooltip>
      <div class="tooltip-content">
        {{ statusDescriptions[$props.status] }}
      </div>
    </template>
    <Flex class="status-indicator-wrapper" y-center>
      <span v-if="showLabel" class="text-s status-text" :class="$props.status">
        {{ statusLabels[$props.status] }}
      </span>
    </Flex>
  </Tooltip>
</template>

<style scoped lang="scss">
.status-indicator-wrapper {
  display: inline-flex;
  align-items: center;
}

.status-text {
  color: var(--color-text-lighter);
}

.status-text.banned {
  color: var(--color-text-red);
}

.tooltip-content {
  color: var(--color-text-light);
  font-size: var(--font-size-xs);
  line-height: 1.4;
}
</style>
