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
import OnlineBadge from '@/components/Shared/OnlineBadge.vue'
import { useDataMetrics } from '@/composables/useDataMetrics'
import { useUserTheme } from '@/composables/useUserTheme'
import { barGapPlugin, getBarChartDefaults, getChartPalette } from '@/lib/charts'
import { deepMergePlainObjects } from '@/lib/utils/common'

interface ServerOption {
  label: string
  value: string
}

const props = defineProps<{
  period: MetricsPeriod
  window: { start: Date, end: Date } | null
  utc?: boolean
  serverName?: string
  color?: string
  compact?: boolean
  hideTitle?: boolean
  showYAxis?: boolean
  showXAxis?: boolean
}>()

ChartJS.register(
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  barGapPlugin,
)

const { metrics, fetchMetrics, metricsHistory, loadingHistory, fetchMetricsHistory, fetchMetricsWindow, scheduleRefresh } = useDataMetrics()

async function loadData() {
  if (props.window !== null) {
    await fetchMetricsWindow(props.window.start, props.window.end)
  }
  else {
    await fetchMetricsHistory(props.period)
    scheduleRefresh(props.period)
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

const serverListKey = computed(() => {
  const keys = metricsHistory.value
    .flatMap(e => e.teamspeakByServer ? Object.keys(e.teamspeakByServer) : [])
    .filter((v, i, a) => a.indexOf(v) === i)
    .sort()
  return keys.join(',')
})

const currentCount = computed(() => {
  if (props.serverName !== undefined) {
    return [...metricsHistory.value].reverse().find(e => e.teamspeakByServer?.[props.serverName!] !== undefined)?.teamspeakByServer?.[props.serverName!]
  }
  return metrics.value?.teamspeak.online
    ?? [...metricsHistory.value].reverse().find(e => e.teamspeakOnline !== null)?.teamspeakOnline
})

const serverOptions = computed<ServerOption[]>(() => {
  const names = new Set<string>()
  metricsHistory.value.forEach((e) => {
    if (e.teamspeakByServer)
      Object.keys(e.teamspeakByServer).forEach(k => names.add(k))
  })
  return [...names].sort().map(n => ({ label: n.toUpperCase(), value: n }))
})

const _selectedServerOptions = ref<ServerOption[] | undefined>([])
const selectedServerOptions = computed({
  get: () => _selectedServerOptions.value ?? [],
  set: (v) => { _selectedServerOptions.value = v ?? [] },
})
const selectedServerNames = computed(() =>
  selectedServerOptions.value.length > 0
    ? new Set(selectedServerOptions.value.map(o => o.value))
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

  // Single-server mode
  if (props.serverName !== undefined) {
    const hasPerServerData = metricsHistory.value.some(e => e.teamspeakByServer?.[props.serverName!] != null)
    return {
      datasets: [{
        label: props.serverName.toUpperCase(),
        data: metricsHistory.value.map(e => ({
          x: new Date(e.capturedAt).getTime(),
          y: hasPerServerData
            ? (e.teamspeakByServer?.[props.serverName!] ?? null)
            : e.teamspeakOnline,
        })),
        backgroundColor: `${props.color ?? palette.datasets[0]}cc`,
        clip: false,
        stack: 'ts',
      }] as unknown as ChartDataset<'bar'>[],
    }
  }

  const isFiltered = selectedServerNames.value !== null
  const names = isFiltered
    ? [...selectedServerNames.value!]
    : [...new Set(metricsHistory.value.flatMap(e => e.teamspeakByServer ? Object.keys(e.teamspeakByServer) : []))].sort()

  if (names.length === 0) {
    return {
      datasets: [{
        label: 'TeamSpeak Online',
        data: metricsHistory.value.map(e => ({ x: new Date(e.capturedAt).getTime(), y: e.teamspeakOnline })),
        backgroundColor: `${props.color ?? palette.datasets[0]}cc`,
        clip: false,
        stack: 'ts',
      }] as unknown as ChartDataset<'bar'>[],
    }
  }

  return {
    datasets: names.map((name, i) => ({
      label: name.toUpperCase(),
      data: metricsHistory.value.map(e => ({
        x: new Date(e.capturedAt).getTime(),
        y: e.teamspeakByServer?.[name] ?? null,
      })),
      backgroundColor: isFiltered
        ? `${props.color ?? palette.datasets[i % palette.datasets.length]}${alphas[i % alphas.length]}`
        : `${props.color ?? palette.datasets[0]}cc`,
      clip: false,
      stack: 'ts',
    })) as unknown as ChartDataset<'bar'>[],
  }
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
  datasets: {
    bar: {
      barPercentage: 1.0,
      categoryPercentage: 0.7,
    },
  },
  scales: {
    y: {
      beginAtZero: true,
      suggestedMax: 10,
      stacked: true,
      ticks: { stepSize: 1 },
    },
    x: {
      stacked: true,
    },
  },
}

const chartOptions = ref<ChartOptions<'bar'>>(import.meta.client ? deepMergePlainObjects(getBarChartDefaults(props.utc), localChartOptions) : {})

function refreshChartOptions() {
  nextTick(() => {
    const windowScale: ChartOptions<'bar'> = props.window
      ? { scales: { x: { min: props.window.start.getTime(), max: props.window.end.getTime() } } }
      : {}
    const compactOverride: ChartOptions<'bar'> = props.compact
      ? { scales: { x: { ticks: { display: props.showXAxis ?? false } }, y: { ticks: { display: props.showYAxis } } } }
      : {}
    chartOptions.value = deepMergePlainObjects(getBarChartDefaults(props.utc), localChartOptions, windowScale, compactOverride)
  })
}

onMounted(() => refreshChartOptions())
watch(theme, () => refreshChartOptions())
watch(() => props.utc, () => refreshChartOptions())
watch(() => props.window, () => refreshChartOptions())

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
      <span>TeamSpeak Online</span>
      <OnlineBadge :count="currentCount ?? null" label="online" singular="online" size="s" color="var(--color-text-blue)" />
    </Flex>
    <Flex v-if="!compact && !hideTitle" x-between y-center class="text-m text-bold-row">
      <Flex gap="s" y-center>
        <span class="text-m text-bold">TeamSpeak Online</span>
        <OnlineBadge :count="currentCount ?? null" label="online" singular="online" size="s" :color="props.color ?? 'var(--color-text-blue)'" />
      </Flex>
      <Select
        v-if="serverName === undefined"
        v-model="selectedServerOptions"
        :options="serverOptions"
        placeholder="All Servers"
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
      <p>No TeamSpeak activity data available</p>
    </div>

    <div
      v-else
      ref="chartWrapperRef"
      :key="`${theme}-${activeTheme?.id}-${props.utc}-${serverListKey}-${selectedServerOptions.length}-${props.serverName}-${props.window?.start.getTime()}-${props.window?.end.getTime()}`"
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
