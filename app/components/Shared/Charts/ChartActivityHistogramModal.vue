<script setup lang="ts">
import type { MetricsPeriod } from '@/composables/useDataMetrics'
import { Flex, Modal, Tooltip } from '@dolanske/vui'
import { ref, watch } from 'vue'
import ChartActivityHistogramControls from '@/components/Shared/Charts/ChartActivityHistogramControls.vue'
import MetricsRefreshCountdown from '@/components/Shared/Charts/MetricsRefreshCountdown.vue'
import OnlineBadge from '@/components/Shared/OnlineBadge.vue'

type SeriesKey = 'usersOnline' | 'teamspeakOnline' | 'ircMessages' | 'gameserversPlayers' | 'usersGameActivity' | 'usersSteamGameActivity'

const props = defineProps<{
  title?: string
  // Small line under the title, e.g. what the chart below is scoped to.
  subtitle?: string
  count?: number | null
  countLabel?: string
  countSingular?: string
  // Extra text after the count, e.g. a message total for the loaded range.
  countSuffix?: string
  // Optional explainer shown as an info icon next to the count badge.
  countInfo?: string
  series?: SeriesKey[]
  color?: string
  initialPeriod?: MetricsPeriod
  initialWindow?: { start: Date, end: Date } | null
  gameId?: number
  steamGameId?: number
  serverId?: number
  serverName?: string
}>()

const open = defineModel<boolean>('open', { default: false })

// Re-key ChartActivityHistogramControls each time the modal opens so it re-mounts with the new initialWindow.
// Reset state on close so the chart doesn't render stale data on reopen.
const brushKey = ref(0)
watch(open, (val) => {
  if (val)
    brushKey.value++
})
</script>

<template>
  <Modal
    :open="open"
    size="l"
    centered
    :card="{ separators: true }"
    @close="open = false"
  >
    <template #header>
      <Flex y-center gap="s" x-between>
        <Flex column gap="xxs">
          <h4>{{ title ?? 'Activity' }}</h4>
          <span v-if="subtitle" class="activity-modal__subtitle">{{ subtitle }}</span>
        </Flex>
        <Flex gap="xs" y-center>
          <OnlineBadge v-if="count !== undefined" :count="count ?? null" :label="countLabel ?? 'online'" :singular="countSingular" :suffix="countSuffix" :color="props.color" />
          <Tooltip v-if="countInfo" placement="top">
            <Icon name="ph:info" :size="12" class="activity-modal__info" />
            <template #tooltip>
              <p>{{ countInfo }}</p>
            </template>
          </Tooltip>
        </Flex>
      </Flex>
    </template>

    <ChartActivityHistogramControls
      :brush-key="brushKey"
      :series="props.series"
      :color="props.color"
      :initial-period="props.initialPeriod"
      :initial-window="props.initialWindow"
      :game-id="props.gameId"
      :steam-game-id="props.steamGameId"
      :server-id="props.serverId"
      :server-name="props.serverName"
    >
      <template v-if="$slots['above-chart']" #above-chart>
        <slot name="above-chart" />
      </template>
      <template v-if="$slots.controls" #controls>
        <slot name="controls" />
      </template>
      <template #default="slotProps">
        <slot v-bind="slotProps" />
      </template>
    </ChartActivityHistogramControls>
    <template #footer>
      <Flex x-end>
        <MetricsRefreshCountdown />
      </Flex>
    </template>
  </Modal>
</template>

<style scoped lang="scss">
.activity-modal__info {
  color: var(--color-text-lightest);
}

.activity-modal__subtitle {
  font-size: var(--font-size-xxs);
  color: var(--color-text-lightest);
}
</style>
