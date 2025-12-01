<script setup lang="ts">
import { Alert, Button, Card, Flex, Input, Progress, Sheet, Switch } from '@dolanske/vui'
import { computed, ref, watch } from 'vue'

import FileUpload from '@/components/Shared/FileUpload.vue'
import { CMS_BUCKET_ID, formatBytes, joinAssetPath, normalizePrefix } from '@/lib/utils/cmsAssets'

interface Props {
  canUpload?: boolean
  currentPrefix?: string
}

const props = withDefaults(defineProps<Props>(), {
  canUpload: false,
  currentPrefix: '',
})

const emit = defineEmits<{
  uploaded: [paths: string[]]
}>()

const isOpen = defineModel<boolean>('isOpen', { default: false })

interface QueuedFile {
  id: string
  file: File
  targetName: string
}

const supabase = useSupabaseClient()
const targetFolder = ref('')
const fileQueue = ref<QueuedFile[]>([])
const uploading = ref(false)
const replaceExisting = ref(false)
const errorMessage = ref('')
const uploadProgress = ref<Record<string, number>>({})

const MAX_SIZE_BYTES = 5 * 1024 * 1024
const ACCEPTED_MIME_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif', 'image/svg+xml'] as const
const ACCEPT_ATTR = ACCEPTED_MIME_TYPES.join(',')
const ACCEPTED_MIME_SET = new Set<string>(ACCEPTED_MIME_TYPES)

const resolvedFolderLabel = computed(() => targetFolder.value ? `/${normalizePrefix(targetFolder.value)}` : '/ (root)')
const canSubmit = computed(() => props.canUpload && fileQueue.value.length > 0 && !uploading.value)

watch(() => isOpen.value, (open) => {
  if (open) {
    targetFolder.value = normalizePrefix(props.currentPrefix)
    fileQueue.value = []
    errorMessage.value = ''
    uploadProgress.value = {}
    replaceExisting.value = false
  }
})

async function handleUpload() {
  if (!canSubmit.value)
    return

  uploading.value = true
  errorMessage.value = ''
  const uploadedPaths: string[] = []

  try {
    for (const item of fileQueue.value) {
      const sanitizedFolder = normalizePrefix(targetFolder.value)
      const sanitizedName = sanitizeFileName(item.targetName)
      const storagePath = joinAssetPath(sanitizedFolder, sanitizedName)
      uploadProgress.value[item.id] = 0

      const { error } = await supabase.storage
        .from(CMS_BUCKET_ID)
        .upload(storagePath, item.file, {
          contentType: item.file.type,
          upsert: replaceExisting.value,
        })

      if (error)
        throw error

      uploadProgress.value[item.id] = 100
      uploadedPaths.push(storagePath)
    }

    emit('uploaded', uploadedPaths)
    isOpen.value = false
  }
  catch (error: unknown) {
    console.error('Failed to upload assets', error)
    errorMessage.value = error instanceof Error ? error.message : 'Failed to upload assets'
  }
  finally {
    uploading.value = false
  }
}

function enqueueFiles(files: File[]) {
  if (!props.canUpload)
    return

  const newQueued: QueuedFile[] = []

  files.forEach((file) => {
    if (!ACCEPTED_MIME_SET.has(file.type)) {
      errorMessage.value = 'Only PNG, JPG, WebP, GIF, or SVG files are allowed.'
      return
    }

    if (file.size > MAX_SIZE_BYTES) {
      errorMessage.value = 'Files must be 5MB or smaller.'
      return
    }

    const baseName = sanitizeFileName(file.name)
    const uniqueName = ensureUniqueName(baseName)
    newQueued.push({
      id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
      file,
      targetName: uniqueName,
    })
  })

  if (newQueued.length) {
    errorMessage.value = ''
    fileQueue.value = [...fileQueue.value, ...newQueued]
  }
}

function handleFileUpload(file: File) {
  enqueueFiles([file])
}

function handleFileUploadError(message: string) {
  errorMessage.value = message
}

function ensureUniqueName(name: string): string {
  const existing = new Set(fileQueue.value.map(item => item.targetName))
  if (!existing.has(name))
    return name

  const dotIndex = name.lastIndexOf('.')
  const base = dotIndex >= 0 ? name.slice(0, dotIndex) : name
  const extension = dotIndex >= 0 ? name.slice(dotIndex + 1) : ''
  let counter = 1

  let candidate = `${base}-${counter}${extension ? `.${extension}` : ''}`
  while (existing.has(candidate)) {
    counter++
    candidate = `${base}-${counter}${extension ? `.${extension}` : ''}`
  }

  return candidate
}

function removeFile(id: string) {
  if (uploading.value)
    return
  fileQueue.value = fileQueue.value.filter(file => file.id !== id)
  delete uploadProgress.value[id]
}

