<script setup lang="ts">
import type { TablesInsert, TablesUpdate } from '@/types/database.types'
import { Badge, Button, Calendar, Flex, Input, Sheet, Switch, Textarea } from '@dolanske/vui'
import { computed, ref, watch } from 'vue'
import ConfirmModal from '@/components/Shared/ConfirmModal.vue'
import FileUpload from '@/components/Shared/FileUpload.vue'
import {
  deleteAnnouncementBackground,
  deleteAnnouncementBanner,
  getAnnouncementBackgroundUrl,
  getAnnouncementBannerUrl,
  uploadAnnouncementBackground,
  uploadAnnouncementBanner,
} from '@/lib/storage'

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
  tags: string[] | null
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

const supabase = useSupabaseClient()

// Form state
const announcementForm = ref({
  title: '',
  description: '',
  markdown: '',
  link: '',
  pinned: false,
  published_at: null as Date | null,
  tags: [] as string[],
})

// New tag input for adding individual tags
const newTagInput = ref('')

// State for delete confirmation modal
const showDeleteConfirm = ref(false)

const bannerUrl = ref<string | null>(null)
const backgroundUrl = ref<string | null>(null)
const bannerUploading = ref(false)
const backgroundUploading = ref(false)
const bannerDeleting = ref(false)
const backgroundDeleting = ref(false)
const bannerError = ref<string | null>(null)
const backgroundError = ref<string | null>(null)
const canManageAssets = computed(() => !!props.announcement)

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
        tags: newAnnouncement.tags || [],
      }
      void refreshBannerPreview(newAnnouncement.id)
      void refreshBackgroundPreview(newAnnouncement.id)
    }
    else {
      announcementForm.value = {
        title: '',
        description: '',
        markdown: '',
        link: '',
        pinned: false,
        published_at: new Date(),
        tags: [],
      }
      bannerUrl.value = null
      backgroundUrl.value = null
      bannerError.value = null
      backgroundError.value = null
    }
  },
  { immediate: true },
)

async function refreshBannerPreview(announcementId: number | null | undefined) {
  if (!announcementId) {
    bannerUrl.value = null
    return
  }

  try {
    bannerError.value = null
    bannerUrl.value = await getAnnouncementBannerUrl(supabase, announcementId)
  }
  catch (error) {
    console.error('Error loading announcement banner:', error)
    bannerUrl.value = null
  }
}

async function refreshBackgroundPreview(announcementId: number | null | undefined) {
  if (!announcementId) {
    backgroundUrl.value = null
    return
  }

  try {
    backgroundError.value = null
    backgroundUrl.value = await getAnnouncementBackgroundUrl(supabase, announcementId)
  }
  catch (error) {
    console.error('Error loading announcement background:', error)
    backgroundUrl.value = null
  }
}

async function handleBannerUpload(file: File) {
  if (!props.announcement) {
    bannerError.value = 'Save the announcement before uploading a banner.'
    return
  }

  try {
    bannerUploading.value = true
    bannerError.value = null
    await uploadAnnouncementBanner(supabase, props.announcement.id, file)
    await refreshBannerPreview(props.announcement.id)
  }
  catch (error) {
    console.error('Error uploading announcement banner:', error)
    bannerError.value = 'Failed to upload banner. Please try again.'
  }
  finally {
    bannerUploading.value = false
  }
}

async function handleBackgroundUpload(file: File) {
  if (!props.announcement) {
    backgroundError.value = 'Save the announcement before uploading a background.'
    return
  }

  try {
    backgroundUploading.value = true
    backgroundError.value = null
    await uploadAnnouncementBackground(supabase, props.announcement.id, file)
    await refreshBackgroundPreview(props.announcement.id)
  }
  catch (error) {
    console.error('Error uploading announcement background:', error)
    backgroundError.value = 'Failed to upload background. Please try again.'
  }
  finally {
    backgroundUploading.value = false
  }
}

async function handleBannerDelete() {
  if (!props.announcement)
    return

  try {
    bannerDeleting.value = true
    bannerError.value = null
    await deleteAnnouncementBanner(supabase, props.announcement.id)
    bannerUrl.value = null
  }
  catch (error) {
    console.error('Error deleting announcement banner:', error)
    bannerError.value = 'Failed to delete banner. Please try again.'
  }
  finally {
    bannerDeleting.value = false
  }
}

async function handleBackgroundDelete() {
  if (!props.announcement)
    return

  try {
    backgroundDeleting.value = true
    backgroundError.value = null
    await deleteAnnouncementBackground(supabase, props.announcement.id)
    backgroundUrl.value = null
  }
  catch (error) {
    console.error('Error deleting announcement background:', error)
    backgroundError.value = 'Failed to delete background. Please try again.'
  }
  finally {
    backgroundDeleting.value = false
  }
}

