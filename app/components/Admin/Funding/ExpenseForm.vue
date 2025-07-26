<script setup lang="ts">
import { Button, Calendar, Flex, Input, Sheet } from '@dolanske/vui'
import { computed, ref, watch } from 'vue'
import ConfirmModal from '@/components/Shared/ConfirmModal.vue'

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
  isEditMode: boolean
}>()

// Define emits
const emit = defineEmits(['save', 'delete'])

// Define model for sheet visibility
const isOpen = defineModel<boolean>('isOpen')

// Form state
const expenseForm = ref({
  name: '',
  description: '',
  amount_cents: '',
  started_at: null as Date | null,
  ended_at: null as Date | null,
  url: '',
})

// State for delete confirmation modal
const showDeleteConfirm = ref(false)

// Form validation
const validation = computed(() => {
  const hasValidEndDate = !expenseForm.value.ended_at
    || !expenseForm.value.started_at
    || expenseForm.value.ended_at >= expenseForm.value.started_at

  return {
    name: !!expenseForm.value.name.trim(),
    amount_cents: !!expenseForm.value.amount_cents && Number(expenseForm.value.amount_cents) > 0,
    started_at: !!expenseForm.value.started_at,
    ended_at: hasValidEndDate,
  }
})

const isValid = computed(() => Object.values(validation.value).every(Boolean))

// Check if this is a planned expense (start date in the future)
const isPlannedExpense = computed(() => {
  if (!expenseForm.value.started_at)
    return false
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const startDate = new Date(expenseForm.value.started_at)
  startDate.setHours(0, 0, 0, 0)
  return startDate > today
})

// Update form data when expense prop changes
watch(
  () => props.expense,
  (newExpense) => {
    if (newExpense) {
      expenseForm.value = {
        name: newExpense.name || '',
        description: newExpense.description || '',
        amount_cents: String(newExpense.amount_cents),
        started_at: new Date(newExpense.started_at),
        ended_at: newExpense.ended_at ? new Date(newExpense.ended_at) : null,
        url: newExpense.url || '',
      }
    }
    else {
      // Reset form for new expense
      expenseForm.value = {
        name: '',
        description: '',
        amount_cents: '',
        started_at: null,
        ended_at: null,
        url: '',
      }
    }
  },
  { immediate: true },
)

// Handle closing the sheet
function handleClose() {
  isOpen.value = false
}

// Handle form submission
function handleSubmit() {
  if (!isValid.value)
    return

  // Prepare the data to save
  const expenseData = {
    name: expenseForm.value.name,
    description: expenseForm.value.description || null,
    amount_cents: Number(expenseForm.value.amount_cents),
    started_at: expenseForm.value.started_at ? expenseForm.value.started_at.toISOString() : '',
    ended_at: expenseForm.value.ended_at ? expenseForm.value.ended_at.toISOString() : null,
    url: expenseForm.value.url || null,
  }

  emit('save', expenseData)
}

// Open confirmation modal for deletion
function handleDelete() {
  if (!props.expense)
    return

  showDeleteConfirm.value = true
}

// Perform actual deletion when confirmed
function confirmDelete() {
  if (!props.expense)
    return

  emit('delete', props.expense.id)
}
</script>

