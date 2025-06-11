<script setup lang="ts">
import type { Tables } from '~/types/database.types'
import { Button, Calendar, Flex, Grid, Input, Sheet, Textarea } from '@dolanske/vui'
import { computed, ref, watch } from 'vue'

import ConfirmModal from '../../Shared/ConfirmModal.vue'

const props = defineProps<{
  event: Tables<'events'> | null
  isEditMode: boolean
}>()

// Define emits
const emit = defineEmits(['save', 'delete'])

// Define model for sheet visibility
const isOpen = defineModel<boolean>('isOpen')

// Get admin permissions
const { hasPermission } = useAdminPermissions()
const canDeleteEvents = computed(() => hasPermission('events.delete'))

// Form state
const eventForm = ref({
  title: '',
  description: '',
  note: '',
  date: null as Date | null,
  duration_days: null as number | null,
  duration_hours: null as number | null,
  duration_minutes: null as number | null,
  location: '',
  link: '',
  markdown: '',
})

// State for delete confirmation modal
const showDeleteConfirm = ref(false)

// Form validation
const validation = computed(() => ({
  title: !!eventForm.value.title.trim(),
  description: !!eventForm.value.description.trim(),
  date: !!eventForm.value.date,
}))

const isValid = computed(() => Object.values(validation.value).every(Boolean))

