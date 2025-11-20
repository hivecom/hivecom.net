<script setup lang="ts">
import type { ChartOptions } from 'chart.js'
import { Skeleton } from '@dolanske/vui'
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

// Types
interface MonthlyUserData {
  month: string
  totalUsers: number
  patreonSupporters: number
  totalSupporters: number
}

// Props
interface Props {
  refreshSignal?: number
}

// Setup client and state
const supabase = useSupabaseClient()
const loading = ref(true)
const errorMessage = ref('')
const monthlyData = ref<MonthlyUserData[]>([])

// Fetch users data and group by month
async function fetchUsersData() {
  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('created_at, supporter_lifetime, supporter_patreon')
    .order('created_at', { ascending: true })

  if (error)
    throw error

  // Group users by month
  const usersByMonth: Record<string, { total: number, supporters: number }> = {}

  profiles?.forEach((profile) => {
    const month = dayjs(profile.created_at).format('YYYY-MM')
    if (!usersByMonth[month]) {
      usersByMonth[month] = { total: 0, supporters: 0 }
    }
    usersByMonth[month].total++

    // Count as supporter if they have lifetime or patreon support
    if (profile.supporter_lifetime || profile.supporter_patreon) {
      usersByMonth[month].supporters++
    }
  })

  return usersByMonth
}

// Fetch monthly funding data for Patreon supporters
async function fetchMonthlyFundings() {
  const { data, error } = await supabase
    .from('monthly_funding')
    .select('month, patreon_count')
    .order('month', { ascending: true })

  if (error)
    throw error
  return data || []
}

// Combine and process all data
async function fetchAllData() {
  loading.value = true
  errorMessage.value = ''

  try {
    const [usersByMonth, monthlyFundings] = await Promise.all([
      fetchUsersData(),
      fetchMonthlyFundings(),
    ])

    // Normalize month formats and create a combined dataset
    const monthsMap = new Map<string, MonthlyUserData>()

    // Add user data
    Object.entries(usersByMonth).forEach(([month, users]) => {
      const normalizedMonth = dayjs(month).format('YYYY-MM')
      monthsMap.set(normalizedMonth, {
        month: normalizedMonth,
        totalUsers: users.total,
        patreonSupporters: 0,
        totalSupporters: users.supporters,
      })
    })

    // Add/merge funding data
    monthlyFundings.forEach((funding) => {
      const normalizedMonth = dayjs(funding.month).format('YYYY-MM')
      const existing = monthsMap.get(normalizedMonth)

      if (existing) {
        existing.patreonSupporters = funding.patreon_count || 0
      }
      else {
        monthsMap.set(normalizedMonth, {
          month: normalizedMonth,
          totalUsers: 0,
          patreonSupporters: funding.patreon_count || 0,
          totalSupporters: 0,
        })
      }
    })

    // Convert to sorted array
    const combinedData = Array.from(monthsMap.values())
      .sort((a, b) => dayjs(a.month).valueOf() - dayjs(b.month).valueOf())

    // Calculate cumulative values
    let cumulativeUsers = 0
    let cumulativeSupporters = 0

    monthlyData.value = combinedData.map((data) => {
      cumulativeUsers += data.totalUsers
      cumulativeSupporters += data.totalSupporters

      return {
        ...data,
        totalUsers: cumulativeUsers,
        totalSupporters: cumulativeSupporters,
      }
    })
  }
  catch (error: unknown) {
    errorMessage.value = error instanceof Error ? error.message : 'An error occurred while loading user data'
  }
  finally {
    loading.value = false
  }
}

// Chart data
const chartData = computed(() => {
  if (!monthlyData.value.length) {
    return {
      labels: [],
      datasets: [],
    }
  }

  // Data is already sorted in fetchAllData, no need to sort again
  const sortedData = monthlyData.value

  const labels = sortedData.map((data) => {
    return dayjs(data.month).format('MMM YYYY')
  })

  const totalUsersData = sortedData.map(data => data.totalUsers)
  const patreonSupportersData = sortedData.map(data => data.patreonSupporters)
  const totalSupportersData = sortedData.map(data => data.totalSupporters)

  return {
    labels,
    datasets: [
      {
        label: 'Total Users',
        data: totalUsersData,
        borderColor: '#3B82F6',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        tension: 0.4,
        yAxisID: 'y',
      },
      {
        label: 'Patreon Supporters',
        data: patreonSupportersData,
        borderColor: '#FF424D',
        backgroundColor: 'rgba(255, 66, 77, 0.1)',
        tension: 0.4,
        yAxisID: 'y',
      },
      {
        label: 'Supporters',
        data: totalSupportersData,
        borderColor: '#10B981',
        backgroundColor: 'rgba(16, 185, 129, 0.1)',
        tension: 0.4,
        yAxisID: 'y',
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
      text: 'User Growth Over Time',
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
        text: 'Number of Users',
      },
      beginAtZero: true,
    },
  },
  interaction: {
    mode: 'nearest',
    axis: 'x',
    intersect: false,
  },
}

// Watch for refresh signal changes
watch(() => props.refreshSignal, () => {
  if (props.refreshSignal) {
    fetchAllData()
  }
})

// Lifecycle hooks
onBeforeMount(fetchAllData)
</script>

<template>
  <div class="chart-container">
    <div v-if="loading" class="chart-loading">
      <div class="chart-skeleton">
        <!-- Chart title skeleton -->
        <Skeleton :width="200" :height="20" :radius="4" style="margin-bottom: var(--space-l);" />

        <!-- Legend skeleton -->
        <div class="legend-skeleton">
          <Skeleton :width="80" :height="16" :radius="4" />
          <Skeleton :width="120" :height="16" :radius="4" />
          <Skeleton :width="80" :height="16" :radius="4" />
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

    <div v-else-if="!monthlyData.length" class="chart-empty">
      <p>No user data available for chart</p>
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
  color: var(--text-color-light);
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
    margin-right: 0;
  }
}

.chart-error {
  color: var(--text-color-danger);
}
</style>
