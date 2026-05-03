<script setup lang="ts">
import type { ChartOptions } from 'chart.js'
import type { ChartComponentRef } from 'vue-chartjs'
import type { MetricsPeriod } from '@/composables/useDataMetrics'
import { Flex, Select, Skeleton, theme } from '@dolanske/vui'
import { useElementSize } from '@vueuse/core'
import {
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Title,
  Tooltip,
} from 'chart.js'
import dayjs from 'dayjs'
import { computed, onMounted, ref, watch, watchEffect } from 'vue'
import { Line } from 'vue-chartjs'
import { METRICS_PERIOD_OPTIONS, useDataMetrics } from '@/composables/useDataMetrics'
import { useUserTheme } from '@/composables/useUserTheme'
import { getChartPalette, getLineChartDefaults } from '@/lib/charts'
import { deepMergePlainObjects } from '@/lib/utils/common'

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
)

const { metricsHistory, loadingHistory, fetchMetricsHistory } = useDataMetrics()

interface PeriodOption { label: string, value: MetricsPeriod }
const selectedPeriod = ref<PeriodOption[]>([METRICS_PERIOD_OPTIONS[0] as PeriodOption])

const activePeriod = computed<MetricsPeriod>(() => selectedPeriod.value[0]?.value ?? '24h')

watch(selectedPeriod, () => {
  fetchMetricsHistory(activePeriod.value)
})

const chartWrapperRef = ref<HTMLElement | null>(null)
const chartRef = ref<ChartComponentRef<'line'> | null>(null)
const { width: chartWrapperWidth } = useElementSize(chartWrapperRef, { width: 0, height: 0 })
const { activeTheme } = useUserTheme()

onMounted(() => fetchMetricsHistory(activePeriod.value))

const xAxisFormat = computed<string>(() => {
  switch (activePeriod.value) {
    case '7d': return 'ddd HH:mm'
    case '30d': return 'MMM D HH:mm'
    case '90d': return 'MMM D'
    default: return 'HH:mm'
  }
})

const chartData = computed(() => {
  void theme.value
  void activeTheme.value

  if (!metricsHistory.value.length) {
    return { labels: [], datasets: [] }
  }

  const fmt = xAxisFormat.value
  const labels = metricsHistory.value.map(e => dayjs(e.capturedAt).format(fmt))
  const palette = getChartPalette()

  return {
    labels,
    datasets: [
      {
        label: 'Members Online',
        data: metricsHistory.value.map(e => e.membersOnline),
        borderColor: palette.datasets[0],
        backgroundColor: palette.datasets[0],
        fill: false,
      },
    ],
  }
})

const localChartOptions: ChartOptions<'line'> = {
  plugins: {
    title: {
      display: false,
    },
    tooltip: {
      mode: 'index',
      intersect: false,
    },
  },
  scales: {
    x: {
      title: {
        display: true,
        text: 'Time',
      },
    },
    y: {
      beginAtZero: false,
      title: {
        display: true,
        text: 'Members',
      },
    },
  },
}

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
    <Flex x-between y-center gap="m">
      <span class="chart-title">Member Activity</span>
      <Select
        v-model="selectedPeriod"
        :options="METRICS_PERIOD_OPTIONS"
        :single="true"
      />
    </Flex>

    <div v-if="loadingHistory" class="chart-loading">
      <div class="chart-skeleton">
        <div class="legend-skeleton">
          <Skeleton :width="140" :height="16" :radius="4" />
        </div>

        <div class="chart-area-skeleton">
          <div class="y-axis-skeleton">
            <Skeleton v-for="i in 6" :key="i" :width="40" :height="12" :radius="2" />
          </div>
          <div class="chart-lines-skeleton">
            <Skeleton :height="200" :radius="8" style="opacity: 0.3;" />
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

    <div v-else ref="chartWrapperRef" :key="`${theme}-${activeTheme?.id}`" class="chart-wrapper">
      <Line
        ref="chartRef"
        :data="chartData"
        :options="deepMergePlainObjects(getLineChartDefaults(), localChartOptions)"
      />
    </div>
  </div>
</template>

<style scoped lang="scss">
.chart-container {
  width: 100%;
  min-height: 320px;
  background-color: var(--color-bg);
  border-radius: var(--border-radius-m);
  padding: var(--space-m);
  border: 1px solid var(--color-border);

  .chart-title {
    font-size: var(--font-size-m);
    font-weight: 600;
    color: var(--color-text);
  }
}

.chart-wrapper {
  height: 320px;
  width: 100%;
  position: relative;
}

.chart-wrapper :deep(canvas) {
  width: 100% !important;
  height: 100% !important;
}

.chart-loading,
.chart-error,
.chart-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 320px;
  color: var(--color-text-light);
}

.chart-skeleton {
  width: 100%;

  .legend-skeleton {
    display: flex;
    justify-content: center;
    gap: var(--space-l);
    margin-bottom: var(--space-l);
  }

  .chart-area-skeleton {
    display: flex;
    align-items: center;

    .y-axis-skeleton {
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      height: 200px;
    }

    .chart-lines-skeleton {
      flex: 1;
      height: 200px;
    }
  }

  .x-axis-skeleton {
    display: flex;
    justify-content: space-between;
    margin-left: 48px;
    margin-right: 48px;
  }
}
</style>
