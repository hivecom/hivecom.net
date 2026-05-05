<script setup lang="ts">
import type { MetricsPeriod } from '@/composables/useDataMetrics'
import { Flex, Modal } from '@dolanske/vui'
import { ref } from 'vue'
import ChartBrush from '@/components/Shared/Charts/ChartBrush.vue'
import { METRICS_PERIOD_OPTIONS, PERIOD_CONFIGS } from '@/composables/useDataMetrics'
import { getCSSVariable } from '@/lib/utils/common'

type SeriesKey = 'membersOnline' | 'teamspeakOnline' | 'gameserversPlayers'

const {
  color = getCSSVariable('--color-accent'),
} = defineProps<{
  title?: string
  series?: SeriesKey[]
  color?: string
}>()

const open = defineModel<boolean>('open', { default: false })

const activePeriod = ref<MetricsPeriod>('7d')
const activeWindow = ref<{ start: Date, end: Date } | null>(null)
const activeUtc = ref(false)

const MATCH_TOLERANCE_MS = 60 * 1000

function onBrushChange(window: { start: Date, end: Date }) {
  activeWindow.value = window
  const duration = window.end.getTime() - window.start.getTime()
  const matched = METRICS_PERIOD_OPTIONS.find((opt) => {
    const config = PERIOD_CONFIGS[opt.value]
    return Math.abs(duration - config.hours * 60 * 60 * 1000) < MATCH_TOLERANCE_MS
  })
  if (matched)
    activePeriod.value = matched.value
}
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
      <h4>{{ title ?? 'Activity' }}</h4>
    </template>

    <Flex column gap="m">
      <ChartBrush
        :series="series"
        :color="color"
        @change="onBrushChange"
        @update:utc="activeUtc = $event"
      />
      <slot :period="activePeriod" :window="activeWindow" :utc="activeUtc" :color />
    </Flex>
  </Modal>
</template>
