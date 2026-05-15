<script setup lang="ts">
import { Button, Card, Flex, Progress, Skeleton } from '@dolanske/vui'

import { useDataExpenses } from '@/composables/useDataExpenses'
import { useDataMonthlyFunding } from '@/composables/useDataMonthlyFunding'
import { useBreakpoint } from '@/lib/mediaQuery'
import { formatCurrency } from '@/lib/utils/currency'

// Check if we're on the funding page
const route = useRoute()
const isOnFundingPage = computed(() => route.path === '/community/funding')

const isBelowSmall = useBreakpoint('<s')

// Funding data via shared cache
const { latestFunding: currentFunding, loading: fundingLoading, error } = useDataMonthlyFunding()
const errorMessage = computed(() => error.value)

// Active expenses via shared cache
const { totalActiveAmountCents: monthlyExpenses, loading: expensesLoading } = useDataExpenses()

const loading = computed(() => fundingLoading.value || expensesLoading.value)

// Calculate funding progress
const fundingProgress = computed(() => {
  if (!currentFunding.value)
    return { percentage: 0, current: 0, goal: monthlyExpenses.value }

  const current = (currentFunding.value.patreon_month_amount_cents ?? 0) + (currentFunding.value.donation_month_amount_cents ?? 0)
  const goal = monthlyExpenses.value || 1 // Use actual expenses as goal, avoid division by zero
  const percentage = goal > 0 ? Math.min((current / goal) * 100, 100) : 0

  return { percentage, current, goal }
})

const statusMessage = computed(() => {
  const balance = fundingProgress.value.current - fundingProgress.value.goal

  if (balance > 0) {
    return `We have a surplus of ${formatCurrency(Math.abs(balance))} this month!`
  }
  else if (balance === 0) {
    return 'We\'ve reached our monthly goal!'
  }
  else {
    return `We still need ${formatCurrency(Math.abs(balance))} to reach this month's goal`
  }
})

const currentMonthLabel = computed(() => {
  if (!currentFunding.value)
    return 'Monthly Funding'
  return new Date(`${currentFunding.value.month}T00:00:00`).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  })
})

// Reusable template to not have to copy-paste component code
const [DefineTemplate, ProgressTemplate] = createReusableTemplate()

function onSupportButtonClick(e: Event) {
  if (!isOnFundingPage.value)
    return
  e.preventDefault()
  e.stopPropagation()
  scrollToSupport()
}

function scrollToSupport() {
  document.getElementById('support-cta')?.scrollIntoView({ behavior: 'smooth' })
}
</script>

<template>
  <DefineTemplate>
    <Card :class="{ 'funding-progress__complete': fundingProgress.percentage >= 100 }" class="card-bg" expand>
      <!-- Loading state -->
      <Flex v-if="loading" column expand>
        <Flex column gap="m">
          <Skeleton :width="300" :height="32" :radius="4" />
          <Skeleton :height="8" :radius="4" />
          <Flex x-between y-center>
            <Skeleton :width="200" :height="20" :radius="4" />
            <Skeleton :width="120" :height="20" :radius="4" />
          </Flex>
        </Flex>
      </Flex>

      <!-- Error state -->
      <Flex v-else-if="errorMessage" expand column>
        <Flex y-center gap="s" class="color-error">
          <Icon name="ph:warning" size="1.2rem" />
          <span class="text-s">Unable to load funding data</span>
        </Flex>
      </Flex>

      <!-- Main content -->
      <Flex v-else column expand>
        <Flex y-center x-between class="mb-s funding-header" expand>
          <Flex y-center gap="s" wrap>
            <h2 class="text-bold text-xxxl">
              {{ currentMonthLabel }}
            </h2>
          </Flex>
          <Flex y-center gap="s" class="funding-amounts">
            <strong class="text-bold text-xxxl">{{ formatCurrency(fundingProgress.current) }}</strong>
            <span class="text-color-light text-xxxl">/</span>
            <strong class="text-color-light text-xxxl">{{ formatCurrency(fundingProgress.goal) }}</strong>
          </Flex>
        </Flex>

        <Progress
          class="mb-s"
          :height="8"
          :model-value="fundingProgress.percentage"
        />

        <!-- Funding vs Expenses Summary -->
        <Flex x-between y-start expand>
          <p class="text-s text-color-lighter">
            {{ statusMessage }}
          </p>

          <div v-if="!isBelowSmall">
            <Button :plain="!isOnFundingPage" size="s" variant="accent" @click="onSupportButtonClick">
              <Flex y-center :gap="4">
                <Icon :name="isOnFundingPage ? 'ph:heart-straight' : 'ph:info'" />
                {{ isOnFundingPage ? "Support Us" : "Learn More" }}
              </Flex>
              <template #end>
                <Icon name="ph:caret-right" />
              </template>
            </Button>
          </div>
        </Flex>
      </Flex>
    </Card>
  </DefineTemplate>

  <Flex column expand>
    <!-- Conditional wrapper: NuxtLink to funding page OR external link to Patreon -->
    <NuxtLink v-if="!isOnFundingPage" to="/community/funding" class="funding-card-link" aria-label="View detailed funding information">
      <ProgressTemplate />
    </NuxtLink>

    <!-- When on funding page, scroll to support CTA instead -->
    <div v-else role="link" tabindex="0" class="funding-card-link" aria-label="Go to support section" @click="scrollToSupport" @keydown.enter="scrollToSupport">
      <ProgressTemplate />
    </div>
  </Flex>
</template>

<style lang="scss" scoped>
@use '@/assets/breakpoints.scss' as *;

.funding-progress__complete {
  border: 1px solid var(--color-accent);
}

// Responsive text sizing
@media screen and (max-width: $breakpoint-s) {
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
  width: 100%;
  text-decoration: none;
  display: block;
  cursor: pointer;
  transition: var(--transition-fast);

  &:hover {
    background-color: var(--color-bg-raised);
  }
}
</style>
