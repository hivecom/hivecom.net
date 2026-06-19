<script setup lang="ts">
import { Alert, Button, Card, CopyClipboard, Divider, Flex, pushToast } from '@dolanske/vui'
import { computed, onBeforeUnmount, ref } from 'vue'
import { useSupabaseUser } from '#imports'
import { useDepot } from '@/composables/useDepot'

// Quick test bench for Depot uploads, driven by the useDepot composable.
const depot = useDepot()
const user = useSupabaseUser()
const isAuthed = computed(() => !!user.value)

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error'
}

const fileInput = ref<HTMLInputElement | null>(null)
const selectedFile = ref<File | null>(null)
const localPreview = ref<string | null>(null)
const uploading = ref(false)
const uploadedUrl = ref<string | null>(null)

function clearPreview() {
  if (localPreview.value) {
    URL.revokeObjectURL(localPreview.value)
    localPreview.value = null
  }
}

function onFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0] ?? null
  uploadedUrl.value = null
  clearPreview()
  selectedFile.value = file
  if (file)
    localPreview.value = URL.createObjectURL(file)
}

async function upload() {
  if (!selectedFile.value || uploading.value)
    return

  uploading.value = true
  try {
    const result = await depot.uploadFile(selectedFile.value)
    uploadedUrl.value = result.url
    pushToast('Image uploaded')
  }
  catch (error) {
    pushToast('Upload failed', { description: errorMessage(error) })
  }
  finally {
    uploading.value = false
  }
}

onBeforeUnmount(clearPreview)
</script>

<template>
  <div class="page container-s">
    <Flex column gap="l" expand>
      <h1>Depot playground</h1>

      <p>It works. I'm realizing there needs to be a nice admin and self-service layer to this as well (seeing what users upload, managing your own uploads). But it works.</p>

      <Alert v-if="!isAuthed" variant="warning">
        Sign in to upload.
      </Alert>

      <Card v-else class="card-bg" separators>
        <template #header>
          <h4>Upload an image</h4>
        </template>

        <Flex column gap="m" expand>
          <input
            ref="fileInput"
            type="file"
            accept="image/*"
            hidden
            @change="onFileChange"
          >
          <Flex gap="s" y-center wrap>
            <Button @click="fileInput?.click()">
              Choose image
            </Button>
            <span v-if="selectedFile" class="text-color-light">{{ selectedFile.name }}</span>
          </Flex>

          <img v-if="localPreview" :src="localPreview" class="preview" alt="Selected image preview">

          <Button
            variant="accent"
            :disabled="!selectedFile || uploading"
            :loading="uploading"
            @click="upload"
          >
            Upload
          </Button>

          <template v-if="uploadedUrl">
            <Divider />
            <Flex column gap="s" expand>
              <span class="block text-color-lighter text-xs">Uploaded URL</span>
              <Flex gap="s" y-center wrap>
                <a :href="uploadedUrl" target="_blank" rel="noopener noreferrer" class="text-color-accent">
                  {{ uploadedUrl }}
                </a>
                <CopyClipboard :text="uploadedUrl" confirm="Copied!">
                  <Button size="s" variant="gray">
                    Copy
                  </Button>
                </CopyClipboard>
              </Flex>
              <img :src="uploadedUrl" class="preview" alt="Uploaded image">
            </Flex>
          </template>
        </Flex>
      </Card>
    </Flex>
  </div>
</template>

<style scoped lang="scss">
.preview {
  max-width: 100%;
  max-height: 320px;
  width: auto;
  border-radius: var(--border-radius-m);
  border: 1px solid var(--color-border);
}
</style>
