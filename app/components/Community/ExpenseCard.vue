<script setup lang="ts">
import type { Tables } from '@/types/database.types'
import { Badge, Card, Flex } from '@dolanske/vui'
import { formatCurrency } from '@/lib/utils/currency'
import { formatDateShort } from '@/lib/utils/date'
import { isPlannedExpense } from '@/lib/utils/expenses'

interface Props {
  expense: Tables<'expenses'>
}

const props = defineProps<Props>()

// Check if expense is currently active
const isActive = computed(() => {
  return !props.expense.ended_at
})

// Check if this is a planned expense (start date in the future)
const planned = computed(() => isPlannedExpense(props.expense.started_at))

// Get expense status
const expenseStatus = computed(() => {
  if (planned.value) {
    return { label: 'Planned', variant: 'accent' as const }
  }
  else if (isActive.value) {
    return { label: 'Active', variant: 'success' as const }
  }
  else {
    return { label: 'Ended', variant: 'neutral' as const }
  }
})
</script>

<template>
  <Card>
    <Flex column gap="s">
      <!-- Header with name and amount -->
      <Flex x-between y-center>
        <h4 class="text-bold">
          {{ expense.name || 'Unnamed Expense' }}
        </h4>
        <Badge :variant="expenseStatus.variant">
          {{ expenseStatus.label }}
        </Badge>
      </Flex>

      <!-- Amount -->
      <div>
        <span class="text-l text-bold">{{ formatCurrency(expense.amount_cents) }}</span>
        <span class="text-color-light text-s">/month</span>
      </div>

      <!-- Description -->
      <p v-if="expense.description" class="text-color-light text-s">
        {{ expense.description }}
      </p>

      <!-- Date range -->
      <Flex x-between y-center class="text-xs text-color-light">
        <span v-if="planned">Starts {{ formatDateShort(expense.started_at) }}</span>
        <span v-else>Since {{ formatDateShort(expense.started_at) }}</span>
        <span v-if="expense.ended_at">Ended {{ formatDateShort(expense.ended_at) }}</span>
      </Flex>

      <!-- External link if available -->
      <Flex v-if="expense.url" class="mt-xs">
        <a
          :href="expense.url"
          target="_blank"
          rel="noopener noreferrer"
          class="text-s color-accent"
        >
          <Flex y-center gap="xs">
            <Icon name="ph:link" size="1.2rem" />
            View details
          </Flex>
        </a>
      </Flex>
    </Flex>
  </Card>
</template>
