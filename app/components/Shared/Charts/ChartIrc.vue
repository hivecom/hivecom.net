<script setup lang="ts">
import type { ChartDataset, ChartOptions } from 'chart.js'
import type { ChartComponentRef } from 'vue-chartjs'
import type { MetricsPeriod } from '@/composables/useDataMetrics'

import { Flex, Select, Skeleton, theme } from '@dolanske/vui'
import { useElementSize } from '@vueuse/core'
import {
  BarElement,
  Chart as ChartJS,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Title,
  Tooltip,
} from 'chart.js'
import { computed, nextTick, onMounted, ref, watch, watchEffect } from 'vue'
import { Bar } from 'vue-chartjs'
import OnlineBadge from '@/components/Shared/OnlineBadge.vue'
import { useDataMetrics } from '@/composables/useDataMetrics'
import { useUserTheme } from '@/composables/useUserTheme'
import { barGapPlugin, getBarChartDefaults, getChartPalette } from '@/lib/charts'
import { deepMergePlainObjects } from '@/lib/utils/common'

interface ChannelOption {
  label: string
  value: string
}

const props = defineProps<{
  period: MetricsPeriod
  window: { start: Date, end: Date } | null
  utc?: boolean
  compact?: boolean
  hideTitle?: boolean
  showYAxis?: boolean
  showXAxis?: boolean
}>()

ChartJS.register(
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Title,
  Tooltip,
  Legend,
  barGapPlugin,
)

const { metrics, fetchMetrics, metricsHistory, loadingHistory, fetchMetricsHistory, fetchMetricsWindow, scheduleRefresh } = useDataMetrics()

// Releasing our own subscription on switch and teardown keeps this chart's
// unmount from cancelling a refresh another consumer still depends on.
let stopRefresh: (() => void) | null = null
// Guards against a superseded load re-subscribing after a faster later one.
let loadToken = 0

async function loadData() {
  const token = ++loadToken
  stopRefresh?.()
  stopRefresh = null

  if (props.window !== null) {
    await fetchMetricsWindow(props.window.start, props.window.end)
  }
  else {
    await fetchMetricsHistory(props.period)
    if (token === loadToken)
      stopRefresh = scheduleRefresh(props.period)
  }
  if (metrics.value === null)
    fetchMetrics()
}

onMounted(() => {
  // If a window will be provided via brush, don't pre-fetch with null window
  // to avoid a race condition where the period fetch overwrites the window fetch.
  // compact = no brush, so load immediately.
  if (props.window !== null || props.compact)
    loadData()
})
watch(() => [props.period, props.window] as const, () => loadData())

const chartWrapperRef = ref<HTMLElement | null>(null)
const chartRef = ref<ChartComponentRef<'bar'> | null>(null)
const { width: chartWrapperWidth } = useElementSize(chartWrapperRef, { width: 0, height: 0 })
const { activeTheme } = useUserTheme()

const channelListKey = computed(() => {
  const keys = metricsHistory.value
    .flatMap(e => e.ircByChannel ? Object.keys(e.ircByChannel) : [])
    .filter((v, i, a) => a.indexOf(v) === i)
    .sort()
  return keys.join(',')
})

const currentCount = computed(() => {
  return metrics.value?.irc.online
    ?? [...metricsHistory.value].reverse().find(e => e.ircOnline !== null)?.ircOnline
})

const channelOptions = computed<ChannelOption[]>(() => {
  const names = new Set<string>()
  metricsHistory.value.forEach((e) => {
    if (e.ircByChannel)
      Object.keys(e.ircByChannel).forEach(k => names.add(k))
  })
  return [...names].sort().map(n => ({ label: n, value: n }))
})

const _selectedChannelOptions = ref<ChannelOption[] | undefined>([])
const selectedChannelOptions = computed({
  get: () => _selectedChannelOptions.value ?? [],
  set: (v) => { _selectedChannelOptions.value = v ?? [] },
})
const selectedChannelNames = computed(() =>
  selectedChannelOptions.value.length > 0
    ? new Set(selectedChannelOptions.value.map(o => o.value))
    : null,
)

