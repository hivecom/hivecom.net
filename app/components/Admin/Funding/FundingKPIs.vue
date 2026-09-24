<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import { useDataMonthlyFunding } from '@/composables/useDataMonthlyFunding'
import { formatCurrency } from '@/lib/utils/currency'
import KPICard from '../KPICard.vue'
import KPIContainer from '../KPIContainer.vue'

const refreshSignal = defineModel<number>('refreshSignal')

const metrics = ref({
  currentMonthFunding: 0,
  currentMonthExpenses: 0,
  lifetimeFunding: 0,
  totalPatrons: 0,
})

const loading = ref(true)
const errorMessage = ref('')

const supabase = useSupabaseClient()

const { latestFunding, loading: fundingLoading, error: fundingError } = useDataMonthlyFunding()

async function fetchFundingMetrics() {
  loading.value = true
  errorMessage.value = ''

  try {
    const { data: expensesData, error: expensesError } = await supabase
      .from('funding_expenses')
      .select('amount_cents')
      .is('ended_at', null)
      .lte('started_at', new Date().toISOString())

    if (expensesError) {
      throw expensesError
    }

    const currentMonthExpenses = expensesData?.reduce((sum, expense) => sum + expense.amount_cents, 0) || 0

    metrics.value = {
      ...metrics.value,
      currentMonthExpenses,
    }
  }
  catch (error: unknown) {
    errorMessage.value = error instanceof Error ? error.message : 'Failed to fetch funding metrics'
  }
  finally {
    loading.value = false
  }
}

watch([latestFunding, fundingLoading], () => {
  if (fundingError.value) {
    errorMessage.value = fundingError.value
    return
  }

  const currentFundingData = latestFunding.value

  metrics.value = {
    ...metrics.value,
    currentMonthFunding: currentFundingData
      ? (currentFundingData.patreon_month_amount_cents || 0) + (currentFundingData.donation_month_amount_cents || 0)
      : 0,
    lifetimeFunding: (currentFundingData?.patreon_lifetime_amount_cents || 0)
      + (currentFundingData?.donation_lifetime_amount_cents || 0),
    totalPatrons: currentFundingData?.patreon_count || 0,
  }
}, { immediate: true })

const fundingBalance = computed(() => {
  return metrics.value.lifetimeFunding
})

watch(() => refreshSignal.value, () => {
  fetchFundingMetrics()
})

onBeforeMount(fetchFundingMetrics)
</script>

<template>
  <KPIContainer>
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
  </KPIContainer>
</template>

<style scoped lang="scss">

</style>
