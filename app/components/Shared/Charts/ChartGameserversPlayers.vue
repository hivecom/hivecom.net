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
import { useDataGameservers } from '@/composables/useDataGameservers'
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
const { gameservers } = useDataGameservers()

// Map numeric string ID -> display name
const serverNameMap = computed(() => {
  const map = new Map<string, string>()
  for (const gs of gameservers.value)
    map.set(String(gs.id), gs.name)
  return map
})

function serverLabel(id: string): string {
  return serverNameMap.value.get(id) ?? id
}

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

onMounted(() => loadData())
watch(() => [props.period, props.window] as const, () => loadData())

const chartWrapperRef = ref<HTMLElement | null>(null)
const chartRef = ref<ChartComponentRef<'bar'> | null>(null)
const { width: chartWrapperWidth } = useElementSize(chartWrapperRef, { width: 0, height: 0 })
const { activeTheme } = useUserTheme()

const currentCount = computed(() =>
  metrics.value?.gameservers.players
  ?? [...metricsHistory.value].reverse().find(e => e.gameserversPlayers !== null)?.gameserversPlayers,
)

// Server filter - VUI Select options
const serverOptions = computed<ServerOption[]>(() => {
  const ids = new Set<string>()
  for (const e of metricsHistory.value) {
    if (e.gameserversByServer)
      Object.keys(e.gameserversByServer).forEach(k => ids.add(k))
  }
  return [...ids]
    .sort((a, b) => serverLabel(a).localeCompare(serverLabel(b)))
    .map(id => ({ label: serverLabel(id), value: id }))
})

// null = show all servers stacked; non-empty = filter to selection
const _selectedServerOptions = ref<ServerOption[] | undefined>([])
const selectedServerOptions = computed({
  get: () => _selectedServerOptions.value ?? [],
  set: (v) => { _selectedServerOptions.value = v ?? [] },
})
const selectedServerIds = computed(() =>
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

  // Determine which server IDs to show
  const ids = selectedServerIds.value
    ? [...selectedServerIds.value]
    : serverOptions.value.map(o => o.value)

  const isFiltered = selectedServerIds.value !== null

  // Fall back to total if no per-server data available yet
  if (ids.length === 0) {
    return {
      datasets: [{
        label: 'Players Online',
        data: metricsHistory.value.map(e => ({
          x: new Date(e.capturedAt).getTime(),
          y: e.gameserversPlayers,
        })),
        backgroundColor: `${palette.datasets[3]}cc`,
        clip: false as const,
        stack: 'gs',
      }] as unknown as ChartDataset<'bar'>[],
    }
  }

  return {
    datasets: ids.map((id, i) => ({
      label: serverLabel(id),
      data: metricsHistory.value.map(e => ({
        x: new Date(e.capturedAt).getTime(),
        y: e.gameserversByServer?.[id] ?? null,
      })),
      backgroundColor: isFiltered
        ? `${palette.datasets[i % palette.datasets.length]}cc`
        : `${palette.datasets[3]}cc`,
      clip: false,
      stack: 'gs',
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
          if (raw === null || raw === undefined || raw.y === null || raw.y === 0)
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
      <Flex x-center y-baseline>
        <span class="text-m text-bold">Game Server Players</span>
        <span v-if="currentCount !== undefined" class="text-xs text-color-lightest">({{ currentCount }} online now)</span>
      </Flex>
      <Select
        v-model="selectedServerOptions"
        :options="serverOptions"
        placeholder="All Servers"
        show-clear
        search
        :single="false"
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
      <p>No gameserver activity data available</p>
    </div>

    <div
      v-else
      ref="chartWrapperRef"
      :key="`${theme}-${activeTheme?.id}-${props.utc}-${selectedServerOptions.length}`"
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
