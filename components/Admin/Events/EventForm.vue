<script setup lang="ts">
import type { Tables } from '~/types/database.types'
import { Button, Flex, Input, Sheet, Textarea } from '@dolanske/vui'
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

// Form state
const eventForm = ref({
  title: '',
  description: '',
  note: '',
  date: '',
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
      eventForm.value = {
        title: newEvent.title,
        description: newEvent.description,
        note: newEvent.note || '',
        date: newEvent.date,
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
        date: '',
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

  // Prepare the data to save
  const eventData = {
    title: eventForm.value.title.trim(),
    description: eventForm.value.description.trim(),
    note: eventForm.value.note.trim() || null,
    date: eventForm.value.date,
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
const formTitle = computed(() => props.isEditMode ? 'Edit Event' : 'Create Event')
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
          label="Details (Supports Markdown)"
          placeholder="Additional event details in markdown format (optional)"
          :rows="6"
        />
        <p class="help-text">
          You can use markdown formatting for rich text content (headings, lists, links, etc.)
        </p>
      </Flex>

      <!-- Event Details -->
      <Flex column gap="m" expand>
        <h4>Event Details</h4>

        <!-- First row: Date and Location -->
        <Flex gap="m" wrap>
          <Input
            v-model="eventForm.date"
            expand
            name="date"
            type="date"
            label="Date"
            required
            :valid="validation.date"
            error="Date is required"
          />

          <Input
            v-model="eventForm.location"
            expand
            name="location"
            label="Location"
            placeholder="Enter event location (optional)"
          />
        </Flex>

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
          v-if="isEditMode"
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

<style scoped>
.event-form {
  padding-bottom: var(--space);
}

h4 {
  margin-top: 0;
  margin-bottom: var(--space-xs);
}

.help-text {
  font-size: var(--font-size-sm);
  color: var(--color-text-muted);
  margin-top: var(--space-xs);
}

.form-actions {
  margin-top: var(--space);
}

.flex-1 {
  flex: 1;
}
</style>