function sanitizeFileName(filename: string): string {
  const dotIndex = filename.lastIndexOf('.')
  const extension = dotIndex >= 0 ? filename.slice(dotIndex + 1).toLowerCase() : ''
  const base = dotIndex >= 0 ? filename.slice(0, dotIndex) : filename
  const slug = base
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    || 'asset'

  return extension ? `${slug}.${extension}` : slug
}

function closeDrawer() {
  if (uploading.value)
    return
  isOpen.value = false
}

function updateFileName(id: string, value: string) {
  fileQueue.value = fileQueue.value.map((file) => {
    if (file.id === id) {
      return {
        ...file,
        targetName: value.trim(),
      }
    }
    return file
  })
}
</script>

<template>
  <Sheet
    :open="isOpen"
    position="right"
    separator
    :size="520"
    @close="closeDrawer"
  >
    <template #header>
      <Flex column gap="xs">
        <h4>Upload Assets</h4>
        <p class="text-color-light text-s">
          Upload images into the hivecom-cms bucket for use inside markdown content.
        </p>
      </Flex>
    </template>

    <Flex column gap="m" class="upload-drawer">
      <Card class="upload-drawer__destination">
        <Flex column gap="xs">
          <span class="text-xs text-color-light">Destination Folder</span>
          <Input
            v-model="targetFolder"
            placeholder="Optional subfolder (e.g. events/prague)"
            :disabled="uploading"
            expand
          >
            <template #start>
              <Icon name="ph:folder-simple" />
            </template>
          </Input>
          <span class="text-xxs text-color-light">
            Current path: <strong>{{ resolvedFolderLabel }}</strong>
          </span>
        </Flex>
      </Card>

      <FileUpload
        label="Drag & drop images here, or click to browse"
        :disabled="!props.canUpload || uploading"
        :loading="uploading"
        variant="asset"
        :max-size-m-b="5"
        :multiple="true"
        :persistent-dropzone="true"
        :show-delete="false"
        :accept="ACCEPT_ATTR"
        @upload="handleFileUpload"
        @invalid="handleFileUploadError"
      />

      <Alert v-if="errorMessage" variant="danger">
        {{ errorMessage }}
      </Alert>

      <Card v-if="fileQueue.length" class="upload-drawer__queue">
        <Flex column gap="s">
          <Flex x-between y-center>
            <strong>Files Ready ({{ fileQueue.length }})</strong>
            <span class="text-xxs text-color-light">{{ replaceExisting ? 'Existing files will be overwritten' : 'Duplicates will be rejected' }}</span>
          </Flex>

          <div v-for="item in fileQueue" :key="item.id" class="upload-drawer__queue-item">
            <Flex column gap="xs">
              <Flex gap="s" y-center x-between>
                <Flex gap="xs" y-center>
                  <Icon :name="item.file.type.startsWith('image/') ? 'ph:image' : 'ph:file'" />
                  <span class="text-s">{{ item.file.name }}</span>
                </Flex>
                <Button
                  v-if="!uploading"
                  variant="gray"
                  size="s"
                  square
                  @click.stop="removeFile(item.id)"
                >
                  <Icon name="ph:x" />
                </Button>
              </Flex>

              <Input
                :model-value="item.targetName"
                :disabled="uploading"
                @update:model-value="value => updateFileName(item.id, typeof value === 'string' ? value : String(value ?? ''))"
              >
                <template #start>
                  <Icon name="ph:pencil-simple" />
                </template>
              </Input>

              <Flex x-between y-center class="text-xxs text-color-light">
                <span>{{ formatBytes(item.file.size) }}</span>
                <span>{{ item.file.type || 'Unknown' }}</span>
              </Flex>

              <Progress
                v-if="typeof uploadProgress[item.id] === 'number'"
                :model-value="uploadProgress[item.id] ?? 0"
                :height="6"
              />
            </Flex>
          </div>
        </Flex>
      </Card>
    </Flex>

    <template #footer>
      <Flex x-between y-center class="upload-drawer__footer">
        <Flex gap="s" y-center>
          <Switch v-model="replaceExisting" :disabled="uploading" />
          <div>
            <strong class="text-xs">Replace existing files</strong>
          </div>
        </Flex>

        <Flex gap="s">
          <Button variant="gray" :disabled="uploading" @click="closeDrawer">
            Cancel
          </Button>
          <Button
            variant="accent"
            :loading="uploading"
            :disabled="!canSubmit"
            @click="handleUpload"
          >
            <template #start>
              <Icon name="ph:cloud-arrow-up" />
            </template>
            Upload {{ fileQueue.length ? `(${fileQueue.length})` : '' }}
          </Button>
        </Flex>
      </Flex>
    </template>
  </Sheet>
</template>

<style scoped lang="scss">
.upload-drawer {
  &__queue {
    max-height: 320px;
    overflow-y: auto;
  }

  &__queue-item {
    padding: var(--space-m) 0;
    border-top: 1px solid var(--color-border-subtle);

    &:first-of-type {
      border-top: none;
      padding-top: 0;
    }
  }

  &__footer {
    flex-wrap: wrap;
    gap: var(--space-s);
  }
}
</style>
