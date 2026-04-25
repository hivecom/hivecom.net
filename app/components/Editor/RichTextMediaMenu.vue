<script setup lang="ts">
import type { Editor } from '@tiptap/vue-3'
import type { StorageBucketId } from '@/lib/storageAssets'
import type { Database } from '@/types/database.types'
import type { ShouldShowMenuProps } from '@/types/rich-text-editor'
import { useSupabaseClient } from '#imports'
import { Button, Flex, Modal, pushToast, Textarea } from '@dolanske/vui'
import { NodeSelection } from '@tiptap/pm/state'
import { BubbleMenu } from '@tiptap/vue-3/menus'
import { computed, ref, watch } from 'vue'
import { slugify } from '@/lib/utils/formatting'

type MediaNodeType = 'image' | 'video'

const props = defineProps<{
  editor: Editor
  bucketId?: StorageBucketId
  mediaContext: string
}>()

const supabase = useSupabaseClient<Database>()

// ---------------------------------------------------------------------------
// Modal state
// ---------------------------------------------------------------------------

const modalOpen = ref(false)
const slug = ref('')
const saving = ref(false)

// Snapshot of node info captured when the modal is opened, so changes to the
// selection mid-edit don't corrupt the operation.
const capturedNodeType = ref<MediaNodeType | null>(null)
const capturedSrc = ref<string | null>(null)

// ---------------------------------------------------------------------------
// Node selection helpers
// ---------------------------------------------------------------------------

function getSelectedNodeType(): MediaNodeType | null {
  const { selection } = props.editor.state
  if (!(selection instanceof NodeSelection))
    return null
  const name = selection.node?.type?.name
  if (name === 'image' || name === 'video')
    return name
  return null
}

function shouldShow({ state }: ShouldShowMenuProps): boolean {
  const { selection } = state
  const node = (selection as { node?: { type?: { name?: string }, attrs?: { src?: string } } }).node
  const name = node?.type?.name
  const src = node?.attrs?.src ?? ''
  // Don't show trigger button while upload is in progress
  if (src.startsWith('blob:'))
    return false
  return name === 'image' || name === 'video'
}

const activeNodeType = computed<MediaNodeType | null>(() => getSelectedNodeType())
const isVideo = computed(() => activeNodeType.value === 'video')

// ---------------------------------------------------------------------------
// Virtual anchor - positions the bubble trigger just below the selected node
// ---------------------------------------------------------------------------

function getReferencedVirtualElement() {
  const { state, view } = props.editor
  const { selection } = state

  if (!(selection instanceof NodeSelection))
    return null

  const node = view.nodeDOM(selection.from) as HTMLElement | null

  if (!node)
    return null

  return {
    getBoundingClientRect: () => {
      const rect = node.getBoundingClientRect()
      const cx = rect.left + rect.width / 2
      const cy = rect.top + rect.height / 2
      return new DOMRect(cx, cy, 0, 0)
    },
    getClientRects: () => [] as unknown as DOMRectList,
  }
}

// ---------------------------------------------------------------------------
// Modal open / close
// ---------------------------------------------------------------------------

function openModal() {
  const nodeType = getSelectedNodeType()
  if (!nodeType)
    return

  const { selection } = props.editor.state
  if (!(selection instanceof NodeSelection))
    return

  const src = (selection.node.attrs as { src?: string }).src ?? null

  // Read current alt/label into the field
  const current = (selection.node.attrs as { alt?: string }).alt ?? ''

  capturedNodeType.value = nodeType
  capturedSrc.value = src
  slug.value = current
  modalOpen.value = true
}

watch(modalOpen, (open) => {
  if (!open) {
    slug.value = ''
    capturedNodeType.value = null
    capturedSrc.value = null
    saving.value = false
  }
})

const slugLabel = computed(() =>
  capturedNodeType.value === 'video' ? 'Label' : 'Alt text',
)

