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
  serverId?: number
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
const { gameservers } = useDataGameservers()

// Map numeric string ID -> display name
const serverNameMap = computed(() => {
  const map = new Map<string, string>()
  for (const gs of gameservers.value)
    map.set(String(gs.id), gs.name)
  return map
})

// Set of server IDs that have query capabilities (non-null query_protocol)
const queryableServerIds = computed(() => {
  const set = new Set<string>()
  for (const gs of gameservers.value) {
    if (gs.query_protocol != null)
      set.add(String(gs.id))
  }
  return set
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

const currentCount = computed(() => {
  if (props.serverId !== undefined) {
    const detail = metrics.value?.gameservers.byServer[String(props.serverId)]
    const liveCount = detail?.protocol === 'minecraft' ? detail.data?.numPlayers : detail?.data?.players
    return liveCount
      ?? [...metricsHistory.value].reverse().find(e => e.gameserversByServer?.[String(props.serverId!)] !== undefined)?.gameserversByServer?.[String(props.serverId!)]
      ?? undefined
  }
  return metrics.value?.gameservers.players
    ?? [...metricsHistory.value].reverse().find(e => e.gameserversPlayers !== null)?.gameserversPlayers
})

// Server filter - VUI Select options (only servers with query capabilities)
const serverOptions = computed<ServerOption[]>(() => {
  const ids = new Set<string>()
  for (const e of metricsHistory.value) {
    if (e.gameserversByServer)
      Object.keys(e.gameserversByServer).forEach(k => ids.add(k))
  }
  return [...ids]
    .filter(id => queryableServerIds.value.has(id))
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
        backgroundColor: `${props.color ?? palette.datasets[3]}cc`,
        clip: false as const,
        stack: 'gs',
      }] as unknown as ChartDataset<'bar'>[],
    }
  }

  // Single-server mode: render only that server's data
  if (props.serverId !== undefined) {
    const id = String(props.serverId)
    return {
      datasets: [{
        label: serverLabel(id),
        data: metricsHistory.value.map(e => ({
          x: new Date(e.capturedAt).getTime(),
          y: e.gameserversByServer?.[id] ?? null,
        })),
        backgroundColor: `${props.color ?? palette.datasets[3]}cc`,
        clip: false,
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
        : `${props.color ?? palette.datasets[3]}cc`,
      clip: false,
      stack: 'gs',
    })) as unknown as ChartDataset<'bar'>[],
  }
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
  datasets: {
    bar: {
      barThickness: computedBarThickness.value,
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
      ? { scales: { x: { ticks: { display: props.showXAxis ?? false } }, y: { ticks: { display: props.showYAxis } } } }
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
      <span>Game Server Players</span>
      <OnlineBadge :count="currentCount ?? null" label="players" singular="player" size="s" color="var(--color-text-yellow)" />
    </Flex>
    <Flex v-if="!compact && !hideTitle" x-between y-center class="text-m text-bold-row">
      <Flex gap="s" y-center>
        <span class="text-m text-bold">Game Server Players</span>
        <OnlineBadge :count="currentCount ?? null" label="players" singular="player" size="s" :color="props.color ?? 'var(--color-text-yellow)'" />
      </Flex>
      <Select
        v-if="serverId === undefined"
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
      <p>No gameserver activity data available</p>
    </div>

    <div
      v-else
      ref="chartWrapperRef"
      :key="`${theme}-${activeTheme?.id}-${props.utc}-${selectedServerOptions.length}-${props.serverId}-${props.window?.start.getTime()}-${props.window?.end.getTime()}`"
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
