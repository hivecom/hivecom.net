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
}>()

ChartJS.register(
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  barGapPlugin,
)

const { metricsHistory, loadingHistory, fetchMetricsHistory, fetchMetricsWindow, scheduleRefresh } = useDataMetrics()

async function loadData() {
  if (props.window !== null) {
    await fetchMetricsWindow(props.window.start, props.window.end)
  }
  else {
    await fetchMetricsHistory(props.period)
    scheduleRefresh(props.period)
  }
}

onMounted(() => loadData())
watch(() => [props.period, props.window] as const, () => loadData())

const chartWrapperRef = ref<HTMLElement | null>(null)
const chartRef = ref<ChartComponentRef<'bar'> | null>(null)
const { width: chartWrapperWidth } = useElementSize(chartWrapperRef, { width: 0, height: 0 })
const { activeTheme } = useUserTheme()

const seriesOptions: SeriesOption[] = [
  { label: 'All', value: 'both' },
  { label: 'Discussions', value: 'total' },
  { label: 'Replies', value: 'replies' },
]

const DEFAULT_SERIES: SeriesOption = { label: 'All', value: 'both' }
const selectedSeriesArr = ref<SeriesOption[]>([DEFAULT_SERIES])
const activeSeries = computed<SeriesOption>(() => selectedSeriesArr.value[0] ?? DEFAULT_SERIES)

const chartData = computed(() => {
  void theme.value
  void activeTheme.value

  if (!metricsHistory.value.length)
    return { datasets: [] }

  const palette = getChartPalette()
  const show = activeSeries.value.value

  const datasets: ChartDataset<'bar'>[] = []

  if (show === 'total' || show === 'both') {
    datasets.push({
      label: 'Discussions',
      data: metricsHistory.value.map(e => ({
        x: new Date(e.capturedAt).getTime(),
        y: e.discussionsTotal,
      })),
      backgroundColor: `${palette.datasets[0]}cc`,
      clip: false as const,
      stack: 'discussions',
    } as unknown as ChartDataset<'bar'>)
  }

  if (show === 'replies' || show === 'both') {
    datasets.push({
      label: 'Replies',
      data: metricsHistory.value.map(e => ({
        x: new Date(e.capturedAt).getTime(),
        y: e.discussionsReplies,
      })),
      backgroundColor: `${palette.datasets[1]}cc`,
      clip: false as const,
      stack: 'discussions',
    } as unknown as ChartDataset<'bar'>)
  }

  return { datasets }
})

const localChartOptions: ChartOptions<'bar'> = {
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
      stacked: true,
    },
    x: {
      stacked: true,
    },
  },
}

const chartOptions = ref<ChartOptions<'bar'>>(import.meta.client ? deepMergePlainObjects(getBarChartDefaults(props.utc), localChartOptions) : {})

function refreshChartOptions() {
  nextTick(() => {
    chartOptions.value = deepMergePlainObjects(getBarChartDefaults(props.utc), localChartOptions)
  })
}

onMounted(() => refreshChartOptions())
watch(theme, () => refreshChartOptions())
watch(() => props.utc, () => refreshChartOptions())

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
  <div class="chart-container">
    <Flex x-between y-center class="text-m text-bold-row">
      <Flex y-center gap="s">
        <span class="text-m text-bold">Discussions</span>
      </Flex>
      <Select
        v-model="selectedSeriesArr"
        :options="seriesOptions"
        :single="true"
        placeholder="Both"
      />
    </Flex>

    <div v-if="loadingHistory" class="chart-loading">
      <div class="chart-skeleton">
        <div class="chart-area-skeleton">
          <div class="y-axis-skeleton">
            <Skeleton v-for="i in 6" :key="i" :width="40" :height="12" :radius="2" />
          </div>
          <div class="chart-lines-skeleton">
            <Skeleton :height="280" :radius="8" style="opacity: 0.3;" />
          </div>
        </div>

        <div class="x-axis-skeleton">
          <Skeleton v-for="i in 6" :key="i" :width="60" :height="12" :radius="2" />
        </div>
      </div>
    </div>

    <div v-else-if="!metricsHistory.length" class="chart-empty">
      <p>No discussion data available</p>
    </div>

    <div
      v-else
      ref="chartWrapperRef"
      :key="`${theme}-${activeTheme?.id}-${props.utc}-${activeSeries.value}`"
      class="chart-wrapper"
    >
      <Bar
        ref="chartRef"
        :data="chartData"
        :options="chartOptions"
      />
    </div>
  </div>
</template>
