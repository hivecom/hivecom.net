<script setup lang="ts">
import type { Tables } from '@/types/database.overrides'
import { Flex, Sheet } from '@dolanske/vui'
import AdminActions from '@/components/Admin/Shared/AdminActions.vue'
import DetailRow from '@/components/Admin/Shared/DetailRow.vue'
import DetailTable from '@/components/Admin/Shared/DetailTable.vue'
import CopyValue from '@/components/Shared/CopyValue.vue'
import Metadata from '@/components/Shared/Metadata.vue'
import TimestampDate from '@/components/Shared/TimestampDate.vue'
import { formatCurrency } from '@/lib/utils/currency'
import { calculateDurationBetweenDates } from '@/lib/utils/duration'

const props = defineProps<{
  expense: {
    id: number
    amount_cents: number
    created_at: string
    created_by: string | null
    description: string | null
    ended_at: string | null
    modified_at: string | null
    modified_by: string | null
    name: string | null
    started_at: string
    url: string | null
  } | null
}>()

// Define emits
const emit = defineEmits(['edit', 'delete'])

// Define model for sheet visibility
const isOpen = defineModel<boolean>('isOpen')

// Handle closing the sheet
function handleClose() {
  isOpen.value = false
}

// Handle edit action from AdminActions
function handleEdit(expense: Tables<'funding_expenses'>) {
  emit('edit', expense)
  isOpen.value = false
}

// Handle delete action from AdminActions
function handleDelete(expense: Tables<'funding_expenses'>) {
  emit('delete', expense)
  isOpen.value = false
}
</script>

<template>
  <Sheet
    :open="!!props.expense && isOpen"
    position="right"
    :card="{ separators: true }"
    :size="600"
    @close="handleClose"
  >
    <template #header>
      <Flex x-between y-center class="pr-s">
        <Flex column :gap="0">
          <h4>Expense Details</h4>
          <p v-if="props.expense" class="text-color-light text-xs">
            {{ props.expense.name }}
          </p>
        </Flex>
        <Flex y-center gap="s">
          <AdminActions
            v-if="props.expense"
            resource-type="funding_expenses"
            :item="props.expense"
            :show-labels="true"
            @edit="(expenseItem) => handleEdit(expenseItem as Tables<'funding_expenses'>)"
            @delete="(expenseItem) => handleDelete(expenseItem as Tables<'funding_expenses'>)"
          />
        </Flex>
      </Flex>
    </template>

    <Flex v-if="props.expense" column gap="m" class="expense-details">
      <!-- Basic info -->
      <DetailTable>
        <template #header>
          <Icon name="ph:receipt" />
          <h6>Overview</h6>
        </template>
        <DetailRow label="ID">
          <CopyValue :text="String(props.expense.id)" link />
        </DetailRow>
        <DetailRow label="Amount">
          <span class="text-s text-bold">{{ formatCurrency(props.expense.amount_cents) }}</span>
        </DetailRow>
        <DetailRow label="Status">
          <span class="text-s" :class="props.expense.ended_at ? 'text-color-light' : 'color-success'">
            {{ props.expense.ended_at ? 'Ended' : 'Active' }}
          </span>
        </DetailRow>
        <DetailRow label="Duration">
          <span class="text-s">{{ calculateDurationBetweenDates(props.expense.started_at, props.expense.ended_at) }}</span>
        </DetailRow>
        <DetailRow label="Started">
          <TimestampDate :date="props.expense.started_at" />
        </DetailRow>
        <DetailRow label="Ended" :hidden="!props.expense.ended_at">
          <TimestampDate :date="props.expense.ended_at!" />
        </DetailRow>
        <DetailRow label="URL" :hidden="!props.expense.url">
          <a :href="props.expense.url!" target="_blank" rel="noopener noreferrer" class="link">
            {{ props.expense.url }}
            <Icon name="ph:arrow-square-out" />
          </a>
        </DetailRow>
      </DetailTable>

      <!-- Description -->
      <DetailTable v-if="props.expense.description">
        <template #header>
          <Icon name="ph:text-align-left" />
          <h6>Description</h6>
        </template>
        <div class="expense-details__description">
          <p class="text-s">
            {{ props.expense.description }}
          </p>
        </div>
      </DetailTable>

      <!-- Metadata -->
      <Metadata
        :created-at="props.expense.created_at"
        :created-by="props.expense.created_by"
        :modified-at="props.expense.modified_at"
        :modified-by="props.expense.modified_by"
      />
    </Flex>
  </Sheet>
</template>

<style lang="scss" scoped>
.expense-details {
  padding-bottom: var(--space);

  &__description {
    padding: var(--space-m);
  }
}

.link {
  color: var(--color-accent);
  text-decoration: none;
  display: inline-flex;
  align-items: center;
  gap: var(--space-xs);
}

.link:hover {
  text-decoration: underline;
}
</style>
