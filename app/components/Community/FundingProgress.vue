<script setup lang="ts">
import type { Tables } from '@/types/database.types'
import { Badge, Card, Flex, Progress, Skeleton } from '@dolanske/vui'
import constants from '~~/constants.json'
import { formatCurrency } from '@/lib/utils/currency'

// Data setup
const supabase = useSupabaseClient()
const loading = ref(true)
const errorMessage = ref('')

// Check if we're on the funding page
const route = useRoute()
const isOnFundingPage = computed(() => route.path === '/community/funding')

// Funding data
const currentFunding = ref<Tables<'monthly_funding'> | null>(null)
const monthlyExpenses = ref(0)

// Fetch funding data
onMounted(async () => {
  try {
    // Fetch current month's funding data
    const { data: fundingData, error: fundingError } = await supabase
      .from('monthly_funding')
      .select('*')
      .order('month', { ascending: false })
      .limit(1)
      .single()

    if (fundingError && fundingError.code !== 'PGRST116') // Ignore "no rows" error
      throw fundingError

    currentFunding.value = fundingData

    // Fetch current active expenses to calculate goal (started and not ended)
    const { data: expensesData, error: expensesError } = await supabase
      .from('expenses')
      .select('amount_cents')
      .is('ended_at', null) // Only active expenses
      .lte('started_at', new Date().toISOString()) // Only expenses that have started

    if (expensesError)
      throw expensesError

    // Calculate total monthly expenses
    monthlyExpenses.value = expensesData?.reduce((sum, expense) => sum + expense.amount_cents, 0) || 0
  }
  catch (error: unknown) {
    errorMessage.value = (error as Error).message || 'Failed to load funding data'
  }
  finally {
    loading.value = false
  }
})

// Calculate funding progress
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

// Calculate funding balance and status
const fundingBalance = computed(() => {
  return fundingProgress.value.current - fundingProgress.value.goal
})

const balanceStatus = computed(() => {
  if (fundingBalance.value > 0)
    return 'positive'
  if (fundingBalance.value === 0)
    return 'neutral'
  return 'negative'
})

const statusMessage = computed(() => {
  if (balanceStatus.value === 'positive') {
    return `We have a surplus of ${formatCurrency(Math.abs(fundingBalance.value))} this month!`
  }
  else if (balanceStatus.value === 'negative') {
    return `We still need ${formatCurrency(Math.abs(fundingBalance.value))} to reach this month's goal`
  }
  else {
    return 'We\'ve reached our monthly goal!'
  }
})
</script>

<template>
  <div>
    <!-- Conditional wrapper: NuxtLink to funding page OR external link to Patreon -->
    <NuxtLink v-if="!isOnFundingPage" to="/community/funding" class="funding-card-link" aria-label="View detailed funding information">
      <Card :class="{ 'funding-progress__complete': fundingProgress.percentage >= 100 }">
        <!-- Loading state -->
        <template v-if="loading">
          <Flex column gap="m">
            <Skeleton :width="300" :height="32" :radius="4" />
            <Skeleton :height="8" :radius="4" />
            <Flex x-between y-center>
              <Skeleton :width="200" :height="20" :radius="4" />
              <Skeleton :width="120" :height="20" :radius="4" />
            </Flex>
          </Flex>
        </template>

        <!-- Error state -->
        <template v-else-if="errorMessage">
          <Flex y-center gap="s" class="color-error">
            <Icon name="ph:warning" size="1.2rem" />
            <span class="text-s">Unable to load funding data</span>
          </Flex>
        </template>

        <!-- Main content -->
        <template v-else>
          <Flex y-center x-between class="mb-s funding-header">
            <Flex y-center gap="s">
              <h3 class="text-bold text-xxxl">
                Monthly Funding
              </h3>
              <Badge v-if="supporterCount > 0" variant="accent">
                {{ supporterCount }} supporters
              </Badge>
            </Flex>
            <Flex y-center gap="s" class="funding-amounts">
              <strong class="text-bold text-xxxl">{{ formatCurrency(fundingProgress.current) }}</strong>
              <span class="text-color-light text-xxxl">/</span>
              <strong class="text-color-light text-xxxl">{{ formatCurrency(fundingProgress.goal) }}</strong>
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
                {{ statusMessage }}
              </p>
            </div>

            <div class="funding-cta">
              <Badge variant="accent">
                <Icon name="ph:chart-bar" size="1.4rem" />
                View Details
              </Badge>
            </div>
          </Flex>
        </template>
      </Card>
    </NuxtLink>

    <!-- When on funding page, link to Patreon instead -->
    <a v-else :href="constants.PATREON.URL" target="_blank" rel="noopener noreferrer" class="funding-card-link" aria-label="Support us on Patreon">
      <Card :class="{ 'funding-progress__complete': fundingProgress.percentage >= 100 }">
        <!-- Loading state -->
        <template v-if="loading">
          <Flex column gap="m">
            <Skeleton :width="300" :height="32" :radius="4" />
            <Skeleton :height="8" :radius="4" />
            <Flex x-between y-center>
              <Skeleton :width="200" :height="20" :radius="4" />
              <Skeleton :width="120" :height="20" :radius="4" />
            </Flex>
          </Flex>
        </template>

        <!-- Error state -->
        <template v-else-if="errorMessage">
          <Flex y-center gap="s" class="color-error">
            <Icon name="ph:warning" size="1.2rem" />
            <span class="text-s">Unable to load funding data</span>
          </Flex>
        </template>

        <!-- Main content -->
        <template v-else>
          <Flex y-center x-between class="mb-s funding-header">
            <Flex y-center gap="s">
              <h3 class="text-bold text-xxxl">
                Monthly Funding
              </h3>
              <Badge v-if="supporterCount > 0" variant="accent">
                {{ supporterCount }} supporters
              </Badge>
            </Flex>
            <Flex y-center gap="s" class="funding-amounts">
              <strong class="text-bold text-xxxl">{{ formatCurrency(fundingProgress.current) }}</strong>
              <span class="text-color-light text-xxxl">/</span>
              <strong class="text-color-light text-xxxl">{{ formatCurrency(fundingProgress.goal) }}</strong>
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
                {{ statusMessage }}
              </p>
            </div>

            <div class="funding-cta">
              <Badge variant="accent">
                <Icon name="ph:heart" size="1.4rem" />
                Support Us
              </Badge>
            </div>
          </Flex>
        </template>
      </Card>
    </a>
  </div>
</template>

<style lang="scss" scoped>
@use '@/assets/breakpoints.scss' as *;

.funding-progress__complete {
  border: 1px solid var(--color-accent);
}

// Responsive text sizing
@media screen and (max-width: $breakpoint-sm) {
  .text-xxxl {
    font-size: var(--font-size-xl) !important;
  }

  .funding-header {
    flex-direction: column;
    align-items: flex-start !important;
    gap: var(--space-s) !important;
  }

  .funding-amounts {
    align-self: flex-end;
  }
}

.funding-card-link {
  text-decoration: none;
  display: block;
  transition: all 0.2s ease;

  &:hover {
    transform: translateY(-2px);

    .funding-progress__complete {
      border-color: var(--color-accent);
      box-shadow: 0 8px 25px -8px var(--color-accent-alpha);
    }

    :not(.funding-progress__complete) {
      border-color: var(--color-border);
      box-shadow: 0 8px 25px -8px var(--color-shadow);
    }
  }
}

.funding-cta {
  pointer-events: none; // Prevent the badge from interfering with card click
}
</style>
