<script setup lang="ts">
import type { ChartOptions } from 'chart.js'
import type { ChartComponentRef } from 'vue-chartjs'
import type { Database } from '@/types/database.types'
import { Skeleton, theme } from '@dolanske/vui'
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
import { computed, nextTick, onMounted, ref, watch, watchEffect } from 'vue'
import { Line } from 'vue-chartjs'
import { useDataMonthlyFunding } from '@/composables/useDataMonthlyFunding'
import { useUserTheme } from '@/composables/useUserTheme'
import { getChartPalette, getLineChartDefaults } from '@/lib/charts'
import { deepMergePlainObjects } from '@/lib/utils/common'

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
)

// Monthly funding table type
type MonthlyFunding = Database['public']['Tables']['monthly_funding']['Row']

// Setup state
const loading = ref(true)
const errorMessage = ref('')
const monthlyFundings = ref<MonthlyFunding[]>([])

// monthly_funding served from shared cache
const { allFunding, loading: fundingLoading, error: fundingError } = useDataMonthlyFunding()
const chartWrapperRef = ref<HTMLElement | null>(null)
const chartRef = ref<ChartComponentRef<'line'> | null>(null)
const { width: chartWrapperWidth } = useElementSize(chartWrapperRef, { width: 0, height: 0 })
const { activeTheme } = useUserTheme()

// Chart data
const chartData = computed(() => {
  // Track both theme (light/dark switch) and activeTheme (custom palette applied
  // after async fetch). getCSSVariable reads the DOM directly - not reactive -
  // so we need explicit deps to re-run after applyTheme() writes to :root.
  void theme.value
  void activeTheme.value

  if (!monthlyFundings.value.length) {
    return {
      labels: [],
      datasets: [],
    }
  }

  // Sort data by month ascending for chronological display
  const sortedData = monthlyFundings.value.toSorted((a, b) => {
    return dayjs(a.month).valueOf() - dayjs(b.month).valueOf()
  })

  const labels = sortedData.map((funding) => {
    return dayjs(funding.month).format('MMM YYYY')
  })

  // Calculate monthly total income (Patreon + donations)
  const monthlyIncomeData = sortedData.map((funding) => {
    const patreonAmount = (funding.patreon_month_amount_cents || 0) / 100
    const donationAmount = (funding.donation_month_amount_cents || 0) / 100
    return patreonAmount + donationAmount
  })

  const patreonSupportersData = sortedData.map(f => f.patreon_count ?? 0)
  const supportersData = sortedData.map(f => f.donation_count ?? 0)

  const palette = getChartPalette()

  return {
    labels,
    datasets: [
      {
        label: 'Monthly Donations (€)',
        data: monthlyIncomeData,
        borderColor: palette.datasets[0], // blue
        backgroundColor: palette.datasets[0],
        fill: false,
      },
      {
        label: 'Patreon Supporters',
        data: patreonSupportersData,
        borderColor: palette.datasets[2], // red
        backgroundColor: palette.datasets[2],
        fill: false,
      },
      {
        label: 'Supporters',
        data: supportersData,
        borderColor: palette.datasets[1], // green
        backgroundColor: palette.datasets[1],
        fill: false,
      },
    ],
  }
})

// Chart options
const localChartOptions: ChartOptions<'line'> = {
  plugins: {
    title: {
      display: false,
    },
    tooltip: {
      mode: 'index',
      intersect: false,
      callbacks: {
        label: (context) => {
          const label = context.dataset.label || ''
          const value = context.parsed?.y

          if (typeof value !== 'number') {
            return label ? `${label}: -` : '-'
          }

          if (context.datasetIndex === 0) {
            return `${label}: €${value.toFixed(2)}`
          }

          return `${label}: ${value}`
        },
      },
    },
  },
  elements: {
    line: {
      tension: 0.4,
    },
    point: {
      radius: 0,
    },
  },
  scales: {
    x: {
      title: {
        display: false,
      },
      ticks: {
        maxTicksLimit: 8,
        maxRotation: 0,
        callback(val, index) {
          const label = this.getLabelForValue(index)
          // label is 'MMM YYYY' e.g. 'Apr 2025' - shorten to 'Apr '25'
          const parts = label.split(' ')
          const [month, year] = parts
          return month && year ? `${month} '${year.slice(2)}` : label
        },
      },
    },
    y: {
      title: {
        display: false,
      },
    },
  },
}

