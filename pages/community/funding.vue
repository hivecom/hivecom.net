<script setup lang="ts">
import type { Tables } from '~/types/database.types'
import { Alert, Badge, Card, Checkbox, Divider, Flex, Grid, Progress, Skeleton } from '@dolanske/vui'
import FundingHistory from '~/components/Community/FundingHistory.vue'
import SupportCTA from '~/components/Community/SupportCTA.vue'
import constants from '~/constants.json'

// Data setup
const supabase = useSupabaseClient()
const loading = ref(true)
const errorMessage = ref('')

// Funding data
const monthlyFunding = ref<Tables<'monthly_funding'>[]>([])
const expenses = ref<Tables<'expenses'>[]>([])
const currentFunding = ref<Tables<'monthly_funding'> | null>(null)

// UI state
const showPastExpenses = ref(false)

// Fetch data on mount
onMounted(async () => {
  loading.value = true

  try {
    // Fetch current and historical monthly funding data
    const { data: fundingData, error: fundingError } = await supabase
      .from('monthly_funding')
      .select('*')
      .order('month', { ascending: false })

    if (fundingError)
      throw fundingError

    monthlyFunding.value = fundingData || []
    currentFunding.value = fundingData?.[0] || null

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

// Calculate total monthly expenses
const monthlyExpenses = computed(() => {
  if (!expenses.value.length)
    return 0

  // Sum all active expenses (ongoing monthly costs)
  return expenses.value
    .filter(expense => !expense.ended_at)
    .reduce((sum, expense) => sum + expense.amount_cents, 0)
})

// Calculate current month's funding progress
const fundingProgress = computed(() => {
  if (!currentFunding.value)
    return { percentage: 0, current: 0, goal: monthlyExpenses.value }

  const current = (currentFunding.value.patreon_month_amount_cents || 0) + (currentFunding.value.donation_month_amount_cents || 0)
  const goal = monthlyExpenses.value || 1 // Use actual expenses as goal, avoid division by zero
  const percentage = goal > 0 ? Math.min((current / goal) * 100, 100) : 0

  return { percentage, current, goal }
})

// Get supporter count
const supporterCount = computed(() => {
  return currentFunding.value?.patreon_count || 0
})

// Format currency helper
function formatCurrency(cents: number): string {
  return `€${(cents / 100).toFixed(0)}`
}

// Calculate funding vs expenses balance
const fundingBalance = computed(() => {
  return fundingProgress.value.current - monthlyExpenses.value
})

const balanceStatus = computed(() => {
  if (fundingBalance.value > 0)
    return 'positive'
  if (fundingBalance.value === 0)
    return 'neutral'
  return 'negative'
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

// Format date range helper
function formatDateRange(startDate: string, endDate?: string | null): string {
  const start = new Date(startDate).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
  if (endDate) {
    const end = new Date(endDate).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
    return `From ${start} to ${end}`
  }
  return `From ${start} to present`
}
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

        <Card :class="{ 'funding-progress__complete': fundingProgress.percentage >= 100 }">
          <Flex y-center x-between class="mb-s">
            <Flex y-center gap="s">
              <h3 class="text-bold text-xxxl">
                Monthly Funding
              </h3>
              <Badge v-if="supporterCount > 0" variant="accent">
                {{ supporterCount }} supporters
              </Badge>
            </Flex>
            <Flex y-center gap="s">
              <strong class="text-bold text-xxxl">{{ formatCurrency(fundingProgress.current) }}</strong>
              <span class="color-text-light text-xxxl">/</span>
              <strong class="color-text-light text-xxxl">{{ formatCurrency(fundingProgress.goal) }}</strong>
            </Flex>
          </Flex>

          <Progress
            class="mb-m"
            :height="8"
            :model-value="fundingProgress.percentage"
          />

          <!-- Funding vs Expenses Summary -->
          <Flex x-between y-center class="mt-s">
            <div>
              <p
                class="text-s" :class="{
                  'color-success': balanceStatus === 'positive',
                  'color-warning': balanceStatus === 'neutral',
                  'color-error': balanceStatus === 'negative',
                }"
              >
                <template v-if="balanceStatus === 'positive'">
                  We have a surplus of {{ formatCurrency(Math.abs(fundingBalance)) }} this month!
                </template>
                <template v-else-if="balanceStatus === 'negative'">
                  We still need {{ formatCurrency(Math.abs(fundingBalance)) }} to reach this month's goal!
                </template>
                <template v-else>
                  We've reached our monthly goal!
                </template>
              </p>
            </div>

            <NuxtLink :to="constants.PATREON.URL" external target="_blank">
              <Badge variant="accent">
                <Icon name="ph:heart" size="1.4rem" />
                Support Us
              </Badge>
            </NuxtLink>
          </Flex>
        </Card>
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
          <!-- Total expenses summary moved to top -->
          <Card class="mb-l">
            <Flex x-between y-center>
              <div>
                <h3 class="text-bold">
                  Total Monthly Expenses
                </h3>
                <p class="color-text-light">
                  Current active expenses
                </p>
              </div>
              <div class="text-right">
                <div class="text-xxxl text-bold">
                  {{ formatCurrency(monthlyExpenses) }}
                </div>
                <div class="text-s color-text-light">
                  per month
                </div>
              </div>
            </Flex>
          </Card>

          <Grid :columns="2" gap="l">
            <Card v-for="expense in filteredExpenses.slice(0, 6)" :key="expense.id">
              <Flex column gap="s">
                <!-- Header with name and amount -->
                <Flex x-between y-center>
                  <h4 class="text-bold">
                    {{ expense.name || 'Unnamed Expense' }}
                  </h4>
                  <Badge :variant="!expense.ended_at ? 'success' : 'neutral'">
                    {{ !expense.ended_at ? 'Active' : 'Ended' }}
                  </Badge>
                </Flex>

                <!-- Amount -->
                <div>
                  <span class="text-l text-bold">{{ formatCurrency(expense.amount_cents) }}</span>
                  <span class="color-text-light text-s">/month</span>
                </div>

                <!-- Description -->
                <p v-if="expense.description" class="color-text-light text-s">
                  {{ expense.description }}
                </p>

                <!-- Date info -->
                <div class="text-xs color-text-light">
                  {{ formatDateRange(expense.started_at, expense.ended_at) }}
                </div>
              </Flex>
            </Card>
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
        <SupportCTA :supporter-count="supporterCount" />
      </section>
    </template>
  </div>
</template>

<style lang="scss" scoped>
.funding-progress__complete {
  border: 1px solid var(--color-accent);
}
</style>
