<script setup lang="ts">
import { Button, Card, Flex, Grid, Sheet } from '@dolanske/vui'
import TimestampDate from '@/components/Shared/TimestampDate.vue'
import UserLink from '~/components/Shared/UserLink.vue'
import { formatCurrency } from '~/utils/currency'

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
const emit = defineEmits(['edit'])

// Define model for sheet visibility
const isOpen = defineModel<boolean>('isOpen')

// Handle closing the sheet
function handleClose() {
  isOpen.value = false
}

// Handle edit button click
function handleEdit() {
  emit('edit', props.expense)
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
        <h4>Expense Details</h4>
        <Flex y-center gap="s">
          <Button
            v-if="props.expense"
            @click="handleEdit"
          >
            <template #start>
              <Icon name="ph:pencil" />
            </template>
            Edit
          </Button>
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
              <span :class="props.expense.ended_at ? 'color-text-light' : 'color-success'">
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
        <Card separators>
          <template #header>
            <h6>Metadata</h6>
          </template>

          <Flex column gap="l" expand>
            <Grid class="expense-details__item" expand :columns="2">
              <span class="expense-details__label">Created:</span>
              <Flex column>
                <TimestampDate :date="props.expense.created_at" />
                <Flex v-if="props.expense.created_by" gap="xs" y-center class="expense-details__metadata-by">
                  <span>by</span>
                  <UserLink :user-id="props.expense.created_by" />
                </Flex>
              </Flex>
            </Grid>

            <Grid v-if="props.expense.modified_at" class="expense-details__item" expand :columns="2">
              <span class="expense-details__label">Modified:</span>
              <Flex column>
                <TimestampDate :date="props.expense.modified_at" />
                <Flex v-if="props.expense.modified_by" gap="xs" y-center class="expense-details__metadata-by">
                  <span>by</span>
                  <UserLink :user-id="props.expense.modified_by" />
                </Flex>
              </Flex>
            </Grid>
          </Flex>
        </Card>
      </Flex>
    </Flex>
  </Sheet>
</template>

<style lang="scss" scoped>
.expense-details {
  padding-bottom: var(--space);

  &__label {
    font-weight: 500;
    color: var(--color-text-light);
  }

  &__metadata-by {
    font-size: 1.3rem;
    color: var(--color-text-light);
  }
}

h4 {
  margin-top: 0;
  margin-bottom: var(--space-xs);
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
