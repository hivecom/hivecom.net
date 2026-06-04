<script setup lang="ts">
import { Badge, BadgeGroup, Tooltip } from '@dolanske/vui'
import { useIrcChat } from '@/composables/useIrcChat'
import { useBreakpoint } from '@/lib/mediaQuery'

const { connState, latencyMs } = useIrcChat()
const isMobile = useBreakpoint('<s')

const variant = computed(() => ({
  disconnected: 'neutral' as const,
  connecting: 'info' as const,
  connected: 'accent' as const,
  error: 'danger' as const,
}[connState.value]))

const label = computed(() => ({
  disconnected: 'Disconnected',
  connecting: 'Connecting',
  connected: 'Connected',
  error: 'Error',
}[connState.value]))

const latencyLabel = computed(() => {
  if (latencyMs.value == null)
    return null
  return `${latencyMs.value} ms`
})
</script>

<template>
  <Tooltip :disabled="isMobile || connState !== 'connected' || latencyLabel == null">
    <BadgeGroup :gap="0">
      <Badge size="s" :variant="variant">
        {{ label }}
      </Badge>
      <Badge v-if="connState === 'connected' && latencyLabel" size="s" variant="accent" class="state-badge__latency">
        {{ latencyLabel }}
      </Badge>
    </BadgeGroup>
    <template #tooltip>
      <p>Round-trip latency: {{ latencyLabel }}</p>
    </template>
  </Tooltip>
</template>

<style lang="scss" scoped>
.state-badge__latency {
  font-variant-numeric: tabular-nums;
}
</style>
