<script setup lang="ts">
import { Button, Flex } from '@dolanske/vui'
import { computed, onUnmounted, ref, watch } from 'vue'

interface Props {
  label?: string
  accept?: string
  maxSizeMB?: number
  previewUrl?: string | null
  loading?: boolean
  error?: string | null
  disabled?: boolean
  variant?: 'avatar' | 'asset'
  showDelete?: boolean
  deleting?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  label: 'Choose File',
  accept: 'image/jpeg,image/jpg,image/png,image/webp',
  maxSizeMB: 5,
  variant: 'asset',
  showDelete: false,
  deleting: false,
})

const emit = defineEmits<{
  upload: [file: File]
  remove: []
  delete: []
}>()

const fileInput = ref<HTMLInputElement>()
const dragOver = ref(false)
const imageExists = ref(true) // Assume true initially, check when previewUrl changes
const localPreviewUrl = ref<string | null>(null) // For showing preview of uploaded file

// Computed properties
const maxSizeBytes = computed(() => props.maxSizeMB * 1024 * 1024)
const currentPreviewUrl = computed(() => localPreviewUrl.value || props.previewUrl)
const hasPreview = computed(() => !!currentPreviewUrl.value && imageExists.value)
const isAvatarVariant = computed(() => props.variant === 'avatar')

// Handle file selection
function handleFileSelect(event: Event) {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (file) {
    processFile(file)
  }
}

// Handle drag and drop
function handleDrop(event: DragEvent) {
  event.preventDefault()
  dragOver.value = false

  const files = event.dataTransfer?.files
  if (files?.length) {
    processFile(files[0])
  }
}

function handleDragOver(event: DragEvent) {
  event.preventDefault()
  dragOver.value = true
}

function handleDragLeave() {
  dragOver.value = false
}

// Process and validate file
function processFile(file: File) {
  // Validate file type
  const allowedTypes = props.accept.split(',').map(type => type.trim())
  if (!allowedTypes.includes(file.type)) {
    console.error('Invalid file type')
    return
  }

  // Validate file size
  if (file.size > maxSizeBytes.value) {
    console.error(`File size must be less than ${props.maxSizeMB}MB`)
    return
  }

  // Create local preview URL
  if (localPreviewUrl.value) {
    URL.revokeObjectURL(localPreviewUrl.value)
  }
  localPreviewUrl.value = URL.createObjectURL(file)
  imageExists.value = true // Local file always exists

  emit('upload', file)
}

// Open file dialog
function openFileDialog() {
  if (!props.disabled && !props.loading) {
    fileInput.value?.click()
  }
}

// Remove current file/preview
function removeFile() {
  if (fileInput.value) {
    fileInput.value.value = ''
  }
  // Clean up local preview URL
  if (localPreviewUrl.value) {
    URL.revokeObjectURL(localPreviewUrl.value)
    localPreviewUrl.value = null
  }
  emit('remove')
}

// Delete file from server
function deleteFile() {
  emit('delete')
}

