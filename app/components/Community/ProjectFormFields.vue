<script setup lang="ts">
import type { ProjectFormState, ProjectFormValidation } from '@/lib/projects'
import { Flex, Input, Textarea } from '@dolanske/vui'
import { defineAsyncComponent, ref, watch } from 'vue'
import FileUpload from '@/components/Shared/FileUpload.vue'
import ProfileSelect from '@/components/Shared/ProfileSelect.vue'
import TagInput from '@/components/Shared/TagInput.vue'
import { useFieldUpdate } from '@/composables/useFieldUpdate'
import { deleteProjectBanner, getProjectBannerUrl, uploadProjectBanner } from '@/lib/storage'
import { STATIC_BUCKET_ID } from '@/lib/storageAssets'

const props = defineProps<{
  modelValue: ProjectFormState
  validation: ProjectFormValidation
  // Banner and media uploads key off the saved row, so they wait for an id
  projectId?: number | null
}>()

const emit = defineEmits<{
  'update:modelValue': [value: ProjectFormState]
}>()

const RichTextEditor = defineAsyncComponent(() => import('@/components/Editor/RichTextEditor.vue'))

const supabase = useSupabaseClient()
const userId = useUserId()

const update = useFieldUpdate(() => props.modelValue, value => emit('update:modelValue', value))

// Banner
// Uploads write straight to storage and broadcast on the banner bus, so any
// page showing this project's banner picks up the change without a save.

const bannerUrl = ref<string | null>(null)
const bannerUploading = ref(false)
const bannerDeleting = ref(false)
const bannerError = ref<string | null>(null)

watch(() => props.projectId, async (id) => {
  bannerError.value = null

  if (id == null) {
    bannerUrl.value = null
    return
  }

  try {
    bannerUrl.value = await getProjectBannerUrl(supabase, id)
  }
  catch (error) {
    console.error('Error loading project banner:', error)
    bannerUrl.value = null
  }
}, { immediate: true })

async function handleBannerUpload(file: File) {
  if (props.projectId == null) {
    bannerError.value = 'Save the project before uploading a banner.'
    return
  }

  try {
    bannerUploading.value = true
    bannerError.value = null

    await uploadProjectBanner(supabase, props.projectId, file, userId.value ?? undefined)
    bannerUrl.value = await getProjectBannerUrl(supabase, props.projectId)
  }
  catch (error) {
    console.error('Error uploading project banner:', error)
    bannerError.value = 'Failed to upload banner. Please try again.'
  }
  finally {
    bannerUploading.value = false
  }
}

async function handleBannerDelete() {
  if (props.projectId == null)
    return

  try {
    bannerDeleting.value = true
    bannerError.value = null

    await deleteProjectBanner(supabase, props.projectId)
    bannerUrl.value = null
  }
  catch (error) {
    console.error('Error deleting project banner:', error)
    bannerError.value = 'Failed to delete banner. Please try again.'
  }
  finally {
    bannerDeleting.value = false
  }
}

// Editor passthrough
// The editor uploads pasted and dropped media lazily as blob placeholders.
// Callers flush before persisting, otherwise blob: URLs get saved.

const markdownEditor = ref<InstanceType<typeof RichTextEditor> | null>(null)

async function flushPendingUploads(): Promise<boolean> {
  return (await markdownEditor.value?.flushPendingUploads()) ?? true
}

defineExpose({ flushPendingUploads })
</script>

<template>
  <Flex column gap="l" expand>
    <Flex column gap="m" expand>
      <Input
        :model-value="modelValue.title"
        expand
        name="title"
        label="Title"
        required
        :valid="validation.title"
        error="Project title is required"
        placeholder="Enter project title"
        @update:model-value="update('title', String($event))"
      />

      <Textarea
        :model-value="modelValue.description"
        expand
        name="description"
        label="Description"
        placeholder="Enter project description (optional)"
        :rows="3"
        @update:model-value="update('description', $event)"
      />

      <Flex expand column gap="s">
        <label class="input-label">Banner Image</label>
        <FileUpload
          expand
          label="Upload banner"
          :preview-url="bannerUrl"
          :loading="bannerUploading"
          :deleting="bannerDeleting"
          :error="bannerError"
          :disabled="projectId == null"
          :show-delete="!!bannerUrl && projectId != null"
          :aspect-ratio="16 / 5"
          @upload="handleBannerUpload"
          @delete="handleBannerDelete"
          @invalid="bannerError = $event"
        />
        <p v-if="projectId == null" class="banner-upload__notice">
          Save the project before uploading a banner.
        </p>
      </Flex>

      <Input
        :model-value="modelValue.link"
        expand
        name="link"
        label="Link"
        placeholder="Enter external link (optional)"
        @update:model-value="update('link', String($event))"
      />

      <div>
        <label class="input-label">Owner</label>
        <ProfileSelect
          :model-value="modelValue.owner"
          placeholder="Select owner"
          expand
          @update:model-value="update('owner', $event)"
        />
      </div>

      <TagInput
        :model-value="modelValue.tags"
        label="Tags"
        placeholder="Enter a tag"
        @update:model-value="update('tags', $event)"
      />

      <Input
        :model-value="modelValue.github"
        expand
        name="github"
        label="GitHub Repository"
        placeholder="username/repository (optional)"
        :valid="validation.github"
        error="Invalid format. Use 'username/repository' format"
        @update:model-value="update('github', String($event))"
      />
    </Flex>

    <RichTextEditor
      ref="markdownEditor"
      :model-value="modelValue.markdown"
      label="Content"
      hint="You can use markdown and add media by drag-and-drop"
      placeholder="Enter markdown content"
      min-height="216px"
      :errors="validation.markdown ? [] : ['Markdown content is required']"
      :media-context="projectId != null ? `projects/${projectId}/markdown/media` : undefined"
      :media-bucket-id="STATIC_BUCKET_ID"
      :show-attachment-button="projectId != null"
      show-expand-button
      always-show-expand-button
      @update:model-value="update('markdown', $event ?? '')"
    />
  </Flex>
</template>

<style scoped lang="scss">
.input-label {
  font-size: var(--font-size-m);
  font-weight: var(--font-weight-medium);
  color: var(--color-text);
  margin-bottom: var(--space-xs);
}

.banner-upload__notice {
  font-size: var(--font-size-xs);
  color: var(--color-text-subtle);
  margin-top: var(--space-xs);
}
</style>
