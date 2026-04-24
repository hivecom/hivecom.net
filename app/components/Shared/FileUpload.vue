<script setup lang="ts">
import { Button, Flex } from '@dolanske/vui'
import { computed, onUnmounted, ref, watch } from 'vue'

interface Props {
  expand?: boolean
  label?: string
  accept?: string
  maxSizeMB?: number
  previewUrl?: string | null
  loading?: boolean
  error?: string | null
  disabled?: boolean
  variant?: 'avatar' | 'asset' | 'icon'
  showDelete?: boolean
  deleting?: boolean
  aspectRatio?: number // Width/height ratio (e.g., 16/9 = 1.778, 9/16 = 0.5625)
  minHeight?: number // Minimum height in pixels
  maxHeight?: number // Maximum height in pixels
  iconSize?: number // Size of the icon square in pixels (icon variant only, default 64)
  multiple?: boolean
  persistentDropzone?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  label: 'Choose File',
  accept: 'image/jpeg,image/jpg,image/png,image/webp,image/gif',
  maxSizeMB: 5,
  variant: 'asset',
  showDelete: false,
  deleting: false,
  minHeight: 160,
  iconSize: 64,
  multiple: false,
  persistentDropzone: false,
})

const emit = defineEmits<{
  upload: [file: File]
  remove: []
  delete: []
  invalid: [message: string]
}>()

const fileInput = ref<HTMLInputElement>()
const dragOver = ref(false)
const imageExists = ref(true) // Assume true initially, check when previewUrl changes
const localPreviewUrl = ref<string | null>(null) // For showing preview of uploaded file
const internalError = ref<string | null>(null)

// Computed properties
const maxSizeBytes = computed(() => props.maxSizeMB * 1024 * 1024)
const currentPreviewUrl = computed(() => localPreviewUrl.value || props.previewUrl)
const hasPreview = computed(() => !!currentPreviewUrl.value && imageExists.value)
const isAvatarVariant = computed(() => props.variant === 'avatar')
const isIconVariant = computed(() => props.variant === 'icon')
const allowedTypes = computed(() => props.accept.split(',').map(type => type.trim()).filter(Boolean))
const shouldShowPreview = computed(() => hasPreview.value && !props.persistentDropzone)

// Computed style for aspect ratio (asset/avatar variants)
const aspectRatioStyle = computed(() => {
  if (isAvatarVariant.value || isIconVariant.value || !props.aspectRatio) {
    return {}
  }

  const style: Record<string, string> = {
    aspectRatio: props.aspectRatio.toString(),
  }

  if (props.maxHeight) {
    style.maxHeight = `${props.maxHeight}px`
    const maxWidth = props.maxHeight * props.aspectRatio
    style.maxWidth = `${maxWidth}px`
  }

  // Only apply minHeight when there's no aspectRatio - with aspectRatio set,
  // width:100% + aspect-ratio drives the height naturally. Forcing a minHeight
  // alongside aspect-ratio causes the box to not respect its container width.
  if (!props.aspectRatio && props.minHeight && (!props.maxHeight || props.minHeight <= props.maxHeight)) {
    style.minHeight = `${props.minHeight}px`
  }

  return style
})

// Fixed square size for the icon variant - maxHeight takes priority over iconSize
const iconSquareStyle = computed(() => {
  const size = props.maxHeight ?? props.iconSize
  return {
    width: `${size}px`,
    height: `${size}px`,
  }
})

// Handle file selection
function handleFileSelect(event: Event) {
  const target = event.target as HTMLInputElement
  const files = target.files ? [...target.files] : []
  if (!files.length)
    return

  const selection = props.multiple ? files : files.slice(0, 1)
  selection.forEach(processFile)
  target.value = ''
}

// Handle drag and drop
function handleDrop(event: DragEvent) {
  event.preventDefault()
  dragOver.value = false

  const files = event.dataTransfer?.files
  if (!files || !files.length)
    return

  const fileArray = [...files]
  const selection = props.multiple ? fileArray : fileArray.slice(0, 1)
  selection.forEach(processFile)
}

function handleDragOver(event: DragEvent) {
  event.preventDefault()
  dragOver.value = true
}

function handleDragLeave() {
  dragOver.value = false
}

// Process and validate file
function isAcceptedType(fileType: string): boolean {
  if (!fileType)
    return false
  return allowedTypes.value.some((type) => {
    if (type.endsWith('/*'))
      return fileType.startsWith(type.slice(0, -2))
    return type === fileType
  })
}