const chartData = computed(() => {
  void theme.value
  void activeTheme.value

  if (!metricsHistory.value.length) {
    return { datasets: [] }
  }

  const palette = getChartPalette()
  const alphas = ['ff', 'bf', '8c', '61']
  // Online users are bars in green, messages a line in red on its own axis,
  // since a concurrent count and a per-interval rate live on different scales.
  const [, onlineColor = '', messagesColor = ''] = palette.datasets

  const timestamps = metricsHistory.value.map(e => new Date(e.capturedAt).getTime())

  function messageLine(label: string, color: string, values: (number | null)[]): ChartDataset<'bar'> {
    return {
      type: 'line',
      label,
      data: values.map((y, i) => ({ x: timestamps[i], y })),
      borderColor: color,
      backgroundColor: color,
      borderWidth: 2,
      pointRadius: 0,
      pointHitRadius: 8,
      tension: 0.3,
      spanGaps: false,
      yAxisID: 'y1',
      clip: false,
      order: 0,
    } as unknown as ChartDataset<'bar'>
  }

  function onlineBars(label: string, color: string, values: (number | null)[]): ChartDataset<'bar'> {
    return {
      label,
      data: values.map((y, i) => ({ x: timestamps[i], y })),
      backgroundColor: color,
      clip: false,
      stack: 'irc',
      order: 1,
    } as unknown as ChartDataset<'bar'>
  }

  const isFiltered = selectedChannelNames.value !== null
  const names = isFiltered
    ? [...selectedChannelNames.value!]
    : []

  // Channel counts overlap (a user can sit in several channels), so the
  // unfiltered view plots the network totals instead of stacking channels.
  if (!isFiltered || names.length === 0) {
    return {
      datasets: [
        onlineBars('Online', `${onlineColor}cc`, metricsHistory.value.map(e => e.ircOnline)),
        messageLine('Messages', messagesColor, metricsHistory.value.map(e => e.ircMessages)),
      ],
    }
  }

  const bars = names.map((name, i) => onlineBars(
    `${name} online`,
    `${onlineColor}${alphas[i % alphas.length]}`,
    metricsHistory.value.map(e => e.ircByChannel?.[name] ?? null),
  ))
  const lines = names.map((name, i) => messageLine(
    `${name} messages`,
    `${messagesColor}${alphas[i % alphas.length]}`,
    metricsHistory.value.map(e => e.ircMessagesByChannel?.[name] ?? null),
  ))
  return { datasets: [...bars, ...lines] }
})

const computedBarThickness = computed(() => {
  const count = metricsHistory.value.length
  const width = chartWrapperWidth.value
  if (!count || !width)
    return undefined
  const raw = (width / count) * 0.7
  return Math.max(1, Math.floor(raw))
})

const localChartOptions = computed<ChartOptions<'bar'>>(() => ({
  plugins: {
    legend: { display: false },
    tooltip: {
      mode: 'index',
      intersect: false,
      callbacks: {
        label: (item) => {
          const raw = item.raw as { y: number | null } | null | undefined
          if (raw === null || raw === undefined || raw.y === null)
            return ''
          return `${item.dataset.label}: ${item.parsed.y}`
        },
        afterBody(items: import('chart.js').TooltipItem<'bar'>[]) {
          const allNull = items.every((i) => {
            const raw = i.raw as { y: number | null } | null | undefined
            return raw === null || raw === undefined || raw.y === null
          })
          return allNull ? 'No data was collected for this period - collection may not have started yet or encountered an error.' : ''
        },
      },
    },
  },
  datasets: {
    bar: {
      barThickness: computedBarThickness.value,
    },
  },
  scales: {
    y: {
      beginAtZero: true,
      suggestedMax: 10,
      stacked: true,
      ticks: { stepSize: 1 },
    },
    y1: {
      type: 'linear',
      position: 'right',
      beginAtZero: true,
      suggestedMax: 10,
      grid: { drawOnChartArea: false },
      ticks: { color: getChartPalette().textLighter, precision: 0 },
    },
    x: {
      stacked: true,
    },
  },
}))

