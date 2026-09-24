<script setup lang="ts">
import type { Ref } from 'vue'
import type { Tables } from '@/types/database.overrides'
import { Alert, Badge, defineTable, Flex, Pagination, Table } from '@dolanske/vui'
import { computed, inject, ref, watch } from 'vue'
import TableSkeleton from '@/components/Admin/Shared/TableSkeleton.vue'

import TableContainer from '@/components/Shared/TableContainer.vue'
import TimestampDate from '@/components/Shared/TimestampDate.vue'
import { useDataMonthlyFunding } from '@/composables/useDataMonthlyFunding'
import { useBreakpoint } from '@/lib/mediaQuery'
import { getRouteQueryString } from '@/lib/utils/common'
import { formatCurrency } from '@/lib/utils/currency'
import { fullMonth } from '@/lib/utils/date'
import FundingDetails from './FundingDetails.vue'
import FundingFilters from './FundingFilters.vue'

interface MonthlyFunding extends Tables<'funding_history'> {}

interface TransformedFunding {
  'Month': string
  'Patreon Amount': string
  'Donation Amount': string
  'Total Monthly': string
  '_patronCount': number
  '_donationCount': number
  '_original': MonthlyFunding
}

const refreshSignal = defineModel<number>('refreshSignal', { default: 0 })

// Track the last value we ourselves emitted so the re-fetch watcher can ignore our own bumps
const lastSelfEmittedSignal = ref(-1)
const route = useRoute()
const router = useRouter()

const loading = ref(true)
const errorMessage = ref('')
const monthlyFundings = ref<MonthlyFunding[]>([])
const search = ref('')

const { allFunding, loading: fundingLoading, error: fundingError, refresh: refreshFunding } = useDataMonthlyFunding()

const showFundingDetails = ref(false)
const selectedFunding = ref<MonthlyFunding | null>(null)

const focusedFundingMonth = computed(() => {
  const fundingQuery = route.query.funding
  const rawValue = getRouteQueryString(fundingQuery)
  return rawValue || null
})

const adminTablePerPage = inject<Ref<number>>('adminTablePerPage', computed(() => 10))

