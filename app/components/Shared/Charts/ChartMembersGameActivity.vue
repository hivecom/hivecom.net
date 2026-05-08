<script setup lang="ts">
import type { ChartDataset, ChartOptions } from 'chart.js'
import type { ChartComponentRef } from 'vue-chartjs'
import type { MetricsHistoryEntry, MetricsPeriod } from '@/composables/useDataMetrics'
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
import { useDataGames } from '@/composables/useDataGames'
import { useDataMetrics } from '@/composables/useDataMetrics'
import { useUserTheme } from '@/composables/useUserTheme'
import { getBarChartDefaults, getChartPalette, getColorizedPalette } from '@/lib/charts'
import { deepMergePlainObjects } from '@/lib/utils/common'

interface GameOption {
  label: string
  value: string
}

const props = defineProps<{
  period: MetricsPeriod
  window: { start: Date, end: Date } | null
  utc?: boolean
  gameId?: number
  steamGameId?: number
  color?: string
  compact?: boolean
  hideTitle?: boolean
  showYAxis?: boolean
  colorize?: boolean
}>()

ChartJS.register(
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
)

const { metrics, fetchMetrics, metricsHistory, loadingHistory, fetchMetricsHistory, fetchMetricsWindow, scheduleRefresh } = useDataMetrics()
const { games } = useDataGames()

// Map numeric string ID -> display name
const gameNameMap = computed(() => {
  const map = new Map<string, string>()
  for (const game of games.value)
    map.set(String(game.id), game.name ?? String(game.id))
  return map
})

function gameLabel(id: string): string {
  return gameNameMap.value.get(id) ?? id
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
  loadData()
})
watch(() => [props.period, props.window] as const, () => loadData())

const chartWrapperRef = ref<HTMLElement | null>(null)
const chartRef = ref<ChartComponentRef<'bar'> | null>(null)
const { width: chartWrapperWidth } = useElementSize(chartWrapperRef, { width: 0, height: 0 })
const { activeTheme } = useUserTheme()

const currentCount = computed(() => {
  if (props.steamGameId !== undefined) {
    const bySteam = metrics.value?.members.bySteamGame
    if (bySteam !== undefined)
      return bySteam[String(props.steamGameId)] ?? 0
    return [...metricsHistory.value].reverse().find(e => e.membersBySteamGame?.[String(props.steamGameId!)] !== undefined)?.membersBySteamGame?.[String(props.steamGameId!)]
      ?? undefined
  }
  if (props.gameId !== undefined) {
    const byGame = metrics.value?.members.byGame
    if (byGame !== undefined)
      return byGame[String(props.gameId)] ?? 0
    return [...metricsHistory.value].reverse().find(e => e.membersByGame?.[String(props.gameId!)] !== undefined)?.membersByGame?.[String(props.gameId!)]
      ?? undefined
  }
  // Sum across all tracked game IDs
  const byGame = metrics.value?.members.byGame
  if (byGame) {
    return Object.values(byGame).reduce((acc: number, n: number) => acc + n, 0)
  }
  return undefined
})

// Game filter - VUI Select options
const gameOptions = computed<GameOption[]>(() => {
  const ids = new Set<string>()
  for (const e of metricsHistory.value) {
    if (e.membersByGame)
      Object.keys(e.membersByGame).forEach(k => ids.add(k))
  }
  return [...ids]
    .sort((a, b) => gameLabel(a).localeCompare(gameLabel(b)))
    .map(id => ({ label: gameLabel(id), value: id }))
})

// null = show all games stacked; non-empty = filter to selection
const _selectedGameOptions = ref<GameOption[] | undefined>([])
const selectedGameOptions = computed({
  get: () => _selectedGameOptions.value ?? [],
  set: (v) => { _selectedGameOptions.value = v ?? [] },
})
const selectedGameIds = computed(() =>
  selectedGameOptions.value.length > 0
    ? new Set(selectedGameOptions.value.map(o => o.value))
    : null,
)

