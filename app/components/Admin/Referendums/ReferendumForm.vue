<script setup lang="ts">
import type { Tables } from '@/types/database.types'
import { Badge, Button, Calendar, Checkbox, Flex, Input, Sheet, Textarea } from '@dolanske/vui'
import { computed, ref, watch } from 'vue'
import ConfirmModal from '@/components/Shared/ConfirmModal.vue'

const props = defineProps<{
  referendum: Tables<'referendums'> | null
  isEditMode: boolean
}>()

// Define emits
const emit = defineEmits(['save', 'delete'])

// Define model for sheet visibility
const isOpen = defineModel<boolean>('isOpen')

// Get admin permissions
const { hasPermission } = useAdminPermissions()
const canDeleteReferendums = computed(() => hasPermission('referendums.delete'))

// Form state
const referendumForm = ref({
  title: '',
  description: '',
  date_start: new Date() as Date | null,
  date_end: null as Date | null,
  multiple_choice: false,
  choices: [] as string[],
})

// New choice input for adding individual choices
const newChoiceInput = ref('')

// State for delete confirmation modal
const showDeleteConfirm = ref(false)

// Loading states for buttons
const saveLoading = ref(false)
const deleteLoading = ref(false)

// Form validation
const validation = computed(() => {
  const { date_start, date_end } = referendumForm.value
  return {
    title: !!referendumForm.value.title.trim(),
    date_start: !!date_start,
    date_end: !!date_end,
    choices: referendumForm.value.choices.length >= 2,
    dateRange: date_end ? date_end > new Date() : false,
    startBeforeEnd: date_start && date_end ? date_end > date_start : true,
  }
})

const isValid = computed(() =>
  validation.value.title
  && validation.value.date_start
  && validation.value.date_end
  && validation.value.choices
  && validation.value.dateRange
  && validation.value.startBeforeEnd,
)

// Check if choices are being removed in edit mode
const isRemovingChoices = computed(() => {
  if (!props.isEditMode || !props.referendum)
    return false

  const originalChoices = props.referendum.choices || []
  const currentChoices = referendumForm.value.choices

  // Check if any original choices are missing from current choices
  return originalChoices.some(choice => !currentChoices.includes(choice))
})

// Function to update form data
function updateFormData(newReferendum: Tables<'referendums'> | null) {
  if (newReferendum) {
    referendumForm.value = {
      title: newReferendum.title,
      description: newReferendum.description || '',
      date_start: newReferendum.date_start ? new Date(newReferendum.date_start) : new Date(),
      date_end: newReferendum.date_end ? new Date(newReferendum.date_end) : null,
      multiple_choice: newReferendum.multiple_choice,
      choices: [...(newReferendum.choices || [])],
    }
  }
  else {
    // Reset form for new referendum
    referendumForm.value = {
      title: '',
      description: '',
      date_start: new Date(),
      date_end: null,
      multiple_choice: false,
      choices: [],
    }
    newChoiceInput.value = ''
  }
}

// Update form data when referendum prop changes
watch(
  () => props.referendum,
  (newReferendum) => {
    updateFormData(newReferendum)
  },
)

// Reset loading states when form is closed
watch(
  () => isOpen.value,
  (newIsOpen) => {
    if (!newIsOpen) {
      saveLoading.value = false
      deleteLoading.value = false
    }
  },
)

// Add a new choice
function addChoice() {
  const choice = newChoiceInput.value.trim()
  if (choice && !referendumForm.value.choices.includes(choice)) {
    referendumForm.value.choices.push(choice)
    newChoiceInput.value = ''
  }
}

// Remove a choice
function removeChoice(index: number) {
  referendumForm.value.choices.splice(index, 1)
}

// Handle choice input enter key
function handleChoiceKeyup(event: KeyboardEvent) {
  if (event.key === 'Enter') {
    addChoice()
  }
}

// Handle closing the sheet
function handleClose() {
  isOpen.value = false
}

// Handle form submission
function handleSubmit() {
  if (!isValid.value)
    return

  const dateStart = referendumForm.value.date_start?.toISOString()
  const dateEnd = referendumForm.value.date_end?.toISOString()

  if (!dateStart || !dateEnd)
    return

  // Set loading state
  saveLoading.value = true

  // Prepare the data to save
  const referendumData = {
    title: referendumForm.value.title.trim(),
    description: referendumForm.value.description.trim() || null,
    date_start: dateStart,
    date_end: dateEnd,
    multiple_choice: referendumForm.value.multiple_choice,
    choices: referendumForm.value.choices,
  }

  emit('save', referendumData)
}

// Open confirmation modal for deletion
function handleDelete() {
  if (!props.referendum)
    return

  showDeleteConfirm.value = true
}

