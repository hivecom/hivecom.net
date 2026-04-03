<script setup lang="ts">
import type { Editor } from '@tiptap/vue-3'
import type { StorageBucketId } from '@/lib/storageAssets'
import type { Database } from '@/types/database.types'
import type { ShouldShowMenuProps } from '@/types/rich-text-editor'
import { useSupabaseClient } from '#imports'
import { Button, Flex, pushToast, Textarea } from '@dolanske/vui'
import { NodeSelection } from '@tiptap/pm/state'
import { BubbleMenu } from '@tiptap/vue-3/menus'
import { computed, ref } from 'vue'
import { slugify } from '@/lib/utils/formatting'

type MediaNodeType = 'image' | 'video'

const props = defineProps<{
  editor: Editor
  bucketId?: StorageBucketId
  mediaContext: string
}>()

const supabase = useSupabaseClient<Database>()

const slug = ref('')

// ---------------------------------------------------------------------------
// Which node type is currently selected (image or video)
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
  // Don't show for blob URLs - upload still in progress
  const src = node?.attrs?.src ?? ''
  if (src.startsWith('blob:'))
    return false
  return name === 'image' || name === 'video'
}

const activeNodeType = computed<MediaNodeType | null>(() => {
  // Reactively derive from editor state - BubbleMenu re-renders when the
  // selection changes, so this computed will be fresh whenever the menu opens.
  return getSelectedNodeType()
})

const isVideo = computed(() => activeNodeType.value === 'video')

const slugLabel = computed(() =>
  isVideo.value ? 'Label' : 'Alt text',
)

const slugPlaceholder = computed(() =>
  isVideo.value
    ? 'A short label for the video file'
    : 'Describe the image in a few simple words',
)

// ---------------------------------------------------------------------------
// Virtual anchor - positions the bubble menu just below the selected node
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
      const y = rect.top + 16
      return new DOMRect(rect.left, y, rect.width, 0)
    },
    getClientRects: () => [] as unknown as DOMRectList,
  }
}

// ---------------------------------------------------------------------------
// Helpers to read the currently selected node's src / storage path
// ---------------------------------------------------------------------------

function getSelectedSrc(): string | null {
  const { selection } = props.editor.state
  if (!(selection instanceof NodeSelection))
    return null
  const node = selection.node
  const name = node?.type?.name
  if (name !== 'image' && name !== 'video')
    return null
  return (node.attrs as { src?: string }).src ?? null
}

/**
 * The upload path is `${mediaContext}/${filename}`, so we can reconstruct the
 * storage path from just the last URL segment (the filename).
 */
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
  // Storage cleanup is handled automatically by the editor's onTransaction
  // listener in RichTextEditor, which detects removed image/video nodes.
  props.editor.chain().deleteSelection().focus().run()
}

async function updateMedia() {
  const trimmedSlug = slug.value.trim()
  const slugified = slugify(trimmedSlug)

  if (!slugified)
    return

  const nodeType = activeNodeType.value
  if (!nodeType)
    return

  const src = getSelectedSrc()
  if (!src)
    return

  const storagePath = getStoragePath(src)

  if (!props.bucketId || !storagePath) {
    // No bucket configured - just update the alt attribute for images (best-effort)
    if (nodeType === 'image') {
      props.editor.chain().updateAttributes('image', { alt: trimmedSlug }).focus().run()
    }
    return
  }

  const { error: fetchError, data: fetchData } = await supabase.storage
    .from(props.bucketId)
    .download(storagePath)

  if (fetchError) {
    pushToast('Error updating media', { description: fetchError.message })
    return
  }

  const format = fetchData.type.split('/')[1]

  // Double dash to easily distinguish slugs                   vv
  const newPath = `${props.mediaContext}/${crypto.randomUUID()}--${slugified}.${format}`

  const { error: removeError } = await supabase.storage.from(props.bucketId).remove([storagePath])

  if (removeError) {
    pushToast('Error updating media', { description: removeError.message })
    return
  }

  const { error: uploadError } = await supabase.storage
    .from(props.bucketId)
    .upload(newPath, fetchData, { contentType: fetchData.type })

  if (uploadError) {
    pushToast('Error updating media', { description: uploadError.message })
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
}
</script>

<template>
  <BubbleMenu
    :editor="editor"
    :options="{
      strategy: 'fixed',
      placement: 'bottom',
      offset: 0,
      flip: false,
    }"
    :get-referenced-virtual-element="getReferencedVirtualElement"
    :should-show="shouldShow"
  >
    <div class="rich-text-media-menu rich-text-floating-menu">
      <Textarea
        v-model="slug"
        :rows="isVideo ? 2 : 4"
        expand
        :placeholder="slugPlaceholder"
        :label="slugLabel"
        :limit="64"
      />
      <Flex gap="xxs" x-end>
        <Button size="s" variant="danger" @click="removeMedia">
          Delete media
        </Button>
        <Button size="s" :disabled="!slug.trim()" @click="updateMedia">
          Save
        </Button>
      </Flex>
    </div>
  </BubbleMenu>
</template>

<style scoped lang="scss">
.rich-text-media-menu {
  padding: var(--space-s);
  width: 292px;
}
</style>