const chartOptions = ref<ChartOptions<'bar'>>(import.meta.client ? deepMergePlainObjects(getBarChartDefaults(props.utc), localChartOptions.value) : {})

function refreshChartOptions() {
  nextTick(() => {
    const windowScale: ChartOptions<'bar'> = props.window
      ? { scales: { x: { min: props.window.start.getTime(), max: props.window.end.getTime() } } }
      : {}
    const compactOverride: ChartOptions<'bar'> = props.compact
      ? { scales: { x: { ticks: { display: props.showXAxis ?? false } }, y: { ticks: { display: props.showYAxis } }, y1: { ticks: { display: props.showYAxis } } } }
      : {}
    chartOptions.value = deepMergePlainObjects(getBarChartDefaults(props.utc), localChartOptions.value, windowScale, compactOverride)
  })
}

onMounted(() => refreshChartOptions())
watch(theme, () => refreshChartOptions())
watch(() => props.utc, () => refreshChartOptions())
watch(() => props.window, () => refreshChartOptions())
watch(computedBarThickness, () => refreshChartOptions())

watchEffect(() => {
  const width = chartWrapperWidth.value
  const chart = chartRef.value?.chart

  if (!width || !chart)
    return

  const containerHeight = chartWrapperRef.value?.clientHeight
  chart.resize(Math.floor(width), containerHeight)
})

// Force resize after data loads - computeMinSampleSize (bar width) is calculated
// during the first render and may use stale scale dimensions if data arrives
// after the initial layout pass. Resizing in the next tick after data changes
// ensures bars are sized correctly.
watch(chartData, () => {
  nextTick(() => {
    const width = chartWrapperRef.value?.clientWidth
    const chart = chartRef.value?.chart
    if (!width || !chart)
      return
    const containerHeight = chartWrapperRef.value?.clientHeight
    chart.resize(Math.floor(width), containerHeight)
  })
})
</script>

<template>
  <div class="chart-container" :class="{ 'chart-container--compact': compact }">
    <Flex v-if="compact" x-between y-center class="chart-compact-title">
      <span>IRC</span>
      <OnlineBadge :count="currentCount ?? null" label="online" singular="online" size="s" color="var(--color-text-green)" />
    </Flex>
    <Flex v-if="!compact && !hideTitle" x-between y-center class="text-m text-bold-row">
      <Flex gap="s" y-center>
        <span class="text-m text-bold">IRC</span>
        <OnlineBadge :count="currentCount ?? null" label="online" singular="online" size="s" color="var(--color-text-green)" />
      </Flex>
      <Select
        v-model="selectedChannelOptions"
        :options="channelOptions"
        placeholder="All Channels"
        show-clear
        search
        :single="false"
      />
    </Flex>

    <div v-if="loadingHistory" class="chart-loading" :class="{ 'chart-loading--compact': compact }">
      <div class="chart-skeleton">
        <div class="chart-area-skeleton">
          <div v-if="!compact" class="y-axis-skeleton">
            <Skeleton v-for="i in 6" :key="i" :width="40" :height="12" :radius="2" />
          </div>
          <div class="chart-lines-skeleton" :class="{ 'chart-lines-skeleton--compact': compact }">
            <Skeleton :height="compact ? 60 : 280" :radius="8" style="opacity: 0.3;" />
          </div>
        </div>

        <div v-if="!compact" class="x-axis-skeleton">
          <Skeleton v-for="i in 6" :key="i" :width="60" :height="12" :radius="2" />
        </div>
      </div>
    </div>

    <div v-else-if="!metricsHistory.length && !compact" class="chart-empty">
      <p>No IRC activity data available</p>
    </div>

    <div
      v-else
      ref="chartWrapperRef"
      :key="`${theme}-${activeTheme?.id}-${props.utc}-${channelListKey}-${selectedChannelOptions.length}-${props.window?.start.getTime()}-${props.window?.end.getTime()}`"
      class="chart-wrapper"
      :class="{ 'chart-wrapper--compact': compact }"
    >
      <Bar
        ref="chartRef"
        :data="chartData"
        :options="chartOptions"
      />
    </div>
  </div>
</template>