const slugPlaceholder = computed(() =>
  capturedNodeType.value === 'video'
    ? 'A short label for the video file'
    : 'Describe the image in a few simple words',
)

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getStoragePath(src: string): string | null {
  const filename = decodeURIComponent(src.slice(src.lastIndexOf('/') + 1))
  if (!filename)
    return null
  return `${props.mediaContext}/${filename}`
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

function removeMedia() {
  // Storage cleanup handled by onTransaction in RichTextEditor
  props.editor.chain().deleteSelection().focus().run()
  modalOpen.value = false
}

async function updateMedia() {
  const trimmedSlug = slug.value.trim()
  const slugified = slugify(trimmedSlug)

  if (!slugified)
    return

  const nodeType = capturedNodeType.value
  if (!nodeType)
    return

  const src = capturedSrc.value
  if (!src)
    return

  saving.value = true

  const storagePath = getStoragePath(src)

  if (!props.bucketId || !storagePath) {
    // No bucket - just update alt attribute best-effort
    if (nodeType === 'image') {
      props.editor.chain().updateAttributes('image', { alt: trimmedSlug }).focus().run()
    }
    modalOpen.value = false
    saving.value = false
    return
  }

  const { error: fetchError, data: fetchData } = await supabase.storage
    .from(props.bucketId)
    .download(storagePath)

  if (fetchError) {
    pushToast('Error updating media', { description: fetchError.message })
    saving.value = false
    return
  }

  const format = fetchData.type.split('/')[1]

  // Double dash to easily distinguish slugs                   vv
  const newPath = `${props.mediaContext}/${crypto.randomUUID()}--${slugified}.${format}`

  const { error: removeError } = await supabase.storage.from(props.bucketId).remove([storagePath])

  if (removeError) {
    pushToast('Error updating media', { description: removeError.message })
    saving.value = false
    return
  }

  const { error: uploadError } = await supabase.storage
    .from(props.bucketId)
    .upload(newPath, fetchData, { contentType: fetchData.type })

  if (uploadError) {
    pushToast('Error updating media', { description: uploadError.message })
    saving.value = false
    return
  }

  const { data } = supabase.storage.from(props.bucketId).getPublicUrl(newPath)

  if (nodeType === 'image') {
    props.editor.chain()
      .updateAttributes('image', { src: data.publicUrl, alt: trimmedSlug })
      .focus()
      .run()
  }
  else {
    props.editor.chain()
      .updateAttributes('video', { src: data.publicUrl })
      .focus()
      .run()
  }

  modalOpen.value = false
  saving.value = false
}
</script>

<template>
  <!-- Bubble trigger: small unobtrusive button shown when image/video selected -->
  <BubbleMenu
    :editor="editor"
    :options="{
      strategy: 'absolute',
      placement: 'bottom',
      offset: 0,
      flip: false,
    }"
    :get-referenced-virtual-element="getReferencedVirtualElement"
    :should-show="shouldShow"
  >
    <Flex gap="xs">
      <Button size="s" variant="danger" square @click="removeMedia">
        <Icon name="ph:trash" />
      </Button>
      <Button size="s" variant="gray" @click="openModal">
        <template #start>
          <Icon name="ph:pencil-simple" />
        </template>
        {{ isVideo ? 'Edit label' : 'Edit alt text' }}
      </Button>
    </Flex>
  </BubbleMenu>

  <!-- Modal: opened via the trigger button above -->
  <Modal
    :open="modalOpen"
    centered
    :card="{ separators: true }"
    size="s"
    @close="modalOpen = false"
  >
    <template #header>
      <h4>{{ capturedNodeType === 'video' ? 'Edit video label' : 'Edit image alt text' }}</h4>
    </template>

    <Flex column gap="m">
      <Textarea
        v-model="slug"
        :rows="capturedNodeType === 'video' ? 2 : 4"
        expand
        :placeholder="slugPlaceholder"
        :label="slugLabel"
        :limit="64"
        autofocus
      />
      <p class="media-modal-hint">
        {{ capturedNodeType === 'video'
          ? 'A short label helps identify the video in accessibility tools and search.'
          : 'Alt text describes the image for screen readers and when the image fails to load.' }}
      </p>
    </Flex>

    <template #footer="{ close }">
      <Flex gap="s" x-between expand>
        <Button variant="danger" size="s" @click="removeMedia">
          Delete media
        </Button>
        <Flex gap="s">
          <Button size="s" @click="close">
            Cancel
          </Button>
          <Button
            size="s"
            variant="accent"
            :disabled="!slug.trim() || saving"
            @click="updateMedia"
          >
            Save
          </Button>
        </Flex>
      </Flex>
    </template>
  </Modal>
</template>

<style scoped lang="scss">
.rich-text-media-trigger {
  display: flex;
  align-items: center;
  gap: var(--space-xxs);
  padding: var(--space-xxs) var(--space-s);
  background: rgba(0, 0, 0, 0.55);
  backdrop-filter: blur(4px);
  border-radius: var(--border-radius-m);
  transform: translateY(-50%);
}

.media-modal-hint {
  font-size: var(--font-size-xs);
  color: var(--color-text-light);
}
</style>
