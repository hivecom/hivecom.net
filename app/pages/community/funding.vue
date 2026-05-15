<script setup lang="ts">
import { Alert, Card, Checkbox, Flex, Grid, Skeleton } from '@dolanske/vui'
import ExpenseCard from '@/components/Community/ExpenseCard.vue'
import FundingHistory from '@/components/Community/FundingHistory.vue'
import FundingProgress from '@/components/Community/FundingProgress.vue'
import SupportCTA from '@/components/Community/SupportCTA.vue'
import BulkAvatarDisplay from '@/components/Shared/BulkAvatarDisplay.vue'
import { useDataExpenses } from '@/composables/useDataExpenses'
import { useDataMonthlyFunding } from '@/composables/useDataMonthlyFunding'
import { useDataSupporters } from '@/composables/useDataSupporters'
import { useBreakpoint } from '@/lib/mediaQuery'
import { formatCurrency } from '@/lib/utils/currency'

const user = useSupabaseUser()

// All data via shared cached composables - no manual onMounted fetch needed.
const { allFunding: monthlyFunding, latestFunding, loading: fundingLoading, error: fundingError } = useDataMonthlyFunding()
const { supporterIds: supporters, loading: supportersLoading, error: supportersError } = useDataSupporters()
const { expenses, loading: expensesLoading, error: expensesError } = useDataExpenses()

const isBelowSmall = useBreakpoint('<s')

// UI state
const showPastExpenses = ref(false)

useSeoMeta({
  title: 'Funding',
  description: 'See Hivecom community funding, expenses, and how to support the project.',
  ogTitle: 'Funding',
  ogDescription: 'See Hivecom community funding, expenses, and how to support the project.',
})

defineOgImage('Default', {
  title: 'Funding',
  description: 'See Hivecom community funding, expenses, and how to support the project.',
})

// Filtered expenses based on checkbox
const filteredExpenses = computed(() => {
  if (showPastExpenses.value)
    return expenses.value
  return expenses.value.filter(expense => expense.ended_at == null)
})

// Combine loading and error states
const isLoading = computed(() => fundingLoading.value || supportersLoading.value || expensesLoading.value)
const combinedError = computed(() => fundingError.value ?? supportersError.value ?? expensesError.value ?? '')
</script>

