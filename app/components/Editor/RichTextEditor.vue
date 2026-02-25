<script setup lang="ts">
import type { Database } from '@/types/database.types'
import { useSupabaseClient } from '#imports'
import { pushToast } from '@dolanske/vui'
import FileHandler from '@tiptap/extension-file-handler'
import Image from '@tiptap/extension-image'
import { CharacterCount, Placeholder } from '@tiptap/extensions'
import { Markdown } from '@tiptap/markdown'
import StarterKit from '@tiptap/starter-kit'
import { EditorContent, useEditor } from '@tiptap/vue-3'
import { useId, watch } from 'vue'
import { createMentionExtension, hydrateMentionLabels } from './plugins/mentions'
import RichTextSelectionMenu from './RichTextSelectionMenu.vue'

const {
  errors = [],
  minHeight = '47px',
  ...props
} = defineProps<Props>()

// https://tiptap.dev/docs/editor/markdown

// TODO: Code block highlighting & dropdown for seleting language

// TODO: hivecom emote sticker / custom emojis & normal emojis too

// TODO: dropdown for headings

interface Props {
  autofocus?: boolean
  disabled?: boolean
  label?: string
  hint?: string
  errors?: string[]
  placeholder?: string
  minHeight?: string
  limit?: number
  /**
   * If provided, it will enable media upload via pasting/dragging media files
   * into the editor. Providing a context helps with file management
   */
  mediaContext?: string
}

const content = defineModel<string>()

const supabase = useSupabaseClient<Database>()

const editor = useEditor({
  content: content.value,
  extensions: [
    StarterKit,
    Markdown,
    Placeholder.configure({
      placeholder: props.placeholder,

    }),
    Image,
    // User mentions
    createMentionExtension(supabase),
    // Media content setting for file uploads
    ...(props.mediaContext
      ? [FileHandler.configure({
          onPaste: (_, files) => handleFileUpload(files),
          onDrop: (_, files, pos) => handleFileUpload(files, pos),
          allowedMimeTypes: ['image/png', 'image/jpeg', 'image/gif', 'image/webp'],
        })]
      : []),
    // Character limit
    ...(props.limit
      ? [CharacterCount.configure({ limit: props.limit })]
      : []),
  ],
  contentType: 'markdown',
  onUpdate: () => {
    content.value = editor.value?.getMarkdown() || ''
  },
})

// Upload file into the bucket and set the editor node URL
function handleFileUpload(files: File[], pos?: number) {
  files.forEach(async (file) => {
    if (!editor.value)
      return

    const format = file.type.split('/')[1]
    const fileUrl = `${props.mediaContext}/${crypto.randomUUID()}.${format}`

    // Path to the public image upload
    const { error } = await supabase.storage
      .from('hivecom-content-forums')
      .upload(fileUrl, file, { contentType: file.type })

    if (error) {
      pushToast('Error uploading media', {
        description: error.message,
      })
    }
    else {
      const { data } = supabase.storage
        .from('hivecom-content-forums')
        .getPublicUrl(fileUrl)

      editor.value
        .chain()
        .insertContentAt(pos ?? editor.value.state.selection.anchor, {
          type: 'image',
          attrs: { src: data.publicUrl },
        })
        .focus()
        .run()
    }
  })
}

// If content is changed externally, make sure mentions are hydrated
watch(() => editor.value, (value) => {
  if (value) {
    hydrateMentionLabels(value, supabase, content.value ?? '')
  }
}, { immediate: true })

// Update editor content manually on model change
watch(content, (newContent) => {
  if (editor.value?.getMarkdown() === newContent) {
    return
  }

  editor.value?.commands.setContent(newContent ?? '', {
    contentType: 'markdown',
  })

  void hydrateMentionLabels(editor.value, supabase, newContent ?? '')

  // If content is updated externally, focus at the end of it
  editor.value?.commands.focus('end')
})

const elementId = useId()

// Expose some methods for refs
defineExpose({
  focus: () => editor.value?.commands.focus('end'),
})
</script>

<template>
  <div class="vui-rich-text">
    <label v-if="props.label" class="vui-label" :for="elementId">{{ props.label }}</label>
    <p v-if="props.hint" class="vui-hint">
      {{ props.hint }}
    </p>

    <!-- Text selection menu -->
    <RichTextSelectionMenu v-if="editor" :editor />

    <!-- Main editor instance -->
    <EditorContent :id="elementId" :editor="editor" class="typeset" @keydown.enter.stop />

    <p v-if="limit && editor" class="vui-hint" style="margin-top: var(--space-xxs)">
      {{ `${editor.storage.characterCount.characters()} / ${limit}` }}
    </p>

    <ul v-if="errors.length > 0" class="vui-input-errors">
      <li v-for="err in errors" :key="err">
        {{ err }}
      </li>
    </ul>
  </div>
</template>

<style lang="scss">
.vui-rich-text {
  display: block;
  width: 100%;

  .ProseMirror {
    background-color: var(--color-bg-card);
    border: 1px solid var(--color-border);
    border-radius: var(--border-radius-m);
    padding: var(--space-s);
    min-height: v-bind(minHeight);

    &.ProseMirror-focused {
      outline: none;
      border-color: var(--color-border-strong);
    }

    & > :first-child {
      margin-top: 0 !important;
    }
  }

  // Placeholder styling
  .tiptap p.is-editor-empty:first-child::before {
    content: attr(data-placeholder);
    float: left;
    height: 0;
    pointer-events: none;
    font-weight: var(--font-weight);
    color: var(--color-text-lighter);
    font-family: var(--font);
  }

  hr.ProseMirror-selectednode {
    border-color: var(--color-border-strong);
  }

  img.ProseMirror-selectednode {
    outline: 2px solid var(--color-text);
  }

  .mention {
    background-color: color-mix(in srgb, var(--color-bg-accent-lowered) 20%, transparent);
    border-radius: var(--border-radius-m);
    box-decoration-break: clone;
    color: var(--color-accent);
    padding: 0.4rem;
  }
}

.rich-text-mention-menu {
  padding: var(--space-xs);
  background-color: var(--color-bg-raised);
  box-shadow: var(--box-shadow-strong);
  border-radius: var(--border-radius-m);
  z-index: var(--z-popout);
}
</style>