// Format file size for display
function formatFileSize(bytes: number): string {
  if (bytes === 0)
    return '0 Bytes'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${Number.parseFloat((bytes / (k ** i)).toFixed(2))} ${sizes[i]}`
}

// Check if image exists at the given URL
function checkImageExists(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve(true)
    img.onerror = () => resolve(false)
    img.src = url
  })
}

// Watch for previewUrl changes and check if image exists
watch(() => props.previewUrl, async (newUrl) => {
  // Clear local preview when external previewUrl changes
  if (localPreviewUrl.value) {
    URL.revokeObjectURL(localPreviewUrl.value)
    localPreviewUrl.value = null
  }

  if (newUrl) {
    imageExists.value = await checkImageExists(newUrl)
  }
  else {
    imageExists.value = true
  }
}, { immediate: true })

// Cleanup on unmount
onUnmounted(() => {
  if (localPreviewUrl.value) {
    URL.revokeObjectURL(localPreviewUrl.value)
  }
})
</script>

<template>
  <Flex expand column :gap="0" class="file-upload" :class="{ 'file-upload--avatar': isAvatarVariant }">
    <!-- Hidden file input -->
    <input
      ref="fileInput"
      type="file"
      :accept="accept"
      :disabled="disabled || loading"
      hidden
      @change="handleFileSelect"
    >

    <!-- Preview Image (if exists) -->
    <div v-if="hasPreview" class="file-upload__preview" :class="{ 'file-upload__preview--avatar': isAvatarVariant }">
      <img :src="currentPreviewUrl!" :alt="label" class="file-upload__image">
      <div class="file-upload__overlay">
        <Flex gap="xs" class="file-upload__actions">
          <Button
            size="s"
            variant="accent"
            :loading="loading"
            :disabled="disabled"
            @click="openFileDialog"
          >
            <template #start>
              <Icon name="ph:upload" />
            </template>
            Replace
          </Button>
          <Button
            v-if="showDelete"
            size="s"
            variant="danger"
            :disabled="disabled || loading || deleting"
            :loading="deleting"
            @click="deleteFile"
          >
            <template #start>
              <Icon name="ph:trash" />
            </template>
            Delete
          </Button>
          <Button
            v-else
            size="s"
            variant="danger"
            :disabled="disabled || loading"
            @click="removeFile"
          >
            <template #start>
              <Icon name="ph:trash" />
            </template>
            Remove
          </Button>
        </Flex>
      </div>
    </div>

    <!-- Upload Area (if no preview) -->
    <div
      v-else
      class="file-upload__drop-zone"
      :class="{
        'file-upload__drop-zone--drag-over': dragOver,
        'file-upload__drop-zone--disabled': disabled,
        'file-upload__drop-zone--avatar': isAvatarVariant,
      }"
      @click="openFileDialog"
      @drop="handleDrop"
      @dragover="handleDragOver"
      @dragleave="handleDragLeave"
    >
      <Flex column gap="m" y-center x-center class="file-upload__content">
        <div class="file-upload__icon">
          <Icon :name="loading ? 'ph:spinner' : 'ph:upload'" :spin="loading" />
        </div>

        <Flex column gap="xs" x-center y-center>
          <p class="file-upload__label">
            {{ loading ? 'Uploading...' : label }}
          </p>
          <p class="file-upload__hint">
            {{ isAvatarVariant ? 'Click or drag to upload your avatar' : 'Click or drag to upload an image' }}
          </p>
          <p class="file-upload__size-hint">
            Max size: {{ formatFileSize(maxSizeBytes) }}
          </p>
        </Flex>
      </Flex>
    </div>

    <!-- Error Message -->
    <div v-if="error" class="file-upload__error">
      {{ error }}
    </div>
  </Flex>
</template>

<style scoped lang="scss">
.file-upload {
  position: relative;

  &--avatar {
    max-width: 256px;
  }

  &__preview {
    position: relative;
    border-radius: var(--border-radius-m);
    overflow: hidden;
    background: var(--color-bg-subtle);
    border: 2px solid var(--color-border);

    &--avatar {
      width: 240px;
      height: 240px;
      border-radius: 50%;
    }

    &:hover .file-upload__overlay {
      opacity: 1;
    }
  }

  &__image {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  &__overlay {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.7);
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    transition: opacity 0.2s ease;
  }

  &__drop-zone {
    width: 100%;
    border: 2px dashed var(--color-border);
    border-radius: var(--border-radius-m);
    padding: var(--space-xl);
    background: var(--color-bg-subtle);
    cursor: pointer;
    transition: all 0.2s ease;
    min-height: 160px;

    &--avatar {
      width: 240px;
      height: 240px;
      border-radius: 50%;
      padding: var(--space-m);
      min-height: auto;
    }

    &:hover:not(&--disabled) {
      border-color: var(--color-accent);
      background: var(--color-bg-raised);
    }

    &--drag-over {
      border-color: var(--color-accent);
      background: var(--color-bg-accent-subtle);
    }

    &--disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  }

  &__content {
    text-align: center;
    pointer-events: none;
    height: 100%;
  }

  &__icon {
    font-size: 2rem;
    color: var(--color-text-light);
  }

  &__label {
    font-weight: var(--font-weight-medium);
    color: var(--color-text);
    margin: 0;
  }

  &__hint {
    font-size: var(--font-size-s);
    color: var(--color-text-light);
    margin: 0;
  }

  &__size-hint {
    font-size: var(--font-size-xs);
    color: var(--color-text-lightest);
    margin: 0;
  }

  &__error {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    padding: var(--space-s);
    background: var(--color-bg-red-subtle);
    border: 1px solid var(--color-border-red);
    border-radius: var(--border-radius-s);
    color: var(--color-text-red);
    font-size: var(--font-size-xs);

    .iconify {
      color: var(--color-text-red);
    }
  }

  &__actions {
    .vui-button {
      backdrop-filter: blur(4px);
    }
  }
}
</style>
