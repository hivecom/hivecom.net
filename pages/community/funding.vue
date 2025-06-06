<script setup lang="ts">
import type { Tables } from '~/types/database.types'
import { Alert, Checkbox, Divider, Flex, Grid, Skeleton } from '@dolanske/vui'
import ExpenseCard from '~/components/Community/ExpenseCard.vue'
import FundingHistory from '~/components/Community/FundingHistory.vue'
import FundingProgress from '~/components/Community/FundingProgress.vue'
import SupportCTA from '~/components/Community/SupportCTA.vue'
import { formatCurrency } from '~/utils/currency'

// Data setup
const supabase = useSupabaseClient()
const loading = ref(true)
const errorMessage = ref('')

// Funding data
const monthlyFunding = ref<Tables<'monthly_funding'>[]>([])
const expenses = ref<Tables<'expenses'>[]>([])

// UI state
const showPastExpenses = ref(false)

// Fetch data on mount
onMounted(async () => {
  loading.value = true

  try {
    // Fetch monthly funding data for history
    const { data: fundingData, error: fundingError } = await supabase
      .from('monthly_funding')
      .select('*')
      .order('month', { ascending: false })

    if (fundingError)
      throw fundingError

    monthlyFunding.value = fundingData || []

    // Fetch expenses data
    const { data: expensesData, error: expensesError } = await supabase
      .from('expenses')
      .select('*')
      .order('started_at', { ascending: false })

    if (expensesError)
      throw expensesError

    expenses.value = expensesData || []
  }
  catch (error: any) {
    errorMessage.value = error.message || 'Failed to load funding data'
  }
  finally {
    loading.value = false
  }
})

// Filtered expenses based on checkbox
const filteredExpenses = computed(() => {
  if (showPastExpenses.value) {
    return expenses.value
  }
  else {
    return expenses.value.filter(expense => !expense.ended_at)
  }
})
</script>

<template>
  <div class="page">
    <!-- Hero section -->
    <section>
      <h1>Funding</h1>
      <p>Discover how we are funded, how you can support us and where your contributions go.</p>
    </section>

    <Divider />

    <!-- Loading state -->
    <section v-if="loading" class="mt-xl">
      <Flex column gap="l">
        <Skeleton :width="300" :height="32" :radius="8" />
        <Skeleton :height="120" :radius="8" />
        <Skeleton :width="250" :height="32" :radius="8" class="mt-l" />
        <Grid :columns="2" gap="l">
          <Skeleton :height="100" :radius="8" />
          <Skeleton :height="100" :radius="8" />
        </Grid>
      </Flex>
    </section>

    <!-- Error state -->
    <section v-else-if="errorMessage" class="mt-xl">
      <Alert variant="danger">
        {{ errorMessage }}
      </Alert>
    </section>

    <!-- Main content -->
    <template v-else>
      <!-- Current Funding Progress -->
      <section class="mt-xl">
        <h2 class="mb-l text-xxxl text-bold">
          Current Funding
        </h2>

        <FundingProgress />
      </section>

      <!-- Expenses Breakdown -->
      <section class="mt-xl">
        <Flex x-between y-center class="mb-l">
          <h2>
            Monthly Expenses
          </h2>
          <Checkbox v-model="showPastExpenses" label="Show past expenses" />
        </Flex>

        <div v-if="expenses.length > 0">
          <Grid :columns="2" gap="l" class="expenses-grid">
            <ExpenseCard
              v-for="expense in filteredExpenses.slice(0, 6)"
              :key="expense.id"
              :expense="expense"
            />
          </Grid>
        </div>

        <Alert v-else variant="info">
          No expense data available
        </Alert>
      </section>

      <!-- Historical Funding -->
      <section class="mt-xl">
        <FundingHistory :monthly-funding="monthlyFunding" :format-currency="formatCurrency" />
      </section>

      <!-- Support Information -->
      <section class="mt-xl">
        <SupportCTA />
      </section>
    </template>
  </div>
</template>

<style lang="scss" scoped>
@use '@/assets/breakpoints.scss' as *;

.funding-progress__complete {
  border: 1px solid var(--color-accent);
}

// Responsive grid for expenses
.expenses-grid {
  // Ensure cards stretch to fill grid height
  align-items: stretch;

  @media screen and (max-width: $breakpoint-sm) {
    grid-template-columns: 1fr !important;
  }

  .vui-card {
    height: 100%;
    display: flex;
    flex-direction: column;
  }
}
</style>
