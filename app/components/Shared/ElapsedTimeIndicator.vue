<script setup lang="ts">
import { Flex, Tooltip } from '@dolanske/vui'
import { computed } from 'vue'
import { getLastSeenTextClass, getLastSeenVariant, getUserActivityStatus } from '@/lib/lastSeen'

const props = withDefaults(defineProps<{
  date: string | null
  /**
   * Label shown when the date is within the active threshold.
   * Set to null to disable the active state entirely (no dot, no special label).
   */
  activeLabel?: string | null
  /**
   * Minutes within which the date is considered "active". Defaults to 15.
   */
  activeThresholdMinutes?: number
}>(), {
  activeLabel: 'Online',
  activeThresholdMinutes: 15,
})

const status = computed(() => {
  if (!props.date)
    return null
  return getUserActivityStatus(props.date)
})

const isActive = computed(() => {
  if (props.activeLabel === null || !props.date)
    return false
  const d = new Date(props.date)
  return (Date.now() - d.getTime()) < props.activeThresholdMinutes * 60 * 1000
})

const variant = computed(() => {
  if (isActive.value)
    return 'online' as const
  return getLastSeenVariant(status.value)
})

const textClass = computed(() => getLastSeenTextClass(variant.value))

const displayText = computed(() => {
  if (!props.date || !status.value)
    return 'Never'
  if (Number.isNaN(status.value.lastSeenTimestamp.getTime()))
    return 'Never'
  if (isActive.value)
    return props.activeLabel!
  // When activeLabel is null and the date is very recent, getUserActivityStatus
  // still returns "Online" as lastSeenText - compute elapsed directly instead.
  if (status.value.lastSeenText === 'Online') {
    const minutes = Math.floor((Date.now() - status.value.lastSeenTimestamp.getTime()) / 60000)
    return minutes <= 1 ? '1 minute ago' : `${minutes} minutes ago`
  }
  return status.value.lastSeenText.replace(/^Last online (?:on )?/, '') || 'Never'
})

const tooltipText = computed(() => {
  if (!props.date)
    return null
  const d = new Date(props.date)
  if (Number.isNaN(d.getTime()))
    return null
  const detailed = d.toISOString().replace('T', ' ').replace('Z', '')
  const offset = d.getTimezoneOffset()
  const offsetSign = offset <= 0 ? '+' : '-'
  const offsetHours = String(Math.abs(Math.floor(offset / 60))).padStart(2, '0')
  const offsetMinutes = String(Math.abs(offset % 60)).padStart(2, '0')
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
  return `${detailed} (UTC${offsetSign}${offsetHours}:${offsetMinutes}, ${timezone})`
})
</script>

<template>
  <Tooltip v-if="tooltipText" placement="top">
    <template #tooltip>
      <div class="text-xs">
        {{ tooltipText }}
      </div>
    </template>
    <Flex gap="xs" y-center class="elapsed-time-indicator">
      <span v-if="isActive" class="elapsed-time-dot" />
      <span class="text-s" :class="textClass">{{ displayText }}</span>
    </Flex>
  </Tooltip>
  <Flex v-else gap="xs" y-center class="elapsed-time-indicator">
    <span class="text-s text-color-lightest">Never</span>
  </Flex>
</template>

<style scoped lang="scss">
.elapsed-time-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background-color: var(--color-text-green);
  flex-shrink: 0;
}

.elapsed-time-indicator {
  cursor: help;
}
</style>
