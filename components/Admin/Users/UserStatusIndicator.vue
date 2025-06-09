<script setup lang="ts">
import { Flex, Tooltip } from '@dolanske/vui'

defineProps<{
  status: 'active' | 'banned' | 'supporter' | 'lifetime_supporter' | 'admin' | 'moderator' | 'unknown'
  showLabel?: boolean
}>()

const statusLabels = {
  active: 'Active',
  banned: 'Banned',
  supporter: 'Supporter',
  lifetime_supporter: 'Lifetime Supporter',
  admin: 'Admin',
  moderator: 'Moderator',
  unknown: 'Unknown',
}

const statusDescriptions = {
  active: 'The user is active and can access the platform.',
  banned: 'The user is currently banned from the platform.',
  supporter: 'The user is an active Patreon supporter.',
  lifetime_supporter: 'The user has lifetime supporter status.',
  admin: 'The user has administrator privileges.',
  moderator: 'The user has moderator privileges.',
  unknown: 'The user status is unknown.',
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

  &.supporter,
  &.lifetime_supporter {
    background-color: var(--color-text-blue);
  }

  &.admin {
    background-color: var(--color-text-purple);
  }

  &.moderator {
    background-color: var(--color-text-yellow);
  }

  &.banned,
  &.unknown {
    background-color: var(--color-text-red);
  }
}

.tooltip-content {
  color: var(--color-text-light);
  font-size: var(--font-size-xs);
  line-height: 1.4;
}
</style>