<template>
  <Sheet
    :open="isOpen"
    position="right"
    separator
    :size="600"
    @close="handleClose"
  >
    <template #header>
      <Flex align="center" gap="m">
        <Flex column :gap="0">
          <h4>{{ props.isEditMode ? 'Edit Expense' : 'Add Expense' }}</h4>
          <span v-if="props.isEditMode && props.expense" class="color-text-light text-xxs">
            {{ props.expense.description || props.expense.name }}
          </span>
        </Flex>
        <span
          v-if="isPlannedExpense"
          class="expense-form__planned-badge"
        >
          Planned
        </span>
      </Flex>
    </template>

    <!-- Expense Info Section -->
    <Flex column gap="l" class="expense-form">
      <Flex column gap="m" expand>
        <h4>Expense Information</h4>

        <Input
          v-model="expenseForm.name"
          expand
          name="name"
          label="Name"
          required
          :valid="validation.name"
          error="Expense name is required"
          placeholder="Enter expense name"
        />

        <Input
          v-model="expenseForm.description"
          expand
          name="description"
          label="Description"
          placeholder="Enter expense description (optional)"
        />

        <Input
          v-model="expenseForm.amount_cents"
          expand
          name="amount_cents"
          label="Amount (cents)"
          type="number"
          required
          :valid="validation.amount_cents"
          error="Amount is required and must be greater than 0"
          placeholder="Enter amount in cents"
        />

        <Flex gap="m" expand>
          <Flex column expand class="expense-form__date-picker-container">
            <label for="start-date-picker" class="expense-form__date-picker-label">
              Start Date <span class="required">*</span>
            </label>
            <Calendar
              v-model="expenseForm.started_at"
              expand
              format="yyyy-MM-dd"
              :class="{ invalid: !validation.started_at }"
            >
              <template #trigger>
                <Button
                  id="start-date-picker"
                  class="expense-form__date-picker-button"
                  expand
                  :class="{ error: !validation.started_at }"
                >
                  {{ expenseForm.started_at ? expenseForm.started_at.toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                  }) : 'Choose start date' }}
                  <template #end>
                    <Icon name="ph:calendar" />
                  </template>
                </Button>
              </template>
            </Calendar>
            <span v-if="!validation.started_at" class="text-xs color-text-red">Start date is required</span>
          </Flex>

          <Flex column expand class="expense-form__date-picker-container">
            <label for="end-date-picker" class="expense-form__date-picker-label">
              End Date
            </label>
            <Flex expand gap="xs" align="center">
              <Calendar
                v-model="expenseForm.ended_at"
                expand
                format="yyyy-MM-dd"
                :class="{ invalid: !validation.ended_at }"
              >
                <template #trigger>
                  <Button
                    id="end-date-picker"
                    class="expense-form__date-picker-button"
                    expand
                    :class="{ error: !validation.ended_at }"
                  >
                    {{ expenseForm.ended_at ? expenseForm.ended_at.toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: '2-digit',
                      day: '2-digit',
                    }) : 'Choose end date (optional)' }}
                    <template #end>
                      <Icon name="ph:calendar" />
                    </template>
                  </Button>
                </template>
              </Calendar>
              <Button
                v-if="expenseForm.ended_at"
                variant="link"
                square
                data-title-left="Clear end date"
                @click="expenseForm.ended_at = null"
              >
                <Icon name="ph:x" />
              </Button>
            </Flex>
            <span v-if="!validation.ended_at && expenseForm.ended_at" class="text-xs color-text-red">
              End date cannot be before start date
            </span>
          </Flex>
        </Flex>

        <Input
          v-model="expenseForm.url"
          expand
          name="url"
          label="URL"
          type="url"
          placeholder="Enter related URL (optional)"
        />
      </Flex>
    </Flex>

    <!-- Form Actions -->
    <template #footer>
      <Flex gap="xs" class="form-actions">
        <Button
          type="submit"
          variant="accent"
          :disabled="!isValid"
          @click.prevent="handleSubmit"
        >
          <template #start>
            <Icon name="ph:check" />
          </template>
          {{ props.isEditMode ? 'Update' : 'Create' }}
        </Button>

        <Button @click.prevent="handleClose">
          Cancel
        </Button>

        <div class="flex-1" />

        <Button
          v-if="props.isEditMode"
          variant="danger"
          square
          data-title-left="Delete expense"
          @click.prevent="handleDelete"
        >
          <Icon name="ph:trash" />
        </Button>
      </Flex>
    </template>

    <!-- Confirmation Modal for Delete Action -->
    <ConfirmModal
      v-model:open="showDeleteConfirm"
      v-model:confirm="confirmDelete"
      title="Confirm Delete Expense"
      :description="`Are you sure you want to delete the expense '${props.expense?.name}'? This action cannot be undone.`"
      confirm-text="Delete"
      cancel-text="Cancel"
      :destructive="true"
    />
  </Sheet>
</template>

<style lang="scss" scoped>
.expense-form {
  padding-bottom: var(--space);

  &__date-picker-container {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }

  &__date-picker-label {
    font-size: var(--font-size-s);
    font-weight: var(--font-weight-medium);
    color: var(--color-text);
  }

  &__planned-badge {
    display: inline-flex;
    align-items: center;
    padding: var(--space-xs) var(--space-sm);
    background-color: var(--color-accent-subtle);
    color: var(--color-accent);
    border-radius: var(--border-radius-sm);
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-medium);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
}

.form-actions {
  margin-top: var(--space);
}

.required {
  color: var(--color-text-red);
}

.error {
  border-color: var(--color-danger) !important;
}

.invalid {
  border-color: var(--color-danger) !important;
}
</style>
