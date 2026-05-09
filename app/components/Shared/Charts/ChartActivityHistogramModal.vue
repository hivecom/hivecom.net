<script setup lang="ts">
import type { MetricsPeriod } from '@/composables/useDataMetrics'
import { Flex, Modal } from '@dolanske/vui'
import { ref, watch } from 'vue'
import ChartActivityHistogramControls from '@/components/Shared/Charts/ChartActivityHistogramControls.vue'
import MetricsRefreshCountdown from '@/components/Shared/Charts/MetricsRefreshCountdown.vue'
import OnlineBadge from '@/components/Shared/OnlineBadge.vue'

type SeriesKey = 'membersOnline' | 'teamspeakOnline' | 'gameserversPlayers' | 'membersGameActivity' | 'membersSteamGameActivity'

const props = defineProps<{
  title?: string
  count?: number | null
  countLabel?: string
  countSingular?: string
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
        <h4>{{ title ?? 'Activity' }}</h4>
        <OnlineBadge v-if="count !== undefined" :count="count ?? null" :label="countLabel ?? 'online'" :singular="countSingular" size="s" :color="props.color" />
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