// Perform actual deletion when confirmed
function confirmDelete() {
  if (!props.referendum)
    return

  // Set loading state
  deleteLoading.value = true

  emit('delete', props.referendum.id)
}

// Computed properties for form title and button text
const formTitle = computed(() => props.isEditMode ? 'Edit Referendum' : 'Add Referendum')
const submitButtonText = computed(() => props.isEditMode ? 'Update Referendum' : 'Create Referendum')
</script>

<template>
  <Sheet
    :open="isOpen"
    position="right"
    separator
    :size="700"
    @close="handleClose"
  >
    <template #header>
      <Flex column :gap="0">
        <h4>{{ formTitle }}</h4>
        <span v-if="props.isEditMode && props.referendum" class="text-color-light text-xxs">
          {{ props.referendum.title }}
        </span>
      </Flex>
    </template>

    <!-- Referendum Form Section -->
    <Flex column gap="l" class="referendum-form">
      <!-- Basic Information -->
      <Flex column gap="m" expand>
        <h4>Basic Information</h4>

        <Input
          v-model="referendumForm.title"
          expand
          name="title"
          label="Title"
          required
          :valid="validation.title"
          error="Referendum title is required"
          placeholder="Enter referendum title"
        />

        <Textarea
          v-model="referendumForm.description"
          expand
          name="description"
          label="Description"
          placeholder="Enter referendum description (optional)"
          :rows="3"
        />

        <!-- Start Date -->
        <Flex column class="date-picker-container" expand :gap="0">
          <label for="start-date-picker" class="input-label">
            Start Date <span class="required" style="color: var(--color-text-red);">*</span>
          </label>
          <Calendar
            v-model="referendumForm.date_start"
            expand
            enable-time-picker
            time-picker-inline
            enable-minutes
            is24
            format="yyyy-MM-dd-HH:mm"
            :class="{ invalid: !validation.date_start }"
          >
            <template #trigger>
              <Button
                id="start-date-picker"
                class="date-picker-button"
                expand
                :class="{ error: !validation.date_start }"
              >
                {{ referendumForm.date_start ? referendumForm.date_start.toLocaleString('en-US', {
                  year: 'numeric',
                  month: '2-digit',
                  day: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                  hour12: false,
                }) : 'Choose start date and time' }}
                <template #end>
                  <Icon name="ph:calendar" />
                </template>
              </Button>
            </template>
          </Calendar>
          <span v-if="!validation.date_start" class="error-text">Start date is required</span>
        </Flex>

        <!-- End Date -->
        <Flex column class="date-picker-container" expand :gap="0">
          <label for="end-date-picker" class="input-label">
            End Date <span class="required" style="color: var(--color-text-red);">*</span>
          </label>
          <Calendar
            v-model="referendumForm.date_end"
            expand
            enable-time-picker
            time-picker-inline
            enable-minutes
            is24
            format="yyyy-MM-dd-HH:mm"
            :class="{ invalid: !validation.date_end || !validation.startBeforeEnd }"
          >
            <template #trigger>
              <Button
                id="end-date-picker"
                class="date-picker-button"
                expand
                :class="{ error: !validation.date_end || !validation.dateRange || !validation.startBeforeEnd }"
              >
                {{ referendumForm.date_end ? referendumForm.date_end.toLocaleString('en-US', {
                  year: 'numeric',
                  month: '2-digit',
                  day: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                  hour12: false,
                }) : 'Choose end date and time' }}
                <template #end>
                  <Icon name="ph:calendar" />
                </template>
              </Button>
            </template>
          </Calendar>
          <span v-if="!validation.date_end" class="error-text">End date is required</span>
          <span v-else-if="!validation.startBeforeEnd" class="error-text">End date must be after the start date</span>
          <span v-else-if="!validation.dateRange" class="error-text">End date must be in the future</span>
        </Flex>

        <!-- Multiple Choice Option -->
        <Flex gap="xs" y-center>
          <Checkbox
            v-model="referendumForm.multiple_choice"
            name="multiple_choice"
            label="Allow multiple choice voting"
          />
        </Flex>

        <!-- Choices Section -->
        <Flex column :gap="0" class="choices-section" expand>
          <label class="input-label">Voting Choices (minimum 2 required)</label>

          <!-- Warning about removing choices in edit mode -->
          <Flex v-if="isRemovingChoices" expand class="warning-box">
            <Flex gap="xs" y-center>
              <Icon name="ph:warning" class="warning-icon" />
              <div>
                <p class="warning-text">
                  <strong>Warning:</strong> Removing voting choices will delete all existing votes for this referendum.
                </p>
                <p class="warning-subtext">
                  Adding new choices is safe and won't affect existing votes.
                </p>
              </div>
            </Flex>
          </Flex>

          <!-- Add new choice -->
          <Flex gap="xs" y-center expand>
            <Input
              v-model="newChoiceInput"
              expand
              name="new-choice"
              placeholder="Enter a voting choice"
              @keydown.enter.prevent="handleChoiceKeyup"
            />
            <Button
              variant="accent"
              square
              :disabled="!newChoiceInput.trim()"
              @click="addChoice"
            >
              <Icon name="ph:plus" />
            </Button>
          </Flex>

          <!-- Display existing choices -->
          <div v-if="referendumForm.choices.length > 0" class="choices-display">
            <Badge
              v-for="(choice, index) in referendumForm.choices"
              :key="index"
              size="s"
              variant="neutral"
              class="choice-badge"
            >
              {{ choice }}
              <Button
                size="s"
                square
                class="choice-remove-btn"
                @click="removeChoice(index)"
              >
                <Icon name="ph:x" />
              </Button>
            </Badge>
          </div>

          <p v-if="!validation.choices" class="error-text">
            At least 2 choices are required
          </p>
        </Flex>
      </Flex>

      <!-- Form Actions -->
      <Flex gap="s" x-end class="form-actions" />
    </Flex>

    <template #footer>
      <Flex gap="xs" class="form-actions">
        <Button
          type="submit"
          variant="accent"
          :disabled="!isValid"
          :loading="saveLoading"
          @click.prevent="handleSubmit"
        >
          <template #start>
            <Icon name="ph:check" />
          </template>
          {{ submitButtonText }}
        </Button>

        <Button @click.prevent="handleClose">
          Cancel
        </Button>

        <div class="flex-1" />

        <Button
          v-if="isEditMode && canDeleteReferendums"
          variant="danger"
          square
          :loading="deleteLoading"
          data-title-left="Delete referendum"
          @click.prevent="handleDelete"
        >
          <Icon name="ph:trash" />
        </Button>
      </Flex>
    </template>

    <!-- Delete Confirmation Modal -->
    <ConfirmModal
      v-if="props.referendum"
      v-model:open="showDeleteConfirm"
      v-model:confirm="confirmDelete"
      title="Delete Referendum"
      :description="`Are you sure you want to delete '${props.referendum.title}'? This action cannot be undone and will also delete all votes.`"
      confirm-text="Delete"
      cancel-text="Cancel"
      :destructive="true"
    />
  </Sheet>
