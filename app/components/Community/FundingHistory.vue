<script setup lang="ts">
import type { Tables } from '@/types/database.overrides'
import { Alert, Card, defineTable, Flex, Select, Table } from '@dolanske/vui'
import GrowthBadge from '@/components/Shared/GrowthBadge.vue'
import TableContainer from '@/components/Shared/TableContainer.vue'
import { formatCurrencyUnits } from '@/lib/utils/currency'
import { fullMonth } from '@/lib/utils/date'

interface SelectOption { value: number, label: string }

interface Props {
  monthlyFunding: Tables<'funding_history'>[]
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
  'Growth Value': number | null
  '_original': Tables<'funding_history'>
}

// Year filter
const selectedYear = ref<number>(new Date().getFullYear())

const selectedYearOption = computed({
  get: () => {
    const year = selectedYear.value
    return [{ value: year, label: String(year) }]
  },
  set: (options: SelectOption[] | undefined) => {
    if (options?.[0] != null)
      selectedYear.value = options[0].value
  },
})

// Get available years from data
const availableYears = computed(() => {
  const years = new Set(
    props.monthlyFunding.map(funding => new Date(`${funding.month}T00:00:00`).getFullYear()),
  )
  return [...years].toSorted((a, b) => b - a) // Most recent first
})

const yearOptions = computed(() =>
  availableYears.value.map((year: number) => ({ value: year, label: String(year) })),
)

const isCurrentYear = computed(() => selectedYear.value === new Date().getFullYear())

// Process historical data for display
const historicalData = computed(() => {
  // Filter by year if selected
  const filteredData = props.monthlyFunding.filter((funding) => {
    const year = new Date(`${funding.month}T00:00:00`).getFullYear()
    return year === selectedYear.value
  })

  return filteredData.map((funding) => {
    const month = new Date(`${funding.month}T00:00:00`)
    const totalMonthly = (funding.patreon_month_amount_cents || 0) + (funding.donation_month_amount_cents || 0)
    const totalLifetime = (funding.patreon_lifetime_amount_cents || 0) + (funding.donation_lifetime_amount_cents || 0)

    return {
      ...funding,
      monthName: fullMonth(month),
      shortMonthName: new Intl.DateTimeFormat(undefined, { month: 'short', year: 'numeric' }).format(month),
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

function normalizeToDisplayedEuros(amountCents: number) {
  // Match formatCurrency default rounding (whole-unit display)
  return Math.round(amountCents / 100)
}

// Transform data for table (previous months only)
const transformedTableData = computed<TransformedFunding[]>(() => {
  const startIndex = isCurrentYear.value ? 1 : 0
  if (historicalData.value.length <= startIndex)
    return []

  return historicalData.value.slice(startIndex, startIndex + 24).map((funding, index) => {
    const growth = getGrowthFromPrevious(funding.totalMonthly, index + startIndex)
    const previousTotal = historicalData.value[index + startIndex + 1]?.totalMonthly ?? null
    const growthValue = previousTotal !== null ? normalizeToDisplayedEuros(funding.totalMonthly) - normalizeToDisplayedEuros(previousTotal) : null

    return {
      'Month': funding.shortMonthName,
      'Patreon': funding.patreonMonthly,
      'Donations': funding.donationMonthly,
      'Monthly Total': funding.totalMonthly,
      'Growth': growth,
      'Growth Value': growthValue,
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
  const currentDisplay = normalizeToDisplayedEuros(currentAmount)
  const previousDisplay = normalizeToDisplayedEuros(previousAmount)

  if (previousDisplay === 0)
    return null

  const growth = ((currentDisplay - previousDisplay) / previousDisplay) * 100
  return growth
}
</script>

<template>
  <Flex v-if="historicalData.length > 0 || props.monthlyFunding.length > 0" expand>
    <!-- Funding History -->
    <Flex v-if="historicalData.length > 0" column gap="s" expand>
      <!-- Previous Months - Table -->
      <Flex
        v-if="isCurrentYear ? historicalData.length > 1 : historicalData.length > 0" column expand gap="s"
      >
        <Flex x-between y-center expand>
          <h3 class="section-title">
            Previous Months
          </h3>
          <Select
            v-if="availableYears.length > 1"
            v-model="selectedYearOption"
            size="s"
            :options="yearOptions"
            single
            class="funding-history__year-select"
          />
        </Flex>
        <TableContainer e>
          <Table.Root v-if="rows.length > 0" separate-cells class="table-container">
            <template #header>
              <Table.Head v-for="header in headers.filter(header => header.label !== '_original' && header.label !== 'Growth Value')" :key="header.label" :header />
            </template>

            <template #body>
              <tr v-for="funding in rows" :key="funding._original.month">
                <Table.Cell>
                  <span class="text-s text-bold">{{ funding.Month }}</span>
                </Table.Cell>
                <Table.Cell>
                  <Flex v-if="funding.Patreon > 0" gap="xxs" y-center>
                    <span class="text-bold text-s">{{ formatCurrency(funding.Patreon) }}</span>
                    <span class="text-xs text-color-light ml-xs">({{ funding._original.patreon_count || 0 }})</span>
                  </Flex>
                  <span v-else class="text-xs text-color-light">-</span>
                </Table.Cell>
                <Table.Cell>
                  <Flex v-if="funding.Donations > 0" gap="xxs" y-center>
                    <span class="text-bold text-s">{{ formatCurrency(funding.Donations) }}</span>
                    <span class="text-xs text-color-light ml-xs">({{ funding._original.donation_count || 0 }})</span>
                  </Flex>
                  <span v-else class="text-xs text-color-light">-</span>
                </Table.Cell>
                <Table.Cell>
                  <span class="text-s text-bold">{{ formatCurrency(funding['Monthly Total']) }}</span>
                </Table.Cell>
                <Table.Cell>
                  <GrowthBadge :growth="funding.Growth" :value="funding['Growth Value'] !== null ? (funding['Growth Value'] > 0 ? `+${formatCurrencyUnits(funding['Growth Value'])}` : formatCurrencyUnits(funding['Growth Value'])) : null" show-icon />
                  <span v-if="funding.Growth === null" class="text-xs text-color-light">-</span>
                </Table.Cell>
                <Table.Cell>
                  <span class="text-s text-bold">{{ formatCurrency(funding['Lifetime Total']) }}</span>
                </Table.Cell>
              </tr>
            </template>
          </Table.Root>
        </TableContainer>
      </Flex>
    </Flex>

    <!-- Show more message if there's more data -->
    <Card v-if="historicalData.length > 25" class="mt-m">
      <Flex x-center>
        <p class="text-color-light text-s">
          Showing recent 25 months • {{ historicalData.length - 25 }} more months available
        </p>
      </Flex>
    </Card>

    <!-- No data for selected year -->
    <Alert v-if="historicalData.length === 0" variant="info">
      No funding data available for {{ selectedYear }}
    </Alert>
  </Flex>

  <Alert v-else variant="info">
    No historical funding data available
  </Alert>
</template>

<style scoped lang="scss">
.funding-history__header {
  margin-bottom: var(--space-l);
}

.funding-history__year-select {
  width: 8rem;
}
</style>
