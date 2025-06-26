<script setup lang="ts">
import type { ChartOptions } from 'chart.js'
import type { Database } from '@/types/database.types'
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
import { computed, onBeforeMount, ref, watch } from 'vue'
import { Line } from 'vue-chartjs'

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
        backgroundColor: 'rgba(34, 197, 94, 0.1)',
        tension: 0.4,
        yAxisID: 'y',
        fill: false,
      },
      {
        label: 'Lifetime Earnings (€)',
        data: lifetimeEarningsData,
        borderColor: '#8B5CF6',
        backgroundColor: 'rgba(139, 92, 246, 0.1)',
        tension: 0.4,
        yAxisID: 'y1',
        fill: false,
      },
    ],
  }
})

// Chart options
const chartOptions: ChartOptions<'line'> = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    title: {
      display: true,
      text: 'Monthly Income vs Lifetime Earnings',
      font: {
        size: 16,
        weight: 'bold',
      },
    },
    legend: {
      display: true,
      position: 'top',
    },
    tooltip: {
      mode: 'index',
      intersect: false,
      callbacks: {
        label: (context) => {
          const label = context.dataset.label || ''
          return `${label}: €${context.parsed.y.toFixed(2)}`
        },
      },
    },
  },
  scales: {
    x: {
      display: true,
      title: {
        display: true,
        text: 'Month',
      },
    },
    y: {
      type: 'linear',
      display: true,
      position: 'left',
      title: {
        display: true,
        text: 'Monthly Income (€)',
      },
      beginAtZero: true,
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
  interaction: {
    mode: 'nearest',
    axis: 'x',
    intersect: false,
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

// Lifecycle hooks
onBeforeMount(fetchMonthlyFundings)
</script>

<template>
  <div class="chart-container">
    <div v-if="loading" class="chart-loading">
      <p>Loading chart data...</p>
    </div>

    <div v-else-if="errorMessage" class="chart-error">
      <p>Error loading chart: {{ errorMessage }}</p>
    </div>

    <div v-else-if="!monthlyFundings.length" class="chart-empty">
      <p>No funding data available for chart</p>
    </div>

    <div v-else class="chart-wrapper">
      <Line :data="chartData" :options="chartOptions" />
    </div>
  </div>
</template>

<style scoped lang="scss">
.chart-container {
  width: 100%;
  min-height: 320px;
  background: var(--color-bg);
  border-radius: var(--border-radius-m);
  padding: var(--space-m);
  border: 1px solid var(--color-border);
}

.chart-wrapper {
  height: 320px;
  width: 100%;
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

.chart-error {
  color: var(--color-text-danger);
}
</style>
