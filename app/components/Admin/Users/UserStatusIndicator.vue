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
      <div class="user-status__tooltip-content">
        {{ statusDescriptions[$props.status] }}
      </div>
    </template>
    <Flex class="user-status__indicator-wrapper" y-center>
      <span v-if="showLabel" class="text-s user-status__text" :class="$props.status">
        {{ statusLabels[$props.status] }}
      </span>
    </Flex>
  </Tooltip>
</template>

<style scoped lang="scss">
.user-status__indicator-wrapper {
  display: inline-flex;
  align-items: center;
}

.user-status__text {
  color: var(--color-text-lighter);

  &.banned {
    color: var(--color-text-red);
  }
}

.user-status__tooltip-content {
  color: var(--color-text-light);
  font-size: var(--font-size-xs);
  line-height: 1.4;
}
</style>