function processFile(file: File) {
  if (!isAcceptedType(file.type)) {
    const msg = 'Unsupported file type. Please upload an accepted image format.'
    internalError.value = msg
    emit('invalid', msg)
    return
  }

  if (file.size > maxSizeBytes.value) {
    const msg = `File too large. Max size is ${props.maxSizeMB}MB.`
    internalError.value = msg
    emit('invalid', msg)
    return
  }

  internalError.value = null

  if (!props.persistentDropzone) {
    if (localPreviewUrl.value)
      URL.revokeObjectURL(localPreviewUrl.value)
    localPreviewUrl.value = URL.createObjectURL(file)
  }
  else if (localPreviewUrl.value) {
    URL.revokeObjectURL(localPreviewUrl.value)
    localPreviewUrl.value = null
  }

  imageExists.value = true
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
  <Flex column :gap="0" class="file-upload" :class="{ 'file-upload--avatar': isAvatarVariant }" :expand="expand">
    <!-- Hidden file input -->
    <input
      ref="fileInput"
      type="file"
      :accept="accept"
      :multiple="multiple"
      :disabled="disabled || loading"
      hidden
      @change="handleFileSelect"
    >

    <!-- ── Icon variant ──────────────────────────────────────────────────────── -->
    <template v-if="isIconVariant">
      <Flex y-center gap="xs">
        <!-- Square drop target, always visible -->
        <div
          class="file-upload__icon-square"
          :class="{
            'file-upload__icon-square--drag-over': dragOver,
            'file-upload__icon-square--disabled': disabled,
          }"
          :style="iconSquareStyle"
          @click="openFileDialog"
          @drop="handleDrop"
          @dragover="handleDragOver"
          @dragleave="handleDragLeave"
        >
          <img
            v-if="shouldShowPreview"
            :src="currentPreviewUrl!"
            :alt="label"
            class="file-upload__icon-square-image"
          >
          <Icon
            v-else
            :name="loading ? 'ph:spinner' : 'ph:image'"
            :size="24"
            :spin="loading"
            class="file-upload__icon-square-placeholder"
          />
          <div v-if="shouldShowPreview" class="file-upload__icon-square-overlay">
            <Icon name="ph:pencil-simple" :size="16" />
          </div>
        </div>

        <!-- X button only appears once an image is loaded -->
        <Button
          v-if="shouldShowPreview"
          size="s"
          square
          variant="danger"
          :loading="showDelete ? deleting : loading"
          :disabled="disabled || loading || deleting"
          @click="showDelete ? deleteFile() : removeFile()"
        >
          <Icon name="ph:x" :size="14" />
        </Button>
      </Flex>
    </template>

    <!-- ── Avatar / Asset variants ─────────────────────────────────────────── -->
    <template v-else>
      <!-- Preview Image (if exists) -->
      <div
        v-if="shouldShowPreview"
        class="file-upload__preview"
        :class="{ 'file-upload__preview--avatar': isAvatarVariant }"
        :style="aspectRatioStyle"
      >
        <img :src="currentPreviewUrl!" :alt="label" class="file-upload__image">
        <div class="file-upload__overlay">
          <Flex gap="xs" class="file-upload__actions" wrap x-center>
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
        :style="aspectRatioStyle"
        @click="openFileDialog"
        @drop="handleDrop"
        @dragover="handleDragOver"
        @dragleave="handleDragLeave"
      >
        <Flex column gap="m" y-center x-center class="file-upload__content">
          <div class="file-upload__std-icon">
            <Icon :name="loading ? 'ph:spinner' : 'ph:upload'" :spin="loading" />
          </div>

          <Flex column gap="xs" x-center y-center>
            <p class="file-upload__label">
              {{ loading ? 'Uploading...' : label }}
            </p>
            <p class="file-upload__hint">
              Click or drag to upload
            </p>
            <p class="file-upload__size-hint">
              Max size: {{ formatFileSize(maxSizeBytes) }}
            </p>
          </Flex>
        </Flex>
      </div>
    </template>

    <!-- Error Message -->
    <div v-if="error || internalError" class="file-upload__error">
      {{ error || internalError }}
    </div>
  </Flex>
</template>

<style scoped lang="scss">
.file-upload {
  position: relative;
  min-width: 0;

  &--avatar {
    max-width: 256px;
  }

  // ── Icon variant ────────────────────────────────────────────────────────

  &__icon-square {
    position: relative;
    flex-shrink: 0;
    border-radius: var(--border-radius-m);
    border: 2px dashed var(--color-border);
    overflow: hidden;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--color-bg-lowered);
    transition: border-color var(--transition);

    // Solid border once an image is loaded - handled via the overlay presence
    &:has(.file-upload__icon-square-image) {
      border-style: solid;
    }

    &:hover:not(&--disabled) {
      border-color: var(--color-accent);

      .file-upload__icon-square-overlay {
        opacity: 1;
      }
    }

    &--drag-over {
      border-color: var(--color-accent);
      background: var(--color-bg-raised);
    }

    &--disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  }

  &__icon-square-image {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  &__icon-square-placeholder {
    color: var(--color-text-lighter);
  }

  &__icon-square-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.55);
    opacity: 0;
    transition: opacity var(--transition);

    .iconify {
      color: var(--color-text-invert);
    }
  }

  // ── Avatar / Asset variants ─────────────────────────────────────────────

  &__preview {
    position: relative;
    border-radius: var(--border-radius-m);
    overflow: hidden;
    background: var(--color-bg-subtle);
    border: 2px solid var(--color-border);

    &--avatar {
      width: 240px;
      height: 240px;
      border-radius: var(--border-radius-pill);
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
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;

    /* When aspect ratio is set, width:100% + aspect-ratio drives the height */
    &[style*='aspect-ratio'] {
      width: 100%;
      max-width: 100%;
      padding: var(--space-s);
    }

    &--avatar {
      width: 212px;
      height: 212px;
      border-radius: var(--border-radius-pill);
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
    width: 100%;
    min-width: 0;
    overflow: hidden;
  }

  &__std-icon {
    font-size: 2rem;
    color: var(--color-text-light);
  }

  &__label {
    font-weight: var(--font-weight-medium);
    color: var(--color-text);
    margin: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 100%;
  }

  &__hint {
    font-size: var(--font-size-s);
    color: var(--color-text-light);
    margin: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 100%;
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
