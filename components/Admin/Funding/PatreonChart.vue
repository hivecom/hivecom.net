<script setup lang="ts">
import type { Tables } from '~/types/database.types'
import {
  CategoryScale,
  Chart as ChartJS,
  type ChartOptions,
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
interface MonthlyFunding extends Tables<'monthly_funding'> {}

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

  const patronData = sortedData.map(funding => funding.patreon_count || 0)
  const amountData = sortedData.map(funding => (funding.patreon_month_amount_cents || 0) / 100)

  return {
    labels,
    datasets: [
      {
        label: 'Patreon Supporters',
        data: patronData,
        borderColor: '#FF424D',
        backgroundColor: 'rgba(255, 66, 77, 0.1)',
        tension: 0.4,
        yAxisID: 'y',
      },
      {
        label: 'Monthly Amount (€)',
        data: amountData,
        borderColor: '#00A8CC',
        backgroundColor: 'rgba(0, 168, 204, 0.1)',
        tension: 0.4,
        yAxisID: 'y1',
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
      text: 'Patreon Growth Over Time',
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
          if (label.includes('Amount')) {
            return `${label}: €${context.parsed.y.toFixed(2)}`
          }
          return `${label}: ${context.parsed.y}`
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
        text: 'Number of Supporters',
      },
      beginAtZero: true,
    },
    y1: {
      type: 'linear',
      display: true,
      position: 'right',
      title: {
        display: true,
        text: 'Monthly Amount (€)',
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
  catch (error: any) {
    errorMessage.value = error.message || 'An error occurred while loading funding data'
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

<style scoped>
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
