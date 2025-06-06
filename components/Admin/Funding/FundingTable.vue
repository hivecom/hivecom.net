<script setup lang="ts">
import type { Tables } from '~/types/database.types'
import { Alert, Badge, defineTable, Flex, Pagination, Table } from '@dolanske/vui'
import { computed, onBeforeMount, ref } from 'vue'

import TimestampDate from '@/components/Shared/TimestampDate.vue'
import TableContainer from '~/components/Shared/TableContainer.vue'
import FundingDetails from './FundingDetails.vue'
import FundingFilters from './FundingFilters.vue'
import { formatCurrency } from '~/utils/currency'

// Monthly funding table type
interface MonthlyFunding extends Tables<'monthly_funding'> {}

// Define transformed funding data interface
interface TransformedFunding {
  'Month': string
  'Patreon Amount': string
  'Donation Amount': string
  'Total Monthly': string
  '_patronCount': number
  '_donationCount': number
  '_original': MonthlyFunding
}

// Define model value for refresh signal to parent
const refreshSignal = defineModel<number>('refreshSignal', { default: 0 })

// Setup client and state
const supabase = useSupabaseClient()
const loading = ref(true)
const errorMessage = ref('')
const monthlyFundings = ref<MonthlyFunding[]>([])
const search = ref('')

// Funding details state
const showFundingDetails = ref(false)
const selectedFunding = ref<MonthlyFunding | null>(null)

// Filtered and transformed funding data
const transformedFundings = computed<TransformedFunding[]>(() => {
  let filteredData = monthlyFundings.value

  if (search.value) {
    const searchTerm = search.value.toLowerCase()
    filteredData = monthlyFundings.value.filter(funding =>
      formatMonth(funding.month).toLowerCase().includes(searchTerm),
    )
  }

  // Sort by date (month field) in descending order by default
  filteredData = filteredData.sort((a, b) => {
    const dateA = new Date(`${a.month}T00:00:00Z`)
    const dateB = new Date(`${b.month}T00:00:00Z`)
    return dateB.getTime() - dateA.getTime() // Descending order (newest first)
  })

  return filteredData.map(funding => ({
    'Month': `${funding.month}-01T00:00:00Z`, // Convert YYYY-MM to full date for TimestampDate
    'Patreon Amount': formatCurrency(funding.patreon_month_amount_cents || 0),
    'Donation Amount': formatCurrency(funding.donation_month_amount_cents || 0),
    'Total Monthly': formatCurrency((funding.patreon_month_amount_cents || 0) + (funding.donation_month_amount_cents || 0)),
    '_patronCount': funding.patreon_count || 0,
    '_donationCount': funding.donation_count || 0,
    '_original': funding,
  }))
})

// Table configuration
const { headers, rows, pagination, setPage, setSort } = defineTable(transformedFundings, {
  pagination: {
    enabled: true,
    perPage: 10,
  },
  select: false,
})

// Note: We pre-sort data by date in transformedFundings computed property

// Fetch monthly funding data
async function fetchMonthlyFundings() {
  loading.value = true
  errorMessage.value = ''

  try {
    const { data, error } = await supabase
      .from('monthly_funding')
      .select('*')
      .order('month', { ascending: false })

    if (error)
      throw error

    monthlyFundings.value = data as MonthlyFunding[] || []
    // Increment the refresh signal to notify the parent
    refreshSignal.value = (refreshSignal.value || 0) + 1
  }
  catch (error: any) {
    errorMessage.value = error.message || 'An error occurred while loading funding data'
  }
  finally {
    loading.value = false
  }
}

// View funding details
function viewFundingDetails(funding: MonthlyFunding) {
  selectedFunding.value = funding
  showFundingDetails.value = true
}

// Lifecycle hooks
onBeforeMount(fetchMonthlyFundings)
</script>

<template>
  <!-- Error message -->
  <Alert v-if="errorMessage" variant="danger">
    {{ errorMessage }}
  </Alert>

  <!-- Loading state -->
  <Alert v-else-if="loading" variant="info">
    Loading funding data...
  </Alert>

  <Flex v-else gap="s" column expand>
    <!-- Header and filters -->
    <Flex x-between expand>
      <FundingFilters v-model:search="search" />
    </Flex>

    <!-- Table -->
    <TableContainer>
      <Table.Root v-if="rows.length > 0" separate-cells :loading="loading" class="mb-l">
        <template #header>
          <Table.Head v-for="header in headers.filter(header => header.label !== '_original' && header.label !== '_patronCount' && header.label !== '_donationCount')" :key="header.label" sort :header />
        </template>

        <template #body>
          <tr v-for="funding in rows" :key="funding._original.month" class="clickable-row" @click="viewFundingDetails(funding._original)">
            <Table.Cell>
              <TimestampDate :date="`${funding._original.month}T00:00:00+00:00`" format="MMMM YYYY" />
            </Table.Cell>
            <Table.Cell>
              <Badge v-if="funding['Patreon Amount'] !== '€0'" variant="success">
                {{ funding['Patreon Amount'] }}
                <span v-if="funding['_patronCount'] > 0" class="text-xs color-text-light ml-xs">({{ funding['_patronCount'] }})</span>
              </Badge>
              <span v-else class="color-text-light">-</span>
            </Table.Cell>
            <Table.Cell>
              <Badge v-if="funding['Donation Amount'] !== '€0'" variant="info">
                {{ funding['Donation Amount'] }}
                <span v-if="funding['_donationCount'] > 0" class="text-xs color-text-light ml-xs">({{ funding['_donationCount'] }})</span>
              </Badge>
              <span v-else class="color-text-light">-</span>
            </Table.Cell>
            <Table.Cell>
              <strong>{{ funding['Total Monthly'] }}</strong>
            </Table.Cell>
          </tr>
        </template>

        <template v-if="transformedFundings.length > 10" #pagination>
          <Pagination :pagination="pagination" @change="setPage" />
        </template>
      </Table.Root>

      <!-- No results message -->
      <Alert v-else-if="!loading" variant="info">
        No funding records found
      </Alert>
    </TableContainer>

    <!-- Funding Detail Sheet -->
    <FundingDetails
      v-model:is-open="showFundingDetails"
      :funding="selectedFunding"
    />
  </Flex>
</template>

<style scoped>
.mb-l {
  margin-bottom: var(--space-l);
}
.clickable-row:hover {
  td {
    cursor: pointer;
    background-color: var(--color-bg-raised);
  }
}
td {
  vertical-align: middle;
}
</style>