const transformedFundings = computed<TransformedFunding[]>(() => {
  let filteredData = monthlyFundings.value

  if (search.value) {
    const searchTerm = search.value.toLowerCase()
    filteredData = monthlyFundings.value.filter(funding =>
      fullMonth(funding.month).toLowerCase().includes(searchTerm),
    )
  }

  filteredData = filteredData.sort((a, b) => {
    const dateA = new Date(`${a.month}T00:00:00Z`)
    const dateB = new Date(`${b.month}T00:00:00Z`)
    return dateB.getTime() - dateA.getTime()
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

const totalCount = computed(() => monthlyFundings.value.length)
const filteredCount = computed(() => transformedFundings.value.length)
const isFiltered = computed(() => Boolean(search.value))

const isBelowMedium = useBreakpoint('<m')

const { headers, rows, pagination, setPage, options } = defineTable(transformedFundings, {
  pagination: {
    enabled: true,
    perPage: adminTablePerPage.value,
  },
  select: false,
})

watch(adminTablePerPage, (perPage) => {
  options.value.pagination.perPage = perPage
  setPage(1)
})

// allFunding is already ordered month descending.
watch([allFunding, fundingLoading, fundingError], () => {
  if (fundingError.value) {
    errorMessage.value = fundingError.value
    loading.value = false
    return
  }

  if (!fundingLoading.value) {
    monthlyFundings.value = allFunding.value as MonthlyFunding[]
    loading.value = false

    // Tell the parent charts the data is ready. Tracked so the re-fetch watcher ignores it.
    const next = (refreshSignal.value || 0) + 1
    lastSelfEmittedSignal.value = next
    refreshSignal.value = next
  }
}, { immediate: true })

// View funding details
function viewFundingDetails(funding: MonthlyFunding) {
  selectedFunding.value = funding
  showFundingDetails.value = true
}

function openFundingByMonth(fundingMonth: string | null): boolean {
  if (!fundingMonth)
    return false

  const match = monthlyFundings.value.find((funding: MonthlyFunding) => funding.month === fundingMonth)

  if (!match)
    return false

  viewFundingDetails(match)
  return true
}

// Sync funding query params with details sheet state
watch(showFundingDetails, (isOpen) => {
  if (isOpen && selectedFunding.value) {
    const nextQuery = {
      ...route.query,
      funding: selectedFunding.value.month,
    }
    router.replace({ query: nextQuery })
    return
  }
  if (isOpen)
    return
  if (!route.query.funding)
    return

  const { funding, ...rest } = route.query
  router.replace({ query: rest })
})

watch(
  () => [focusedFundingMonth.value, loading.value] as const,
  ([fundingMonth, isLoading]) => {
    if (isLoading)
      return
    if (!fundingMonth)
      return

    openFundingByMonth(fundingMonth)
  },
  { immediate: true },
)

// An external bump busts the cache and re-fetches. Bumps we emitted ourselves are ignored.
watch(() => refreshSignal.value, (sig, prev) => {
  if (prev != null && sig !== prev && sig !== lastSelfEmittedSignal.value) {
    void refreshFunding()
  }
})
</script>

<template>
  <Alert v-if="errorMessage" variant="danger">
    {{ errorMessage }}
  </Alert>

  <template v-else-if="loading">
    <Flex gap="s" column expand>
      <Flex :column="isBelowMedium" :x-between="!isBelowMedium" :x-start="isBelowMedium" y-center gap="s" expand>
        <Flex gap="s" y-center wrap :expand="isBelowMedium" :x-center="isBelowMedium">
          <FundingFilters v-model:search="search" />
        </Flex>

        <Flex :x-end="!isBelowMedium" :x-center="isBelowMedium" :x-start="isBelowMedium" :expand="isBelowMedium" :y-center="!isBelowMedium" :y-start="isBelowMedium">
          <span class="text-color-lighter text-s" :class="{ 'text-center': isBelowMedium }">Total -</span>
        </Flex>
      </Flex>

      <TableSkeleton
        :columns="4"
        :rows="10"
        :show-actions="false"
      />
    </Flex>
  </template>

  <Flex v-else gap="s" column expand>
    <Flex :column="isBelowMedium" :x-between="!isBelowMedium" :x-start="isBelowMedium" y-center gap="s" expand>
      <Flex gap="s" y-center wrap :expand="isBelowMedium" :x-center="isBelowMedium">
        <FundingFilters v-model:search="search" />
      </Flex>

      <Flex :x-end="!isBelowMedium" :x-center="isBelowMedium" :expand="isBelowMedium" :y-center="!isBelowMedium" :y-start="isBelowMedium">
        <span class="text-color-lighter text-s" :class="{ 'text-center': isBelowMedium }">
          {{ isFiltered ? `Filtered ${filteredCount}` : `Total ${totalCount}` }}
        </span>
      </Flex>
    </Flex>

    <TableContainer>
      <Table.Root v-if="rows.length > 0" separate-cells :loading="loading" class="mb-l">
        <template #header>
          <Table.Head v-for="header in headers.filter(header => header.label !== '_original' && header.label !== '_patronCount' && header.label !== '_donationCount')" :key="header.label" sort :header />
        </template>

        <template #body>
          <tr v-for="funding in rows" :key="funding._original.month" class="clickable-row" @click="viewFundingDetails(funding._original)">
            <Table.Cell>
              <TimestampDate :date="`${funding._original.month}T00:00:00+00:00`" type="fullMonth" />
            </Table.Cell>
            <Table.Cell>
              <Badge v-if="(funding._original.patreon_month_amount_cents || 0) > 0" variant="success">
                {{ funding['Patreon Amount'] }}
                <span v-if="funding._patronCount > 0" class="text-xs text-color-light ml-xs">({{ funding._patronCount }})</span>
              </Badge>
              <span v-else class="text-color-light">-</span>
            </Table.Cell>
            <Table.Cell>
              <Badge v-if="(funding._original.donation_month_amount_cents || 0) > 0" variant="info">
                {{ funding['Donation Amount'] }}
                <span v-if="funding._donationCount > 0" class="text-xs text-color-light ml-xs">({{ funding._donationCount }})</span>
              </Badge>
              <span v-else class="text-color-light">-</span>
            </Table.Cell>
            <Table.Cell>
              <strong>{{ funding['Total Monthly'] }}</strong>
            </Table.Cell>
          </tr>
        </template>

        <template v-if="transformedFundings.length > adminTablePerPage" #pagination>
          <Pagination :pagination="pagination" @change="setPage" />
        </template>
      </Table.Root>

      <Alert v-else-if="!loading" variant="info">
        No funding records found
      </Alert>
    </TableContainer>

    <FundingDetails
      v-model:is-open="showFundingDetails"
      :funding="selectedFunding"
    />
  </Flex>
</template>

<style scoped lang="scss">
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