// Update form data when event prop changes
watch(
  () => props.event,
  (newEvent) => {
    if (newEvent) {
      // Convert total minutes to separate duration fields
      const totalMinutes = newEvent.duration_minutes || 0
      const days = Math.floor(totalMinutes / (24 * 60))
      const hours = Math.floor((totalMinutes % (24 * 60)) / 60)
      const minutes = totalMinutes % 60

      eventForm.value = {
        title: newEvent.title,
        description: newEvent.description,
        note: newEvent.note || '',
        date: newEvent.date ? new Date(newEvent.date) : null,
        duration_days: days > 0 ? days : null,
        duration_hours: hours > 0 ? hours : null,
        duration_minutes: minutes > 0 ? minutes : null,
        location: newEvent.location || '',
        link: newEvent.link || '',
        markdown: newEvent.markdown || '',
      }
    }
    else {
      // Reset form for new event
      eventForm.value = {
        title: '',
        description: '',
        note: '',
        date: null,
        duration_days: null,
        duration_hours: null,
        duration_minutes: null,
        location: '',
        link: '',
        markdown: '',
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

  // Calculate total duration in minutes from separate fields
  const totalDurationMinutes
    = (eventForm.value.duration_days || 0) * 24 * 60
      + (eventForm.value.duration_hours || 0) * 60
      + (eventForm.value.duration_minutes || 0)

  // Prepare the data to save
  const eventData = {
    title: eventForm.value.title.trim(),
    description: eventForm.value.description.trim(),
    note: eventForm.value.note.trim() || null,
    date: eventForm.value.date ? eventForm.value.date.toISOString() : '',
    duration_minutes: totalDurationMinutes > 0 ? totalDurationMinutes : null,
    location: eventForm.value.location.trim() || null,
    link: eventForm.value.link.trim() || null,
    markdown: eventForm.value.markdown.trim() || null,
  }

  emit('save', eventData)
}

// Open confirmation modal for deletion
function handleDelete() {
  if (!props.event)
    return

  showDeleteConfirm.value = true
}

// Perform actual deletion when confirmed
function confirmDelete() {
  if (!props.event)
    return

  emit('delete', props.event.id)
}

// Computed properties for form title and button text
const formTitle = computed(() => props.isEditMode ? 'Edit Event' : 'Add Event')
const submitButtonText = computed(() => props.isEditMode ? 'Update Event' : 'Create Event')
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
      <h4>{{ formTitle }}</h4>
    </template>

    <Flex column gap="l" class="event-form">
      <!-- Basic Information -->
      <Flex column gap="m" expand>
        <h4>Basic Information</h4>

        <Input
          v-model="eventForm.title"
          expand
          name="title"
          label="Title"
          required
          :valid="validation.title"
          error="Title is required"
          placeholder="Enter event title"
        />

        <Grid expand>
          <div class="event-form__date-picker-container">
            <label for="date-picker" class="event-form__date-picker-label">
              Date <span class="required" style="color: var(--color-text-red);">*</span>
            </label>
            <Calendar
              v-model="eventForm.date"
              expand
              enable-time-picker
              time-picker-inline
              enable-minutes
              enable-seconds
              is24
              format="yyyy-MM-dd-HH:mm"
              :class="{ invalid: !validation.date }"
            >
              <template #trigger>
                <Button
                  id="date-picker"
                  class="event-form__date-picker-button"
                  expand
                  :class="{ error: !validation.date }"
                >
                  {{ eventForm.date ? eventForm.date.toLocaleString('en-US', {
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: false,
                  }) : 'Choose date and time' }}
                  <template #end>
                    <Icon name="ph:calendar" />
                  </template>
                </Button>
              </template>
            </Calendar>
            <span v-if="!validation.date" class="error-text">Date is required</span>
          </div>
        </Grid>

        <Flex column gap="s" expand>
          <div class="event-form__duration-label">
            Duration
          </div>
          <Grid :columns="3" gap="xs" expand>
            <Input
              style="width: auto"
              name="duration_days"
              type="number"
              placeholder="Days"
              :min="0"
              :model-value="eventForm.duration_days?.toString() || ''"
              @update:model-value="eventForm.duration_days = $event ? Number($event) : null"
            />
            <Input
              name="duration_hours"
              type="number"
              placeholder="Hours"
              :min="0"
              :max="23"
              :model-value="eventForm.duration_hours?.toString() || ''"
              @update:model-value="eventForm.duration_hours = $event ? Number($event) : null"
            />
            <Input
              name="duration_minutes"
              type="number"
              placeholder="Minutes"
              :min="0"
              :max="59"
              :model-value="eventForm.duration_minutes?.toString() || ''"
              @update:model-value="eventForm.duration_minutes = $event ? Number($event) : null"
            />
          </Grid>
        </Flex>

        <Textarea
          v-model="eventForm.description"
          expand
          name="description"
          label="Description"
          required
          :valid="validation.description"
          error="Description is required"
          placeholder="Enter event description"
          :rows="3"
        />

        <Input
          v-model="eventForm.note"
          expand
          name="note"
          label="Note"
          placeholder="Short note about the event (optional)"
        />

        <!-- Markdown Content -->
        <Textarea
          v-model="eventForm.markdown"
          expand
          name="markdown"
          label="Markdown"
          placeholder="Additional event details in markdown format (optional)"
          :rows="6"
        />
      </Flex>

      <Input
        v-model="eventForm.location"
        expand
        name="location"
        label="Location"
        placeholder="Enter event location (optional)"
      />

      <!-- Second row: Link -->
      <Input
        v-model="eventForm.link"
        expand
        name="link"
        type="url"
        label="Link"
        placeholder="https://example.com (optional)"
      />
    </Flex>

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
          {{ submitButtonText }}
        </Button>

        <Button @click.prevent="handleClose">
          Cancel
        </Button>

        <div class="flex-1" />

        <Button
          v-if="isEditMode && canDeleteEvents"
          variant="danger"
          square
          data-title-left="Delete event"
          @click.prevent="handleDelete"
        >
          <Icon name="ph:trash" />
        </Button>
      </Flex>
    </template>
  </Sheet>

  <!-- Delete Confirmation Modal -->
  <ConfirmModal
    v-if="props.event"
    v-model:open="showDeleteConfirm"
    v-model:confirm="confirmDelete"
    title="Delete Event"
    :description="`Are you sure you want to delete '${props.event.title}'? This action cannot be undone.`"
    confirm-text="Delete"
    cancel-text="Cancel"
    :destructive="true"
  />
</template>

<style lang="scss" scoped>
.event-form {
  padding-bottom: var(--space);

  &__date-picker-container {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }

  &__date-picker-label {
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    color: var(--color-text);
  }

  &__duration-label {
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    color: var(--color-text);
  }
}

h4 {
  margin-top: 0;
  margin-bottom: var(--space-xs);
}

.help-text {
  font-size: var(--font-size-sm);
  color: var(--color-text-lightest);
  margin-top: var(--space-xs);
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

.error-text {
  font-size: var(--font-size-xs);
  color: var(--color-danger);
}
</style>
