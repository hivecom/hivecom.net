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
import { computed, onBeforeMount, ref, watch, watchEffect } from 'vue'
import { Line } from 'vue-chartjs'
import { getLineChartDefaults } from '@/lib/charts'
import { deepMergePlainObjects } from '@/lib/utils/common'

const props = defineProps<Props>()

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

// Props
interface Props {
  refreshSignal?: number
}

// Setup client and state
const supabase = useSupabaseClient()
const loading = ref(true)
const errorMessage = ref('')
const monthlyFundings = ref<MonthlyFunding[]>([])
const chartWrapperRef = ref<HTMLElement | null>(null)
const chartRef = ref<ChartComponentRef<'line'> | null>(null)
const { width: chartWrapperWidth } = useElementSize(chartWrapperRef, { width: 0, height: 0 })

// Chart data
const chartData = computed(() => {
  if (!monthlyFundings.value.length) {
    return {
      labels: [],
      datasets: [],
    }
  }

  // Sort data by month ascending for chronological display
  const sortedData = [...monthlyFundings.value].sort((a, b) => {
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

  // Calculate lifetime total earnings (Patreon + donations)
  const lifetimeEarningsData = sortedData.map((funding) => {
    const patreonLifetime = (funding.patreon_lifetime_amount_cents || 0) / 100
    const donationLifetime = (funding.donation_lifetime_amount_cents || 0) / 100
    return patreonLifetime + donationLifetime
  })

  return {
    labels,
    datasets: [
      {
        label: 'Monthly Income (€)',
        data: monthlyIncomeData,
        borderColor: '#22C55E',
        backgroundColor: '#22C55E',
        yAxisID: 'y',
        fill: false,
      },
      {
        label: 'Lifetime Earnings (€)',
        data: lifetimeEarningsData,
        borderColor: '#8B5CF6',
        backgroundColor: '#8B5CF6',
        yAxisID: 'y1',
        fill: false,
      },
    ],
  }
})

// Chart options
const localChartOptions: ChartOptions<'line'> = {
  plugins: {
    title: {
      text: 'Monthly Income vs Lifetime Earnings',
    },
    tooltip: {
      mode: 'index',
      intersect: false,
      callbacks: {
        label: (context) => {
          const label = context.dataset.label || ''
          const value = context.parsed?.y

          if (typeof value !== 'number') {
            return label ? `${label}: —` : '—'
          }

          return `${label}: €${value.toFixed(2)}`
        },
      },
    },
  },
  scales: {
    x: {
      title: {
        display: true,
        text: 'Month',
      },
    },
    y: {
      title: {
        display: true,
        text: 'Monthly Income (€)',
      },
    },
    y1: {
      type: 'linear',
      display: true,
      position: 'right',
      title: {
        display: true,
        text: 'Lifetime Earnings (€)',
      },
      beginAtZero: true,
      grid: {
        drawOnChartArea: false,
      },
    },
  },
}

// Fetch monthly funding data
async function fetchMonthlyFundings() {
  loading.value = true
  errorMessage.value = ''

  try {
    const { data, error } = await supabase
      .from('monthly_funding')
      .select('*')
      .order('month', { ascending: true })

    if (error)
      throw error

    monthlyFundings.value = data as MonthlyFunding[] || []
  }
  catch (error: unknown) {
    errorMessage.value = error instanceof Error ? error.message : 'An error occurred while loading funding data'
  }
  finally {
    loading.value = false
  }
}

// Watch for refresh signal changes
watch(() => props.refreshSignal, () => {
  if (props.refreshSignal) {
    fetchMonthlyFundings()
  }
})

watchEffect(() => {
  const width = chartWrapperWidth.value
  const chart = chartRef.value?.chart

  if (!width || !chart)
    return

  const containerHeight = chartWrapperRef.value?.clientHeight
  chart.resize(Math.floor(width), containerHeight)
})

// Lifecycle hooks
onBeforeMount(fetchMonthlyFundings)
</script>

<template>
  <div class="chart-container">
    <div v-if="loading" class="chart-loading">
      <div class="chart-skeleton">
        <!-- Chart title skeleton -->
        <Skeleton :width="280" :height="20" :radius="4" style="margin-bottom: var(--space-l);" />

        <!-- Legend skeleton -->
        <div class="legend-skeleton">
          <Skeleton :width="120" :height="16" :radius="4" />
          <Skeleton :width="140" :height="16" :radius="4" />
        </div>

        <!-- Chart area skeleton -->
        <div class="chart-area-skeleton">
          <!-- Y-axis labels -->
          <div class="y-axis-skeleton">
            <Skeleton v-for="i in 6" :key="i" :width="40" :height="12" :radius="2" />
          </div>

          <!-- Chart lines simulation -->
          <div class="chart-lines-skeleton">
            <Skeleton :height="200" :radius="8" style="opacity: 0.3;" />
          </div>

          <!-- Right Y-axis labels -->
          <div class="y-axis-skeleton">
            <Skeleton v-for="i in 6" :key="i" :width="40" :height="12" :radius="2" />
          </div>
        </div>

        <!-- X-axis labels -->
        <div class="x-axis-skeleton">
          <Skeleton v-for="i in 6" :key="i" :width="60" :height="12" :radius="2" />
        </div>
      </div>
    </div>

    <div v-else-if="errorMessage" class="chart-error">
      <p>Error loading chart: {{ errorMessage }}</p>
    </div>

    <div v-else-if="!monthlyFundings.length" class="chart-empty">
      <p>No funding data available for chart</p>
    </div>

    <div v-else ref="chartWrapperRef" :key="theme" class="chart-wrapper">
      <Line
        ref="chartRef"
        :data="chartData"
        :options="deepMergePlainObjects(getLineChartDefaults(theme), localChartOptions)"
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
  height: 400px;
  color: var(--color-text-light);
}

.chart-skeleton {
  width: 100%;
  max-width: 800px;

  .legend-skeleton {
    display: flex;
    justify-content: center;
    gap: var(--space-l);
    margin-bottom: var(--space-l);
  }

  .chart-area-skeleton {
    display: flex;
    align-items: center;
    gap: var(--space-s);
    margin-bottom: var(--space-m);

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

.chart-error {
  color: var(--color-text-danger);
}
</style>
