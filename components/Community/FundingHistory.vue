<script setup lang="ts">
import type { Tables } from '~/types/database.types'
import { Alert, Badge, Card, defineTable, Flex, Grid, Table } from '@dolanske/vui'
import TableContainer from '~/components/Shared/TableContainer.vue'

interface Props {
  monthlyFunding: Tables<'monthly_funding'>[]
  formatCurrency: (cents: number) => string
}

const props = defineProps<Props>()

// Define transformed funding data interface for table
interface TransformedFunding {
  'Month': string
  'Patreon': number
  'Donations': number
  'Monthly Total': number
  'Lifetime Total': number
  'Growth': number | null
  '_original': any
}

// Year filter
const selectedYear = ref<number>(new Date().getFullYear())

// Get available years from data
const availableYears = computed(() => {
  const years = new Set(
    props.monthlyFunding.map(funding => new Date(`${funding.month}T00:00:00Z`).getFullYear()),
  )
  return Array.from(years).sort((a, b) => b - a) // Most recent first
})

// Process historical data for display
const historicalData = computed(() => {
  // Filter by year if selected
  const filteredData = props.monthlyFunding.filter((funding) => {
    const year = new Date(`${funding.month}T00:00:00Z`).getFullYear()
    return year === selectedYear.value
  })

  return filteredData.map((funding) => {
    const month = new Date(`${funding.month}T00:00:00Z`)
    const totalMonthly = (funding.patreon_month_amount_cents || 0) + (funding.donation_month_amount_cents || 0)
    const totalLifetime = (funding.patreon_lifetime_amount_cents || 0) + (funding.donation_lifetime_amount_cents || 0)

    return {
      ...funding,
      monthName: month.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
      shortMonthName: month.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
      totalMonthly,
      totalLifetime,
      patreonMonthly: funding.patreon_month_amount_cents || 0,
      donationMonthly: funding.donation_month_amount_cents || 0,
      patreonLifetime: funding.patreon_lifetime_amount_cents || 0,
      donationLifetime: funding.donation_lifetime_amount_cents || 0,
      supporterCount: funding.patreon_count || 0,
      donationCount: funding.donation_count || 0,
    }
  })
})

// Transform data for table (previous months only)
const transformedTableData = computed<TransformedFunding[]>(() => {
  if (historicalData.value.length <= 1)
    return []

  return historicalData.value.slice(1, 25).map((funding, index) => {
    const growth = getGrowthFromPrevious(funding.totalMonthly, index + 1)

    return {
      'Month': funding.shortMonthName,
      'Patreon': funding.patreonMonthly,
      'Donations': funding.donationMonthly,
      'Monthly Total': funding.totalMonthly,
      'Growth': growth,
      'Lifetime Total': funding.totalLifetime,
      '_original': funding,
    }
  })
})

// Table configuration
const { headers, rows } = defineTable(transformedTableData, {
  pagination: {
    enabled: false,
  },
  select: false,
})

// Calculate growth from previous month
function getGrowthFromPrevious(currentAmount: number, index: number) {
  if (index === historicalData.value.length - 1)
    return null

  const previousAmount = historicalData.value[index + 1]?.totalMonthly || 0
  if (previousAmount === 0)
    return null

  const growth = ((currentAmount - previousAmount) / previousAmount) * 100
  return growth
}

// Get growth indicator
function getGrowthIndicator(growth: number | null) {
  if (growth === null)
    return { variant: 'neutral' as const, icon: 'ph:minus', text: 'No data' }
  if (growth > 0)
    return { variant: 'success' as const, icon: 'ph:trend-up', text: `+${growth.toFixed(1)}%` }
  if (growth < 0)
    return { variant: 'danger' as const, icon: 'ph:trend-down', text: `${growth.toFixed(1)}%` }
  return { variant: 'neutral' as const, icon: 'ph:minus', text: '0%' }
}
</script>