<template>
  <div class="page container-l">
    <!-- Hero section -->
    <section class="page-title">
      <h1>Funding</h1>
      <p>Discover how we are funded, how you can support us and where your contributions go.</p>
    </section>

    <!-- Loading state -->
    <section v-if="isLoading" class="mt-xl">
      <Flex column gap="l">
        <!-- Supporters card -->
        <Skeleton :height="180" :radius="8" />

        <!-- Funding progress + 2-col stats -->
        <Skeleton :height="64" :radius="8" />
        <Grid :columns="isBelowSmall ? 1 : 2" gap="s">
          <Skeleton :height="100" :radius="8" />
          <Skeleton :height="100" :radius="8" />
        </Grid>

        <!-- Historical funding chart -->
        <Skeleton :height="200" :radius="8" class="mt-xl" />

        <!-- Monthly expenses -->
        <Flex x-between y-center class="mt-xl">
          <Skeleton :width="200" :height="32" :radius="8" />
          <Skeleton :width="160" :height="24" :radius="8" />
        </Flex>
        <Grid :columns="isBelowSmall ? 1 : 2" gap="s">
          <Skeleton :height="150" :radius="8" />
          <Skeleton :height="150" :radius="8" />
          <Skeleton :height="150" :radius="8" />
          <Skeleton :height="150" :radius="8" />
        </Grid>

        <!-- SupportCTA -->
        <Skeleton :height="320" :radius="8" class="mt-xl" />
      </Flex>
    </section>

    <!-- Error state -->
    <section v-else-if="combinedError" class="mt-xl">
      <Alert variant="danger">
        {{ combinedError }}
      </Alert>
    </section>

    <!-- Main content -->
    <Flex v-else column expand>
      <!-- Our Supporters -->
      <Card v-if="user && supporters.length > 0" class="supporters-card pb-l mt-l" expand>
        <div class="supporters-card__sheen gold-surface" aria-hidden="true" />
        <Flex column gap="m" x-center y-center class="supporters-card__content">
          <Flex y-center gap="m" x-center expand>
            <Flex column :gap="0" x-center class="text-center" y-center>
              <h2 class="text-bold text-xxl">
                Our Supporters
              </h2>
              <p class="text-color-light">
                Thank you to our amazing supporters who help keep Hivecom running!
              </p>
            </Flex>
          </Flex>
          <BulkAvatarDisplay
            :user-ids="supporters"
            :max-users="24"
            :avatar-size="64"
            :random="true"
            :gap="4"
            :supporter-highlight="true"
          />
        </Flex>
      </Card>

      <!-- Current Funding Progress -->
      <Flex expand column>
        <FundingProgress />

        <Grid :columns="isBelowSmall ? 1 : 2" gap="s" expand>
          <Card class="p-m funding-card">
            <Flex column gap="xs">
              <Flex x-between y-center>
                <span class="text-s text-bold text-color-light">Patreon</span>
                <Icon name="ph:patreon-logo" size="2rem" class="color-accent" />
              </Flex>
              <span class="text-l text-bold">{{ formatCurrency(latestFunding?.patreon_month_amount_cents ?? 0) }}</span>
              <span class="text-xs text-color-light">
                {{ latestFunding?.patreon_count ?? 0 }} {{ latestFunding?.patreon_count === 1 ? 'patron' : 'patrons' }}
              </span>
            </Flex>
          </Card>

          <Card class="p-m funding-card">
            <Flex column gap="xs">
              <Flex x-between y-center>
                <span class="text-s text-bold text-color-light">Single Donations</span>
                <Icon name="ph:coin-fill" size="2rem" class="color-accent" />
              </Flex>
              <span class="text-l text-bold">{{ formatCurrency(latestFunding?.donation_month_amount_cents ?? 0) }}</span>
              <span class="text-xs text-color-light">
                {{ latestFunding?.donation_count ?? 0 }} {{ latestFunding?.donation_count === 1 ? 'donation' : 'donations' }}
              </span>
            </Flex>
          </Card>
        </Grid>
      </Flex>

      <!-- Historical Funding -->
      <Flex expand column class="mt-xl">
        <FundingHistory :monthly-funding="monthlyFunding" :format-currency="formatCurrency" />
      </Flex>

      <!-- Expenses Breakdown -->
      <Flex column expand class="mt-xl">
        <Flex x-between y-center class="mb-l" wrap expand>
          <h2>
            Monthly Expenses
          </h2>
          <Checkbox v-model="showPastExpenses" label="Show past expenses" />
        </Flex>

        <Flex v-if="expenses.length > 0" expand>
          <Grid expand :columns="2" gap="s" class="expenses-grid">
            <ExpenseCard
              v-for="expense in filteredExpenses.slice(0, 6)"
              :key="expense.id"
              :expense="expense"
            />
          </Grid>
        </Flex>

        <Alert v-else variant="info">
          No expense data available
        </Alert>
      </Flex>

      <!-- Support Information -->
      <Flex id="support-cta" expand class="mt-xl">
        <SupportCTA :supporter-ids="supporters" />
      </Flex>
    </Flex>
  </div>
</template>

<style lang="scss" scoped>
@use '@/assets/breakpoints.scss' as *;

.supporters-card {
  background: linear-gradient(135deg, var(--color-bg-raised) 0%, var(--color-bg-medium) 100%);
  border: 1px solid var(--color-border);
  position: relative;
  overflow: hidden;
  text-align: center;

  &::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 3px;
    background: linear-gradient(90deg, #ddce97 0%, #f2c15a 45%, #c57f17 100%);
  }
}

.supporters-card__sheen {
  position: absolute;
  inset: 12% 8%;
  border-radius: var(--border-radius-pill);
  opacity: 0.2;
  filter: blur(36px);
  transform: scale(1.1);
}

.supporters-card__content {
  position: relative;
  z-index: 1;
}

:root:not(.dark) {
  .supporters-card {
    background: radial-gradient(
      circle at 20% 0%,
      rgba(255, 255, 255, 0.95),
      rgba(253, 244, 212, 0.85) 55%,
      var(--color-bg-raised) 100%
    );
    border-color: rgba(12, 11, 9, 0.15);
    box-shadow:
      0 18px 45px rgba(12, 11, 9, 0.08),
      0 6px 18px rgba(12, 11, 9, 0.04);
  }

  .supporters-card__sheen {
    opacity: 0.32;
  }
}

.funding-progress__complete {
  border: 1px solid var(--color-accent);
}

.funding-card {
  background-color: var(--color-bg-card);
}

// Responsive grid for expenses
.expenses-grid {
  // Ensure cards stretch to fill grid height
  align-items: stretch;

  @media screen and (max-width: $breakpoint-s) {
    grid-template-columns: 1fr !important;
  }

  .vui-card {
    height: 100%;
    display: flex;
    flex-direction: column;
  }
}
</style>
