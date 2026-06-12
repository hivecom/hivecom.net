<script setup lang="ts">
import type { ChartOptions } from 'chart.js'
import type { ChartComponentRef } from 'vue-chartjs'
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
import { computed, nextTick, onBeforeMount, onMounted, ref, watch, watchEffect } from 'vue'
import { Line } from 'vue-chartjs'
import { useUserTheme } from '@/composables/useUserTheme'
import { getChartPalette, getLineChartDefaults } from '@/lib/charts'
import { deepMergePlainObjects } from '@/lib/utils/common'
import { fullMonth } from '@/lib/utils/date'

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
}

// Setup client and state
const supabase = useSupabaseClient()
const loading = ref(true)
const errorMessage = ref('')
const monthlyData = ref<MonthlyUserData[]>([])
const chartWrapperRef = ref<HTMLElement | null>(null)
const chartRef = ref<ChartComponentRef<'line'> | null>(null)
const { width: chartWrapperWidth } = useElementSize(chartWrapperRef, { width: 0, height: 0 })
const { activeTheme } = useUserTheme()

// Fetch users data and group by month
async function fetchUsersData() {
  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('created_at')
    .order('created_at', { ascending: true })

  if (error)
    throw error

  // Group users by month
  const usersByMonth: Record<string, { total: number }> = {}

  profiles?.forEach((profile) => {
    const month = dayjs(profile.created_at).format('YYYY-MM')
    if (!usersByMonth[month]) {
      usersByMonth[month] = { total: 0 }
    }
    usersByMonth[month].total++
  })

  return usersByMonth
}

// Combine and process all data
async function fetchAllData() {
  loading.value = true
  errorMessage.value = ''

  try {
    const usersByMonth = await fetchUsersData()

    const sortedEntries = Object.entries(usersByMonth).toSorted(([a], [b]) => dayjs(a).valueOf() - dayjs(b).valueOf())

    let cumulativeUsers = 0
    monthlyData.value = sortedEntries.map(([month, users]) => {
      cumulativeUsers += users.total
      return { month: dayjs(month).format('YYYY-MM'), totalUsers: cumulativeUsers }
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
  // Track both theme (light/dark switch) and activeTheme (custom palette applied
  // after async fetch). getCSSVariable reads the DOM directly - not reactive -
  // so we need explicit deps to re-run after applyTheme() writes to :root.
  void theme.value
  void activeTheme.value

  if (!monthlyData.value.length) {
    return {
      labels: [],
      datasets: [],
    }
  }

  // Data is already sorted in fetchAllData, no need to sort again
  const sortedData = monthlyData.value

  const labels = sortedData.map((data) => {
    return fullMonth(data.month)
  })

  const totalUsersData = sortedData.map(data => data.totalUsers)

  const palette = getChartPalette()

  return {
    labels,
    datasets: [
      {
        label: 'Total Users',
        data: totalUsersData,
        borderColor: palette.datasets[0], // blue
        backgroundColor: palette.datasets[0],
        yAxisID: 'y',
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
    legend: {
      display: false,
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

watchEffect(() => {
  const width = chartWrapperWidth.value
  const chart = chartRef.value?.chart

  if (!width || !chart)
    return

  const containerHeight = chartWrapperRef.value?.clientHeight
  chart.resize(Math.floor(width), containerHeight)
})

// Month-over-month growth %
const momGrowth = computed(() => {
  const data = monthlyData.value
  if (data.length < 2)
    return null
  const prev = data[data.length - 2]!.totalUsers
  const curr = data[data.length - 1]!.totalUsers
  if (prev === 0)
    return null
  return Math.round(((curr - prev) / prev) * 100)
})

const currentDiff = computed(() => {
  const data = monthlyData.value
  if (data.length < 2)
    return null
  return data[data.length - 1]!.totalUsers - data[data.length - 2]!.totalUsers
})

defineExpose({ momGrowth, currentDiff })

// Lifecycle hooks
onBeforeMount(fetchAllData)
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

    <div v-else-if="!monthlyData.length" class="chart-empty">
      <p>No user data available for chart</p>
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
    margin-right: 0;
  }
}

.chart-error {
  color: var(--color-text-danger);
}
</style>
