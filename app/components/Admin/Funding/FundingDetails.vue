<script setup lang="ts">
import type { Tables } from '@/types/database.overrides'
import { Flex, Sheet } from '@dolanske/vui'
import DetailRow from '@/components/Admin/Shared/DetailRow.vue'
import DetailTable from '@/components/Admin/Shared/DetailTable.vue'
import { formatCurrency } from '@/lib/utils/currency'
import { fullMonth } from '@/lib/utils/date'

const props = defineProps<{
  funding: Tables<'funding_history'> | null
}>()

// Define model for sheet visibility
const isOpen = defineModel<boolean>('isOpen')

// Handle closing the sheet
function handleClose() {
  isOpen.value = false
}
</script>

<template>
  <Sheet
    :open="!!props.funding && isOpen"
    position="right"
    :card="{ separators: true }"
    :size="600"
    @close="handleClose"
  >
    <template #header>
      <Flex column :gap="0">
        <h4>Funding Details</h4>
      </Flex>
    </template>

    <Flex v-if="props.funding" column gap="m" class="funding-details">
      <!-- Overview -->
      <DetailTable>
        <template #header>
          <Icon name="ph:currency-dollar" />
          <h6>Overview</h6>
        </template>
        <DetailRow label="Month">
          <span class="text-s text-bold">{{ fullMonth(props.funding.month) }}</span>
        </DetailRow>
        <DetailRow label="Total Monthly">
          <span class="text-s text-bold">{{ formatCurrency((props.funding.patreon_month_amount_cents || 0) + (props.funding.donation_month_amount_cents || 0)) }}</span>
        </DetailRow>
        <DetailRow label="Total Lifetime">
          <span class="text-s text-bold">{{ formatCurrency((props.funding.patreon_lifetime_amount_cents || 0) + (props.funding.donation_lifetime_amount_cents || 0)) }}</span>
        </DetailRow>
      </DetailTable>

      <!-- Patreon Funding -->
      <DetailTable>
        <template #header>
          <Icon name="ph:patreon-logo" size="1.6rem" class="color-accent" />
          <h6>Patreon Funding</h6>
        </template>
        <DetailRow label="Monthly Amount">
          <span class="text-s text-bold">{{ formatCurrency(props.funding.patreon_month_amount_cents || 0) }}</span>
        </DetailRow>
        <DetailRow label="Lifetime Total">
          <span class="text-s text-bold">{{ formatCurrency(props.funding.patreon_lifetime_amount_cents || 0) }}</span>
        </DetailRow>
        <DetailRow label="Patron Count">
          <span class="text-s">{{ props.funding.patreon_count || 0 }}</span>
        </DetailRow>
      </DetailTable>

      <!-- Single Donations -->
      <DetailTable>
        <template #header>
          <Icon name="ph:coin-fill" size="1.6rem" class="color-accent" />
          <h6>Single Donations</h6>
        </template>
        <DetailRow label="Monthly Amount">
          <span class="text-s text-bold">{{ formatCurrency(props.funding.donation_month_amount_cents || 0) }}</span>
        </DetailRow>
        <DetailRow label="Lifetime Total">
          <span class="text-s text-bold">{{ formatCurrency(props.funding.donation_lifetime_amount_cents || 0) }}</span>
        </DetailRow>
        <DetailRow label="Donation Count">
          <span class="text-s">{{ props.funding.donation_count || 0 }}</span>
        </DetailRow>
      </DetailTable>
    </Flex>
  </Sheet>
</template>

<style lang="scss" scoped>
.funding-details {
  padding-bottom: var(--space);
}
</style>
