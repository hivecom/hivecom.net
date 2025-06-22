<script setup lang="ts">
import type { TablesInsert, TablesUpdate } from '@/types/database.types'
import { Button, Calendar, Flex, Input, Sheet, Switch, Textarea } from '@dolanske/vui'
import { computed, ref, watch } from 'vue'
import ConfirmModal from '@/components/Shared/ConfirmModal.vue'

// Interface for announcement query result
interface QueryAnnouncement {
  created_at: string
  created_by: string
  description: string | null
  id: number
  link: string | null
  markdown: string
  modified_at: string | null
  modified_by: string | null
  pinned: boolean
  published_at: string
  title: string
}

const props = defineProps<{
  announcement: QueryAnnouncement | null
  isEditMode: boolean
}>()

// Define emits
const emit = defineEmits(['save', 'delete'])

// Define model for sheet visibility
const isOpen = defineModel<boolean>('isOpen')

// Form state
const announcementForm = ref({
  title: '',
  description: '',
  markdown: '',
  link: '',
  pinned: false,
  published_at: null as Date | null,
})

// State for delete confirmation modal
const showDeleteConfirm = ref(false)

// Form validation
const validation = computed(() => ({
  title: !!announcementForm.value.title.trim(),
  markdown: !!announcementForm.value.markdown.trim(),
  published_at: !!announcementForm.value.published_at,
}))

const isValid = computed(() => Object.values(validation.value).every(Boolean))

// Update form data when announcement prop changes
watch(
  () => props.announcement,
  (newAnnouncement) => {
    if (newAnnouncement) {
      announcementForm.value = {
        title: newAnnouncement.title || '',
        description: newAnnouncement.description || '',
        markdown: newAnnouncement.markdown || '',
        link: newAnnouncement.link || '',
        pinned: newAnnouncement.pinned || false,
        published_at: newAnnouncement.published_at ? new Date(newAnnouncement.published_at) : new Date(),
      }
    }
    else {
      announcementForm.value = {
        title: '',
        description: '',
        markdown: '',
        link: '',
        pinned: false,
        published_at: new Date(),
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
  const announcementData: TablesInsert<'announcements'> | TablesUpdate<'announcements'> = {
    title: announcementForm.value.title,
    description: announcementForm.value.description || null,
    markdown: announcementForm.value.markdown,
    link: announcementForm.value.link || null,
    pinned: announcementForm.value.pinned,
    published_at: announcementForm.value.published_at ? announcementForm.value.published_at.toISOString() : new Date().toISOString(),
  }

  emit('save', announcementData)
}

// Handle delete
function handleDelete() {
  if (!props.announcement)
    return
  showDeleteConfirm.value = true
}

// Confirm delete
function confirmDelete() {
  if (!props.announcement)
    return
  emit('delete', props.announcement.id)
}
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
        <h4>{{ props.isEditMode ? 'Edit Announcement' : 'Add Announcement' }}</h4>
        <span v-if="props.isEditMode && props.announcement" class="color-text-light text-xxs">
          {{ props.announcement.title }}
        </span>
      </Flex>
    </template>

    <!-- Announcement Form Section -->
    <Flex column gap="l" class="announcement-form">
      <!-- Basic Information -->
      <Flex column gap="m" expand>
        <h4>Basic Information</h4>

        <Input
          v-model="announcementForm.title"
          expand
          name="title"
          label="Title"
          required
          :valid="validation.title"
          error="Announcement title is required"
          placeholder="Enter announcement title"
        />

        <Flex column class="announcement-form__date-picker-container" expand>
          <label for="published-date-picker" class="announcement-form__date-picker-label">
            Publish Date <span class="required" style="color: var(--color-text-red);">*</span>
          </label>
          <Calendar
            v-model="announcementForm.published_at"
            expand
            enable-time-picker
            time-picker-inline
            enable-minutes
            is24
            format="yyyy-MM-dd-HH:mm"
            :class="{ invalid: !validation.published_at }"
          >
            <template #trigger>
              <Button
                id="published-date-picker"
                class="announcement-form__date-picker-button"
                expand
                :class="{ error: !validation.published_at }"
              >
                {{ announcementForm.published_at ? announcementForm.published_at.toLocaleString('en-US', {
                  year: 'numeric',
                  month: '2-digit',
                  day: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                  hour12: false,
                }) : 'Choose publication date and time' }}
                <template #end>
                  <Icon name="ph:calendar" />
                </template>
              </Button>
            </template>
          </Calendar>
        </Flex>

        <Textarea
          v-model="announcementForm.description"
          expand
          name="description"
          label="Description"
          placeholder="Enter announcement description (optional)"
          :rows="3"
        />

        <Input
          v-model="announcementForm.link"
          expand
          name="link"
          label="Link"
          placeholder="Enter external link (optional)"
        />
      </Flex>

      <!-- Content Section -->
      <Flex column gap="m" expand>
        <h4>Content</h4>

        <Textarea
          v-model="announcementForm.markdown"
          expand
          name="markdown"
          label="Markdown Content"
          required
          :valid="validation.markdown"
          error="Markdown content is required"
          placeholder="Enter markdown content"
          :rows="12"
        />
      </Flex>

      <!-- Settings Section -->
      <Flex column gap="m" expand>
        <h4>Settings</h4>

        <Flex gap="m" y-center>
          <Switch
            v-model="announcementForm.pinned"
            name="pinned"
          />
          <Flex column :gap="0">
            <label for="pinned" class="toggle-label">Pin Announcement</label>
            <span class="color-text-light text-xs">Pinned announcements appear at the top</span>
          </Flex>
        </Flex>
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
          data-title-left="Delete announcement"
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
      title="Confirm Delete Announcement"
      :description="`Are you sure you want to delete the announcement '${props.announcement?.title}'? This action cannot be undone.`"
      confirm-text="Delete"
      cancel-text="Cancel"
      :destructive="true"
    />
  </Sheet>
</template>

<style scoped lang="scss">
.announcement-form {
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
}

.form-actions {
  margin-top: var(--space);
}

.flex-1 {
  flex: 1;
}

.toggle-label {
  font-weight: var(--font-weight-medium);
  color: var(--color-text);
  cursor: pointer;
}

.required {
  color: var(--color-danger);
}
</style>
