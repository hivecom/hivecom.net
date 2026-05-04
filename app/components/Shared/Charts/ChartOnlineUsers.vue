<script setup lang="ts">
import type { ChartDataset, ChartOptions } from 'chart.js'
import type { ChartComponentRef } from 'vue-chartjs'
import type { MetricsPeriod } from '@/composables/useDataMetrics'
import { Flex, Skeleton, theme } from '@dolanske/vui'
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

const props = defineProps<{
  period: MetricsPeriod
  window: { start: Date, end: Date } | null
  utc?: boolean
  fresh?: boolean
}>()

ChartJS.register(
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  barGapPlugin,
)

const { metrics, latestMetrics, fetchLatestMetrics, metricsHistory, loadingHistory, fetchMetricsHistory, fetchMetricsWindow, scheduleRefresh } = useDataMetrics()

async function loadData() {
  if (props.window !== null) {
    await fetchMetricsWindow(props.window.start, props.window.end)
  }
  else {
    await fetchMetricsHistory(props.period)
    scheduleRefresh(props.period)
  }
}

onMounted(() => {
  loadData()
  if (props.fresh)
    fetchLatestMetrics()
})
watch(() => [props.period, props.window] as const, () => loadData())

const currentCount = computed(() =>
  props.fresh ? latestMetrics.value?.members.online : metrics.value?.members.online,
)

const chartWrapperRef = ref<HTMLElement | null>(null)
const chartRef = ref<ChartComponentRef<'bar'> | null>(null)
const { width: chartWrapperWidth } = useElementSize(chartWrapperRef, { width: 0, height: 0 })
const { activeTheme } = useUserTheme()

const chartData = computed(() => {
  void theme.value
  void activeTheme.value

  if (!metricsHistory.value.length) {
    return { datasets: [] }
  }

  const palette = getChartPalette()
  const rawData = metricsHistory.value.map(e => ({
    x: new Date(e.capturedAt).getTime(),
    y: e.membersOnline,
  }))

  return {
    datasets: [
      {
        label: 'Users Online',
        data: rawData,
        backgroundColor: `${palette.datasets[1]}cc`,
        clip: false as const,
      },
    ] as unknown as ChartDataset<'bar'>[],
  }
})

const localChartOptions: ChartOptions<'bar'> = {
  plugins: {
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
      <Flex x-between y-center>
        <span class="text-m text-bold">Users Online</span>
        <span v-if="currentCount !== undefined" class="text-xs text-color-lightest">({{ currentCount }} online now)</span>
      </Flex>
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
      <p>No member activity data available</p>
    </div>

    <div v-else ref="chartWrapperRef" :key="`${theme}-${activeTheme?.id}-${props.utc}`" class="chart-wrapper">
      <Bar
        ref="chartRef"
        :data="chartData"
        :options="chartOptions"
      />
    </div>
  </div>
</template>