const chartOptions = ref<ChartOptions<'line'>>(import.meta.client ? deepMergePlainObjects(getLineChartDefaults(), localChartOptions) : {})

function refreshChartOptions() {
  nextTick(() => {
    chartOptions.value = deepMergePlainObjects(getLineChartDefaults(), localChartOptions)
  })
}

onMounted(() => refreshChartOptions())
watch(theme, () => refreshChartOptions())

// Sync from shared cache - allFunding is ordered descending, chart needs ascending
watch([allFunding, fundingLoading, fundingError], () => {
  if (fundingError.value) {
    errorMessage.value = fundingError.value
    loading.value = false
    return
  }

  if (!fundingLoading.value) {
    monthlyFundings.value = allFunding.value.toReversed() as MonthlyFunding[]
    loading.value = false
  }
}, { immediate: true })

// Month-over-month income growth %
const momGrowth = computed(() => {
  const data = monthlyFundings.value
  if (data.length < 2)
    return null
  const prev = ((data[data.length - 2]!.patreon_month_amount_cents || 0) + (data[data.length - 2]!.donation_month_amount_cents || 0)) / 100
  const curr = ((data[data.length - 1]!.patreon_month_amount_cents || 0) + (data[data.length - 1]!.donation_month_amount_cents || 0)) / 100
  if (prev === 0)
    return null
  return Math.round(((curr - prev) / prev) * 100)
})

const currentDiff = computed(() => {
  const data = monthlyFundings.value
  if (data.length < 2)
    return null
  const prev = ((data[data.length - 2]!.patreon_month_amount_cents || 0) + (data[data.length - 2]!.donation_month_amount_cents || 0)) / 100
  const curr = ((data[data.length - 1]!.patreon_month_amount_cents || 0) + (data[data.length - 1]!.donation_month_amount_cents || 0)) / 100
  return Math.round(curr - prev)
})

defineExpose({ momGrowth, currentDiff })

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
    <div v-if="loading" class="chart-loading">
      <div class="chart-skeleton">
        <!-- Chart area skeleton -->
        <div class="chart-area-skeleton">
          <!-- Y-axis labels -->
          <div class="y-axis-skeleton">
            <Skeleton v-for="i in 5" :key="i" :width="30" :height="10" :radius="2" />
          </div>

          <!-- Chart lines simulation -->
          <div class="chart-lines-skeleton">
            <Skeleton :height="120" :radius="8" style="opacity: 0.3;" />
          </div>
        </div>

        <!-- X-axis labels -->
        <div class="x-axis-skeleton">
          <Skeleton v-for="i in 6" :key="i" :width="44" :height="10" :radius="2" />
        </div>
      </div>
    </div>

    <div v-else-if="errorMessage" class="chart-error">
      <p>Error loading chart: {{ errorMessage }}</p>
    </div>

    <div v-else-if="!monthlyFundings.length" class="chart-empty">
      <p>No funding data available for chart</p>
    </div>

    <div v-else ref="chartWrapperRef" :key="`${theme}-${activeTheme?.id}`" class="chart-wrapper">
      <Line
        ref="chartRef"
        :data="chartData"
        :options="chartOptions"
      />
    </div>
  </div>
</template>

<style scoped lang="scss">
.chart-container {
  width: 100%;
  min-height: 178px;
  background-color: var(--color-bg-card);
  border-radius: var(--border-radius-m);
  padding: var(--space-m);
  border: 1px solid var(--color-border);
}

.chart-wrapper {
  height: 178px;
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
  height: 178px;
  color: var(--color-text-light);
}

.chart-skeleton {
  width: 100%;
  max-width: 800px;

  .chart-area-skeleton {
    display: flex;
    align-items: center;
    gap: var(--space-s);
    margin-bottom: var(--space-xs);

    .y-axis-skeleton {
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      height: 120px;
    }

    .chart-lines-skeleton {
      flex: 1;
      height: 120px;
    }
  }

  .x-axis-skeleton {
    display: flex;
    justify-content: space-between;
    margin-left: 38px;
    margin-right: 38px;
  }
}

.chart-error {
  color: var(--color-text-danger);
}
</style>