function handleBannerInvalid(message: string) {
  bannerError.value = message
}

function handleBackgroundInvalid(message: string) {
  backgroundError.value = message
}

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
    tags: announcementForm.value.tags.length > 0 ? announcementForm.value.tags : null,
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

// Add a new tag
function addTag() {
  const rawTag = newTagInput.value.trim()
  if (rawTag) {
    // Normalize tag: lowercase and replace spaces with hyphens
    const normalizedTag = rawTag.toLowerCase().replace(/\s+/g, '-')
    if (!announcementForm.value.tags.includes(normalizedTag)) {
      announcementForm.value.tags.push(normalizedTag)
      newTagInput.value = ''
    }
  }
}

// Remove a tag
function removeTag(tagToRemove: string) {
  announcementForm.value.tags = announcementForm.value.tags.filter(tag => tag !== tagToRemove)
}

// Handle enter key in new tag input
function handleTagInputEnter() {
  addTag()
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
        <span v-if="props.isEditMode && props.announcement" class="text-color-light text-xxs">
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

        <div class="tags-section">
          <label class="input-label">Tags</label>

          <!-- Add new tag -->
          <Flex gap="xs" y-center>
            <Input
              v-model="newTagInput"
              expand
              name="new-tag"
              placeholder="Enter a tag"
              @keydown.enter.prevent="handleTagInputEnter"
            />
            <Button
              variant="accent"
              square
              :disabled="!newTagInput.trim()"
              @click="addTag"
            >
              <Icon name="ph:plus" />
            </Button>
          </Flex>

          <!-- Display existing tags -->
          <div v-if="announcementForm.tags.length > 0" class="tags-display">
            <Badge
              v-for="tag in announcementForm.tags"
              :key="tag"
              size="s"
              variant="neutral"
              class="tag-badge"
            >
              {{ tag }}
              <Button
                size="s"
                square
                class="tag-remove-btn"
                @click="removeTag(tag)"
              >
                <Icon name="ph:x" />
              </Button>
            </Badge>
          </div>
        </div>
      </Flex>

      <!-- Media Section -->
      <Flex column gap="m" expand>
        <h4>Media</h4>

        <Flex column gap="xs" expand>
          <label class="input-label">Banner Image</label>
          <FileUpload
            label="Upload banner"
            :preview-url="bannerUrl"
            :loading="bannerUploading"
            :deleting="bannerDeleting"
            :error="bannerError"
            :disabled="!canManageAssets"
            :show-delete="!!bannerUrl && canManageAssets"
            :aspect-ratio="16 / 9"
            @upload="handleBannerUpload"
            @delete="handleBannerDelete"
            @invalid="handleBannerInvalid"
          />
          <p v-if="!canManageAssets" class="media-upload__notice">
            Save the announcement before uploading media assets.
          </p>
          <p class="media-upload__hint">
            Displayed on pinned announcement cards and the announcement page hero.
          </p>
        </Flex>

        <Flex column gap="xs" expand>
          <label class="input-label">Background Image</label>
          <FileUpload
            label="Upload background"
            :preview-url="backgroundUrl"
            :loading="backgroundUploading"
            :deleting="backgroundDeleting"
            :error="backgroundError"
            :disabled="!canManageAssets"
            :show-delete="!!backgroundUrl && canManageAssets"
            :aspect-ratio="21 / 9"
            @upload="handleBackgroundUpload"
            @delete="handleBackgroundDelete"
            @invalid="handleBackgroundInvalid"
          />
          <p class="media-upload__hint">
            Appears behind regular announcement cards for additional visual context.
          </p>
        </Flex>
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
            <span class="text-color-light text-xs">Pinned announcements appear at the top</span>
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

.input-label {
  font-size: var(--font-size-m);
  font-weight: var(--font-weight-medium);
  color: var(--color-text);
  margin-bottom: var(--space-xs);
}

.tags-section {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);

  .tags-display {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-xs);
    margin-top: var(--space-xs);
  }

  .tag-badge {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    position: relative;

    .tag-remove-btn {
      margin-left: var(--space-xs);
      padding: 2px;
      min-width: auto;
      min-height: auto;
      width: 16px;
      height: 16px;
      border-radius: 50%;
      background: rgba(0, 0, 0, 0.2);
      color: currentColor;

      &:hover {
        background: rgba(0, 0, 0, 0.4);
      }

      svg {
        font-size: 10px;
      }
    }
  }
}

.media-upload__notice {
  font-size: var(--font-size-xs);
  color: var(--color-text-light);
  margin: 0;
}

.media-upload__hint {
  font-size: var(--font-size-xxs);
  color: var(--color-text-light);
  margin: 0;
}
</style>
