<script setup lang="ts">
import type { Tables } from '@/types/database.types'
import { Card, Flex, Grid, Sheet } from '@dolanske/vui'
import { formatCurrency } from '@/lib/utils/currency'

const props = defineProps<{
  funding: Tables<'monthly_funding'> | null
}>()

// Define model for sheet visibility
const isOpen = defineModel<boolean>('isOpen')

// Handle closing the sheet
function handleClose() {
  isOpen.value = false
}

// Format month helper
function formatMonth(month: string): string {
  return new Date(`${month}T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  })
}
</script>

<template>
  <Sheet
    :open="!!props.funding && isOpen"
    position="right"
    separator
    :size="600"
    @close="handleClose"
  >
    <template #header>
      <Flex column :gap="0">
        <h4>Funding Details</h4>
        <span v-if="props.funding" class="text-color-light text-xxs">
          {{ formatMonth(props.funding.month) }}
        </span>
      </Flex>
    </template>

    <Flex v-if="props.funding" column gap="m" class="funding-details">
      <Flex column gap="l" expand>
        <!-- Basic info -->
        <Card>
          <Flex column gap="l" expand>
            <Grid class="funding-details__item" expand :columns="2">
              <span class="funding-details__label">Month:</span>
              <span class="text-bold">{{ formatMonth(props.funding.month) }}</span>
            </Grid>

            <Grid class="funding-details__item" expand :columns="2">
              <span class="funding-details__label">Total Monthly:</span>
              <span class="text-bold">{{ formatCurrency((props.funding.patreon_month_amount_cents || 0) + (props.funding.donation_month_amount_cents || 0)) }}</span>
            </Grid>

            <Grid class="funding-details__item" expand :columns="2">
              <span class="funding-details__label">Total Lifetime:</span>
              <span class="text-bold">{{ formatCurrency((props.funding.patreon_lifetime_amount_cents || 0) + (props.funding.donation_lifetime_amount_cents || 0)) }}</span>
            </Grid>
          </Flex>
        </Card>

        <!-- Patreon Funding -->
        <Card separators>
          <template #header>
            <Flex y-center gap="s">
              <Icon name="ph:patreon-logo" size="1.6rem" class="color-accent" />
              <h6>Patreon Funding</h6>
            </Flex>
          </template>

          <Flex column gap="l" expand>
            <Grid class="funding-details__item" expand :columns="2">
              <span class="funding-details__label">Monthly Amount:</span>
              <span class="text-bold">{{ formatCurrency(props.funding.patreon_month_amount_cents || 0) }}</span>
            </Grid>

            <Grid class="funding-details__item" expand :columns="2">
              <span class="funding-details__label">Lifetime Total:</span>
              <span class="text-bold">{{ formatCurrency(props.funding.patreon_lifetime_amount_cents || 0) }}</span>
            </Grid>

            <Grid class="funding-details__item" expand :columns="2">
              <span class="funding-details__label">Patron Count:</span>
              <Flex y-center gap="s">
                <span>{{ props.funding.patreon_count || 0 }}</span>
              </Flex>
            </Grid>
          </Flex>
        </Card>

        <!-- Single Donations -->
        <Card separators>
          <template #header>
            <Flex y-center gap="s">
              <Icon name="ph:coin-fill" size="1.6rem" class="color-accent" />
              <h6>Single Donations</h6>
            </Flex>
          </template>

          <Flex column gap="l" expand>
            <Grid class="funding-details__item" expand :columns="2">
              <span class="funding-details__label">Monthly Amount:</span>
              <span class="text-bold">{{ formatCurrency(props.funding.donation_month_amount_cents || 0) }}</span>
            </Grid>

            <Grid class="funding-details__item" expand :columns="2">
              <span class="funding-details__label">Lifetime Total:</span>
              <span class="text-bold">{{ formatCurrency(props.funding.donation_lifetime_amount_cents || 0) }}</span>
            </Grid>

            <Grid class="funding-details__item" expand :columns="2">
              <span class="funding-details__label">Donation Count:</span>
              <Flex y-center gap="s">
                <span>{{ props.funding.donation_count || 0 }}</span>
              </Flex>
            </Grid>
          </Flex>
        </Card>
      </Flex>
    </Flex>
  </Sheet>
</template>

<style lang="scss" scoped>
.funding-details {
  padding-bottom: var(--space);

  &__label {
    font-weight: var(--font-weight-medium);
    color: var(--text-color-light);
  }

  &__metadata-by {
    font-size: var(--font-size-l);
    color: var(--text-color-light);
  }
}
</style>
