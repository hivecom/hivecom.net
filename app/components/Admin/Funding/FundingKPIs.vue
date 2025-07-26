<script setup lang="ts">
import { Flex } from '@dolanske/vui'
import { computed, ref, watch } from 'vue'

import { formatCurrency } from '@/lib/utils/currency'
import KPICard from '../KPICard.vue'

const refreshSignal = defineModel<number>('refreshSignal')

// Funding metrics
const metrics = ref({
  currentMonthFunding: 0,
  currentMonthExpenses: 0,
  lifetimeFunding: 0,
  totalPatrons: 0,
})

// Data fetch state
const loading = ref(true)
const errorMessage = ref('')

// Get Supabase client
const supabase = useSupabaseClient()

// Fetch funding metrics
async function fetchFundingMetrics() {
  loading.value = true
  errorMessage.value = ''

  try {
    // Get current month's funding data
    const { data: currentFundingData, error: fundingError } = await supabase
      .from('monthly_funding')
      .select('*')
      .order('month', { ascending: false })
      .limit(1)
      .single()

    if (fundingError && fundingError.code !== 'PGRST116') {
      throw fundingError
    }

    // Get current active expenses (started and not ended)
    const { data: expensesData, error: expensesError } = await supabase
      .from('expenses')
      .select('amount_cents')
      .is('ended_at', null)
      .lte('started_at', new Date().toISOString())

    if (expensesError) {
      throw expensesError
    }

    // Get total funding records count
    const { error: countError } = await supabase
      .from('monthly_funding')
      .select('*', { count: 'exact', head: true })

    if (countError) {
      throw countError
    }

    // Calculate metrics
    const currentMonthFunding = currentFundingData
      ? (currentFundingData.patreon_month_amount_cents || 0) + (currentFundingData.donation_month_amount_cents || 0)
      : 0

    const lifetimeFunding = (currentFundingData?.patreon_lifetime_amount_cents || 0)
      + (currentFundingData?.donation_lifetime_amount_cents || 0)

    const currentMonthExpenses = expensesData?.reduce((sum, expense) => sum + expense.amount_cents, 0) || 0
    const totalPatrons = currentFundingData?.patreon_count || 0

    metrics.value = {
      currentMonthFunding,
      currentMonthExpenses,
      lifetimeFunding,
      totalPatrons,
    }
  }
  catch (error: unknown) {
    errorMessage.value = error instanceof Error ? error.message : 'Failed to fetch funding metrics'
  }
  finally {
    loading.value = false
  }
}

// Calculate funding balance
const fundingBalance = computed(() => {
  return metrics.value.lifetimeFunding
})

// Watch for refresh signal from parent
watch(() => refreshSignal.value, () => {
  fetchFundingMetrics()
})

// Fetch data on component mount
onBeforeMount(fetchFundingMetrics)
</script>

<template>
  <Flex gap="m" class="kpi-container" expand>
    <KPICard
      label="Current Month"
      :value="formatCurrency(metrics.currentMonthFunding)"
      icon="ph:coins"
      :variant="metrics.currentMonthFunding >= metrics.currentMonthExpenses ? 'success' : 'danger'"
      :is-loading="loading"
    />

    <KPICard
      label="Monthly Expenses"
      :value="`${formatCurrency(metrics.currentMonthExpenses)}`"
      icon="ph:money"
      variant="warning"
      :is-loading="loading"
    />

    <KPICard
      label="Lifetime Funding"
      :value="formatCurrency(fundingBalance)"
      icon="ph:chart-line"
      :is-loading="loading"
    />

    <KPICard
      label="Active Patrons"
      :value="metrics.totalPatrons"
      icon="ph:users"
      variant="primary"
      :is-loading="loading"
    />
  </Flex>
</template>

<style scoped lang="scss">

</style>
