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
import { useDataMetrics } from '@/composables/useDataMetrics'
import { useUserTheme } from '@/composables/useUserTheme'
import { barGapPlugin, getBarChartDefaults, getChartPalette } from '@/lib/charts'
import { deepMergePlainObjects } from '@/lib/utils/common'

interface SeriesOption {
  label: string
  value: 'total' | 'replies' | 'both'
}

const props = defineProps<{
  period: MetricsPeriod
  window: { start: Date, end: Date } | null
  utc?: boolean
  compact?: boolean
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

const { metricsHistory, loadingHistory, fetchMetricsHistory, fetchMetricsWindow, scheduleRefresh } = useDataMetrics()

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
}

onMounted(() => loadData())
watch(() => [props.period, props.window] as const, () => loadData())

const chartWrapperRef = ref<HTMLElement | null>(null)
const chartRef = ref<ChartComponentRef<'bar'> | null>(null)
const { width: chartWrapperWidth } = useElementSize(chartWrapperRef, { width: 0, height: 0 })
const { activeTheme } = useUserTheme()

const seriesOptions: SeriesOption[] = [
  { label: 'Discussions + Replies', value: 'both' },
  { label: 'Discussions', value: 'total' },
  { label: 'Replies', value: 'replies' },
]

const DEFAULT_SERIES: SeriesOption = { label: 'Discussions + Replies', value: 'both' }
const selectedSeriesArr = ref<SeriesOption[]>([DEFAULT_SERIES])
const activeSeries = computed<SeriesOption>(() => selectedSeriesArr.value[0] ?? DEFAULT_SERIES)

const chartData = computed(() => {
  void theme.value
  void activeTheme.value

  if (!metricsHistory.value.length)
    return { datasets: [] }

  const palette = getChartPalette()
  const show = activeSeries.value.value
  const timestamps = metricsHistory.value.map(e => new Date(e.capturedAt).getTime())

  // Both series are per-interval rates, so they draw as lines on the bar
  // host, which keeps the time axis and gap shading shared with the other
  // metric charts.
  function line(label: string, color: string, values: (number | null)[]): ChartDataset<'bar'> {
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
      clip: false,
    } as unknown as ChartDataset<'bar'>
  }

  const datasets: ChartDataset<'bar'>[] = []

  if (show === 'total' || show === 'both')
    datasets.push(line('Discussions', palette.datasets[0] ?? '', metricsHistory.value.map(e => e.discussionsNewTotal)))

  if (show === 'replies' || show === 'both')
    datasets.push(line('Replies', palette.datasets[1] ?? '', metricsHistory.value.map(e => e.discussionsNewReplies)))

  return { datasets }
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
  scales: {
    y: {
      beginAtZero: true,
      suggestedMax: 10,
      ticks: { precision: 0 },
    },
  },
}))

const chartOptions = ref<ChartOptions<'bar'>>(import.meta.client ? deepMergePlainObjects(getBarChartDefaults(props.utc), localChartOptions.value) : {})

function refreshChartOptions() {
  nextTick(() => {
    const compactOverride: ChartOptions<'bar'> = props.compact
      ? { scales: { x: { ticks: { display: props.showXAxis ?? false } }, y: { ticks: { display: props.showYAxis } } } }
      : {}
    chartOptions.value = deepMergePlainObjects(getBarChartDefaults(props.utc), localChartOptions.value, compactOverride)
  })
}

onMounted(() => refreshChartOptions())
watch(theme, () => refreshChartOptions())
watch(() => props.utc, () => refreshChartOptions())

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

watchEffect(() => {
  const width = chartWrapperWidth.value
  const chart = chartRef.value?.chart

  if (!width || !chart)
    return

  const containerHeight = chartWrapperRef.value?.clientHeight
  chart.resize(Math.floor(width), containerHeight)
})
</script>

<template>
  <div class="chart-container" :class="{ 'chart-container--compact': compact }">
    <Flex v-if="compact" x-between y-center class="chart-compact-title">
      <span>New Discussions</span>
    </Flex>
    <Flex v-if="!compact" x-between y-center class="text-m text-bold-row">
      <Flex y-center gap="s">
        <span class="text-m text-bold">New Discussions</span>
      </Flex>
      <Select
        v-model="selectedSeriesArr"
        :options="seriesOptions"
        :single="true"
        placeholder="Discussions + Replies"
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
      <p>No discussion data available</p>
    </div>

    <div
      v-else
      ref="chartWrapperRef"
      :key="`${theme}-${activeTheme?.id}-${props.utc}-${activeSeries.value}`"
      class="chart-wrapper"
      :class="{
        'chart-wrapper--compact': compact && !showXAxis,
        'chart-wrapper--compact-xaxis': compact && showXAxis,
      }"
    >
      <Bar
        ref="chartRef"
        :data="chartData"
        :options="chartOptions"
      />
    </div>
  </div>
</template>