</template>

<style lang="scss" scoped>
.referendum-form {
  padding-bottom: var(--space);

  .input-label {
    font-size: var(--font-size-s);
    font-weight: var(--font-weight-medium);
    color: var(--color-text);
    margin-bottom: var(--space-xs);
    display: block;
  }

  .timing-info {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    padding: var(--space-s);
    background-color: var(--color-bg-lowered);
    border-radius: var(--border-radius-s);
    border-left: 3px solid var(--color-accent);
  }

  .choices-section {
    .warning-box {
      background-color: var(--color-bg-lowered);
      border: 1px solid var(--color-text-red);
      border-radius: var(--border-radius-s);
      padding: var(--space-m);
      margin-bottom: var(--space-m);

      .warning-icon {
        color: var(--color-text-red);
        font-size: var(--font-size-l);
        flex-shrink: 0;
      }

      .warning-text {
        color: var(--color-text);
        font-size: var(--font-size-s);
        margin: 0 0 var(--space-xs) 0;
        font-weight: var(--font-weight-medium);
      }

      .warning-subtext {
        color: var(--color-text-light);
        font-size: var(--font-size-xs);
        margin: 0;
      }
    }

    .choices-display {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-xs);
      margin-top: var(--space-s);
    }

    .choice-badge {
      display: flex;
      align-items: center;
      gap: var(--space-xs);

      .choice-remove-btn {
        padding: 0;
        min-width: auto;
        height: auto;
        background: transparent;
        color: var(--color-text-red);

        &:hover {
          background: var(--color-text-red);
          color: var(--color-text-inverse);
        }
      }
    }

    .error-text {
      color: var(--color-text-red);
      font-size: var(--font-size-xs);
      margin-top: var(--space-xs);
    }
  }

  .date-picker-container {
    .error-text {
      color: var(--color-text-red);
      font-size: var(--font-size-xs);
      margin-top: var(--space-xs);
      display: block;
    }

    .required {
      color: var(--color-text-red);
    }
  }

  .form-actions {
    padding-top: var(--space-m);
    border-top: 1px solid var(--color-border);
  }
}

.form-actions {
  margin-top: var(--space);
}

.flex-1 {
  flex: 1;
}

.required {
  color: var(--color-danger);
}
</style>
