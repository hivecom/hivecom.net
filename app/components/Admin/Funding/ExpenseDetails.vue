<script setup lang="ts">
import type { Tables } from '@/types/database.types'
import { Card, Flex, Grid, Sheet } from '@dolanske/vui'
import AdminActions from '@/components/Admin/Shared/AdminActions.vue'
import Metadata from '@/components/Shared/Metadata.vue'
import TimestampDate from '@/components/Shared/TimestampDate.vue'
import { formatCurrency } from '@/lib/utils/currency'

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
function handleEdit(expense: Tables<'expenses'>) {
  emit('edit', expense)
  isOpen.value = false
}

// Handle delete action from AdminActions
function handleDelete(expense: Tables<'expenses'>) {
  emit('delete', expense)
  isOpen.value = false
}

// Calculate duration
function calculateDuration(startDate: string, endDate?: string | null): string {
  const start = new Date(startDate)
  const end = endDate ? new Date(endDate) : new Date()

  const diffTime = Math.abs(end.getTime() - start.getTime())
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

  if (diffDays < 30) {
    return `${diffDays} days`
  }
  else if (diffDays < 365) {
    const months = Math.floor(diffDays / 30)
    return `${months} month${months > 1 ? 's' : ''}`
  }
  else {
    const years = Math.floor(diffDays / 365)
    const remainingMonths = Math.floor((diffDays % 365) / 30)
    if (remainingMonths > 0) {
      return `${years}y ${remainingMonths}m`
    }
    return `${years} year${years > 1 ? 's' : ''}`
  }
}
</script>

<template>
  <Sheet
    :open="!!props.expense && isOpen"
    position="right"
    separator
    :size="600"
    @close="handleClose"
  >
    <template #header>
      <Flex x-between y-center>
        <Flex column :gap="0">
          <h4>Expense Details</h4>
          <span v-if="props.expense" class="text-color-light text-xxs">
            {{ props.expense.name }}
          </span>
        </Flex>
        <Flex y-center gap="s">
          <AdminActions
            v-if="props.expense"
            resource-type="expenses"
            :item="props.expense"
            :show-labels="true"
            @edit="(expenseItem) => handleEdit(expenseItem as Tables<'expenses'>)"
            @delete="(expenseItem) => handleDelete(expenseItem as Tables<'expenses'>)"
          />
        </Flex>
      </Flex>
    </template>

    <Flex v-if="props.expense" column gap="m" class="expense-details">
      <Flex column gap="l" expand>
        <!-- Basic info -->
        <Card>
          <Flex column gap="l" expand>
            <Grid class="expense-details__item" expand :columns="2">
              <span class="expense-details__label">ID:</span>
              <span>{{ props.expense.id }}</span>
            </Grid>

            <Grid class="expense-details__item" expand :columns="2">
              <span class="expense-details__label">Name:</span>
              <span>{{ props.expense.name || 'Unnamed Expense' }}</span>
            </Grid>

            <Grid v-if="props.expense.description" class="expense-details__item" expand :columns="2">
              <span class="expense-details__label">Description:</span>
              <span>{{ props.expense.description }}</span>
            </Grid>

            <Grid class="expense-details__item" expand :columns="2">
              <span class="expense-details__label">Amount:</span>
              <span class="text-bold">{{ formatCurrency(props.expense.amount_cents) }}</span>
            </Grid>

            <Grid class="expense-details__item" expand :columns="2">
              <span class="expense-details__label">Status:</span>
              <span :class="props.expense.ended_at ? 'text-color-light' : 'color-success'">
                {{ props.expense.ended_at ? 'Ended' : 'Active' }}
              </span>
            </Grid>

            <Grid class="expense-details__item" expand :columns="2">
              <span class="expense-details__label">Duration:</span>
              <span>{{ calculateDuration(props.expense.started_at, props.expense.ended_at) }}</span>
            </Grid>

            <Grid v-if="props.expense.url" class="expense-details__item" expand :columns="2">
              <span class="expense-details__label">URL:</span>
              <a :href="props.expense.url" target="_blank" rel="noopener noreferrer" class="link">
                {{ props.expense.url }}
                <Icon name="ph:arrow-square-out" />
              </a>
            </Grid>
          </Flex>
        </Card>

        <!-- Date Information -->
        <Card separators>
          <template #header>
            <h6>Date Information</h6>
          </template>

          <Flex column gap="l" expand>
            <Grid class="expense-details__item" expand :columns="2">
              <span class="expense-details__label">Started:</span>
              <TimestampDate :date="props.expense.started_at" />
            </Grid>

            <Grid v-if="props.expense.ended_at" class="expense-details__item" expand :columns="2">
              <span class="expense-details__label">Ended:</span>
              <TimestampDate :date="props.expense.ended_at" />
            </Grid>
          </Flex>
        </Card>

        <!-- Metadata -->
        <Metadata
          :created-at="props.expense.created_at"
          :created-by="props.expense.created_by"
          :modified-at="props.expense.modified_at"
          :modified-by="props.expense.modified_by"
        />
      </Flex>
    </Flex>
  </Sheet>
</template>

<style lang="scss" scoped>
.expense-details {
  padding-bottom: var(--space);

  &__label {
    font-weight: var(--font-weight-medium);
    color: var(--color-text-light);
  }

  &__metadata-by {
    font-size: var(--font-size-l);
    color: var(--color-text-light);
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
