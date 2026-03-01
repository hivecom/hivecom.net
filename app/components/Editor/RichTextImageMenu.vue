<script setup lang="ts">
import type { Editor } from '@tiptap/vue-3'
import type { StorageBucketId } from '@/lib/storageAssets'
import type { Database } from '@/types/database.types'
import type { ShouldShowMenuProps } from '@/types/rich-text-editor'
import { useSupabaseClient } from '#imports'
import { Button, Flex, pushToast, Textarea } from '@dolanske/vui'
import { NodeSelection } from '@tiptap/pm/state'
import { BubbleMenu } from '@tiptap/vue-3/menus'
import { slugify } from '@/lib/utils/formatting'

const props = defineProps<{
  editor: Editor
  bucketId?: StorageBucketId
  mediaContext: string
}>()

const supabase = useSupabaseClient<Database>()

const alt = ref('')

function shouldShow({ state }: ShouldShowMenuProps): boolean {
  const { selection } = state
  const node = (selection as { node?: { type?: { name?: string } } }).node
  return node?.type?.name === 'image'
}

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

function getSelectedImageSrc(): string | null {
  const { selection } = props.editor.state
  if (!(selection instanceof NodeSelection))
    return null

  const node = selection.node
  if (node?.type?.name !== 'image')
    return null

  return (node.attrs as { src?: string }).src ?? null
}

/**
 * The upload path is `${mediaContext}/${filename}`, so we can reconstruct
 * the storage path from just the filename, which is the last URL segment.
 */
function getStoragePath(src: string): string | null {
  const filename = decodeURIComponent(src.slice(src.lastIndexOf('/') + 1))
  if (!filename)
    return null

  return `${props.mediaContext}/${filename}`
}

async function removeMedia() {
  const src = getSelectedImageSrc()

  if (src && props.bucketId) {
    const storagePath = getStoragePath(src)

    if (storagePath) {
      const { error } = await supabase.storage
        .from(props.bucketId)
        .remove([storagePath])

      if (error) {
        pushToast('Error deleting media', { description: error.message })
        return
      }
    }
  }

  props.editor.chain().deleteSelection().focus().run()
}

async function updateMedia() {
  const trimmedAlt = alt.value.trim()
  const slug = slugify(trimmedAlt)

  if (!slug)
    return

  const src = getSelectedImageSrc()

  if (!src)
    return

  const storagePath = getStoragePath(src)

  if (!props.bucketId || !storagePath) {
    props.editor.chain().updateAttributes('image', { alt: trimmedAlt }).focus().run()
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
  const newPath = `${props.mediaContext}/${crypto.randomUUID()}--${slug}.${format}`

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

  props.editor.chain()
    .updateAttributes('image', { src: data.publicUrl, alt: trimmedAlt })
    .focus()
    .run()
}
</script>

<template>
  <BubbleMenu
    :editor="editor"
    :options="{
      placement: 'bottom',
      offset: 0,
      flip: false,
    }"
    :get-referenced-virtual-element="getReferencedVirtualElement"
    :should-show="shouldShow"
  >
    <div class="rich-text-image-menu rich-text-floating-menu">
      <Textarea v-model="alt" :rows="4" expand placeholder="Describe the image in a few simple words" label="Alt text" :limit="64" />
      <Flex gap="xxs" x-end>
        <Button size="s" variant="danger" @click="removeMedia">
          Delete media
        </Button>
        <Button size="s" :disabled="!alt.trim()" @click="updateMedia">
          Save
        </Button>
      </Flex>
    </div>
  </BubbleMenu>
</template>

<style scoped lang="scss">
.rich-text-image-menu {
  padding: var(--space-s);
  width: 292px;
}
</style>