<template>
  <div v-if="historicalData.length > 0 || props.monthlyFunding.length > 0">
    <!-- Year Filter -->
    <Flex x-between y-center class="mb-l">
      <h2>Funding History</h2>
      <div v-if="availableYears.length > 1" class="w-40">
        <select
          v-model="selectedYear"
          class="w-full px-3 py-2 border border-border rounded-lg bg-surface text-text text-s"
        >
          <option v-for="year in availableYears" :key="year" :value="year">
            {{ year }}
          </option>
        </select>
      </div>
    </Flex>

    <!-- Funding History -->
    <div v-if="historicalData.length > 0">
      <!-- Latest Month - Full Card -->
      <Card v-if="historicalData[0]" class="p-l mb-l">
        <!-- Header with month -->
        <Flex x-between y-center class="mb-l">
          <Flex y-center gap="s">
            <h3 class="text-bold text-xxxl">
              {{ historicalData[0].monthName }}
            </h3>
            <Badge variant="accent">
              Latest
            </Badge>
          </Flex>

          <!-- Total monthly funding highlight -->
          <div class="text-right">
            <div class="text-xs color-text-light mb-xs">
              Month-to-date
            </div>
            <div class="text-bold text-xxxl">
              {{ formatCurrency(historicalData[0].totalMonthly) }}
            </div>
          </div>
        </Flex>

        <!-- Funding source cards -->
        <Grid :columns="2" gap="m">
          <!-- Patreon Card -->
          <Card class="p-m">
            <Flex x-between y-start class="mb-s">
              <div class="text-s text-bold color-text-light">
                Patreon
              </div>
              <Icon name="ph:patreon-logo" size="2rem" class="color-accent" />
            </Flex>
            <div class="text-l text-bold mb-xs">
              {{ formatCurrency(historicalData[0].patreonMonthly) }}
            </div>
            <div class="text-xs color-text-light">
              {{ historicalData[0].supporterCount || 0 }} {{ historicalData[0].supporterCount === 1 ? 'patron' : 'patrons' }}
            </div>
          </Card>

          <!-- Single Donations Card -->
          <Card class="p-m">
            <Flex x-between y-start class="mb-s">
              <div class="text-s text-bold color-text-light">
                Single Donations
              </div>
              <Icon name="ph:coin-fill" size="2rem" class="color-accent" />
            </Flex>
            <div class="text-l text-bold mb-xs">
              {{ formatCurrency(historicalData[0].donationMonthly) }}
            </div>
            <div class="text-xs color-text-light">
              {{ historicalData[0].donationCount || 0 }} {{ historicalData[0].donationCount === 1 ? 'donation' : 'donations' }}
            </div>
          </Card>
        </Grid>
      </Card>

      <!-- Previous Months - Table -->
      <div v-if="historicalData.length > 1">
        <h3 class="text-bold mb-m">
          Previous Months
        </h3>
        <TableContainer>
          <Table.Root v-if="rows.length > 0" separate-cells class="mb-l table-container">
            <template #header>
              <Table.Head v-for="header in headers.filter(header => header.label !== '_original')" :key="header.label" :header />
            </template>

            <template #body>
              <tr v-for="funding in rows" :key="funding._original.month">
                <Table.Cell>
                  <span class="text-s text-bold">{{ funding.Month }}</span>
                </Table.Cell>
                <Table.Cell>
                  <Flex v-if="funding.Patreon > 0" gap="xxs" y-center>
                    <span class="text-bold text-s">{{ formatCurrency(funding.Patreon) }}</span>
                    <span class="text-xs color-text-light ml-xs">({{ funding._original.supporterCount || 0 }})</span>
                  </Flex>
                  <span v-else class="text-xs color-text-light">-</span>
                </Table.Cell>
                <Table.Cell>
                  <Flex v-if="funding.Donations > 0" gap="xxs" y-center>
                    <span class="text-bold text-s">{{ formatCurrency(funding.Donations) }}</span>
                    <span class="text-xs color-text-light ml-xs">({{ funding._original.donationCount || 0 }})</span>
                  </Flex>
                  <span v-else class="text-xs color-text-light">-</span>
                </Table.Cell>
                <Table.Cell>
                  <span class="text-s text-bold">{{ formatCurrency(funding['Monthly Total']) }}</span>
                </Table.Cell>
                <Table.Cell>
                  <Badge
                    v-if="funding.Growth !== null"
                    :variant="getGrowthIndicator(funding.Growth).variant"
                    size="s"
                  >
                    <Icon
                      :name="getGrowthIndicator(funding.Growth).icon"
                      size="0.8rem"
                    />
                    {{ getGrowthIndicator(funding.Growth).text }}
                  </Badge>
                  <span v-else class="text-xs color-text-light">-</span>
                </Table.Cell>
                <Table.Cell>
                  <span class="text-s text-bold">{{ formatCurrency(funding['Lifetime Total']) }}</span>
                </Table.Cell>
              </tr>
            </template>
          </Table.Root>
        </TableContainer>
      </div>
    </div>

    <!-- Show more message if there's more data -->
    <Card v-if="historicalData.length > 25" class="mt-m">
      <Flex x-center>
        <p class="color-text-light text-s">
          Showing recent 25 months • {{ historicalData.length - 25 }} more months available
        </p>
      </Flex>
    </Card>

    <!-- No data for selected year -->
    <Alert v-if="historicalData.length === 0" variant="info">
      No funding data available for {{ selectedYear }}
    </Alert>
  </div>

  <Alert v-else variant="info">
    No historical funding data available
  </Alert>
</template>

<style scoped>
.space-y-xs > * + * {
  margin-top: 0.25rem;
}

.w-40 {
  width: 10rem;
}

.mb-l {
  margin-bottom: var(--space-l);
}
</style>