const chartData = computed(() => {
  void theme.value
  void activeTheme.value

  if (!metricsHistory.value.length) {
    return { datasets: [] }
  }

  const palette = getChartPalette()

  const ids = selectedGameIds.value
    ? [...selectedGameIds.value]
    : gameOptions.value.map(o => o.value)

  const isFiltered = selectedGameIds.value !== null
  const colorized = props.colorize && !isFiltered ? getColorizedPalette(ids.length) : null

  // Steam game mode: filter by Steam app ID using membersBySteamGame
  if (props.steamGameId !== undefined) {
    const id = String(props.steamGameId)
    return {
      datasets: [{
        label: id,
        data: metricsHistory.value.map((e: MetricsHistoryEntry) => ({
          x: new Date(e.capturedAt).getTime(),
          y: e.membersBySteamGame?.[id] ?? null,
        })),
        backgroundColor: `${props.color ?? palette.datasets[1]}cc`,
        clip: false,
        stack: 'mg',
      }] as unknown as ChartDataset<'bar'>[],
    }
  }

  // Single-game mode: always render only that game's data, never fall back to totals
  if (props.gameId !== undefined) {
    const id = String(props.gameId)
    return {
      datasets: [{
        label: gameLabel(id),
        data: metricsHistory.value.map((e: MetricsHistoryEntry) => ({
          x: new Date(e.capturedAt).getTime(),
          y: e.membersByGame?.[id] ?? null,
        })),
        backgroundColor: `${props.color ?? palette.datasets[1]}cc`,
        clip: false,
        stack: 'mg',
      }] as unknown as ChartDataset<'bar'>[],
    }
  }

  if (ids.length === 0) {
    return {
      datasets: [{
        label: 'Played Games',
        data: metricsHistory.value.map((e: MetricsHistoryEntry) => ({
          x: new Date(e.capturedAt).getTime(),
          y: e.membersOnline,
        })),
        backgroundColor: `${props.color ?? palette.datasets[1]}cc`,
        clip: false as const,
        stack: 'mg',
      }] as unknown as ChartDataset<'bar'>[],
    }
  }

  return {
    datasets: ids.map((id, i) => ({
      label: gameLabel(id),
      data: metricsHistory.value.map((e: MetricsHistoryEntry) => ({
        x: new Date(e.capturedAt).getTime(),
        y: e.membersByGame?.[id] ?? null,
      })),
      backgroundColor: colorized
        ? colorized[i % colorized.length]
        : isFiltered
          ? `${palette.datasets[i % palette.datasets.length]}cc`
          : `${props.color ?? palette.datasets[1]}cc`,
      clip: false,
      stack: 'mg',
    })) as unknown as ChartDataset<'bar'>[],
  }
})

const localChartOptions = {
  plugins: {
    legend: { display: false },
    barGapPlugin: { enabled: false },
    tooltip: {
      mode: 'index' as const,
      intersect: false,
      callbacks: {
        label: (item: import('chart.js').TooltipItem<'bar'>) => {
          const raw = item.raw as { y: number | null } | null | undefined
          if (raw === null || raw === undefined || raw.y === null || raw.y === 0)
            return ''
          return `${item.dataset.label}: ${item.parsed.y}`
        },
        afterBody() {
          return ''
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

const chartOptions = ref<ChartOptions<'bar'>>(import.meta.client ? deepMergePlainObjects(getBarChartDefaults(props.utc), localChartOptions as ChartOptions<'bar'>) : {})

function refreshChartOptions() {
  nextTick(() => {
    const windowScale: ChartOptions<'bar'> = props.window
      ? { scales: { x: { min: props.window.start.getTime(), max: props.window.end.getTime() } } }
      : {}
    const compactOverride: ChartOptions<'bar'> = props.compact
      ? { scales: { x: { ticks: { display: false } }, y: { ticks: { display: props.showYAxis } } } }
      : {}
    chartOptions.value = deepMergePlainObjects(getBarChartDefaults(props.utc), localChartOptions as ChartOptions<'bar'>, windowScale, compactOverride)
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
</script>

<template>
  <div class="chart-container" :class="{ 'chart-container--compact': compact }">
    <Flex v-if="compact" x-between y-center class="chart-compact-title">
      <span>Game Activity</span>
      <OnlineBadge :count="currentCount ?? 0" label="playing" size="s" :color="(currentCount ?? 0) > 0 ? 'var(--color-text-green)' : undefined" />
    </Flex>
    <Flex v-if="!compact && !hideTitle" x-between y-center class="text-m text-bold-row">
      <Flex gap="s" y-center>
        <span class="text-m text-bold">Played Games</span>
        <OnlineBadge :count="currentCount ?? 0" label="playing" size="s" :color="(currentCount ?? 0) > 0 ? 'var(--color-text-green)' : undefined" />
      </Flex>
      <Select
        v-if="gameId === undefined && steamGameId === undefined"
        v-model="selectedGameOptions"
        :options="gameOptions"
        placeholder="All Games"
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

    <div
      v-if="!loadingHistory"
      ref="chartWrapperRef"
      :key="`${theme}-${activeTheme?.id}-${props.utc}-${selectedGameOptions.length}-${props.gameId}-${props.steamGameId}-${props.window?.start.getTime()}-${props.window?.end.getTime()}`"
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
