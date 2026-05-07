<script setup lang="ts">
import type { MetricsPeriod } from '@/composables/useDataMetrics'
import { Flex } from '@dolanske/vui'
import { computed, ref } from 'vue'
import ChartBrush from '@/components/Shared/Charts/ChartBrush.vue'
import { METRICS_PERIOD_OPTIONS, PERIOD_CONFIGS } from '@/composables/useDataMetrics'
import { getCSSVariable } from '@/lib/utils/common'

type SeriesKey = 'membersOnline' | 'teamspeakOnline' | 'gameserversPlayers'

const props = defineProps<{
  series?: SeriesKey[]
  color?: string
  initialWindow?: { start: Date, end: Date } | null
  brushKey?: number
}>()

const color = computed(() => props.color ?? getCSSVariable('--color-accent'))

const activePeriod = ref<MetricsPeriod>('24h')
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
  <Flex column gap="m">
    <slot name="above-chart" />
    <ChartBrush
      :key="brushKey"
      :series="series"
      :color="color"
      :initial-window="props.initialWindow"
      @change="onBrushChange"
      @update:utc="activeUtc = $event"
    />
    <slot :period="activePeriod" :window="activeWindow" :utc="activeUtc" :color />
  </Flex>
</template>
