<script setup lang="ts">
import Mention from '@tiptap/extension-mention'
import { Placeholder } from '@tiptap/extensions'
import { Markdown } from '@tiptap/markdown'
import StarterKit from '@tiptap/starter-kit'
import { EditorContent, useEditor } from '@tiptap/vue-3'
import { defineSuggestion } from './plugins/suggestion'
import RichTextMentions from './RichTextMentions.vue'
import RichTextSelectionMenu from './RichTextSelectionMenu.vue'

const {
  errors = [],
  minHeight = '47px',
  ...props
} = defineProps<Props>()

// https://tiptap.dev/docs/editor/markdown

// TODO: Code block highlighting & dropdown for seleting language

// TODO: add option to add link to bunch of text

// TODO: hivecom emote sticker / custom emojis & normal emojis too

// TODO: dropdown for headings

// TODO: image upload

// TODO: image spoiler (or general spoiler tag?)

interface Props {
  autofocus?: boolean
  disabled?: boolean
  label?: string
  hint?: string
  errors?: string[]
  placeholder?: string
  minHeight?: string
}

const content = defineModel<string>()

const supabase = useSupabaseClient()

const editor = useEditor({
  content: content.value,
  extensions: [
    StarterKit,
    Markdown,
    Placeholder.configure({ placeholder: props.placeholder }),
    Mention.configure({
      suggestion: defineSuggestion('@', RichTextMentions, async (search_term) => {
        return supabase
          .rpc('search_profiles', { search_term })
          .select('username, id')
          .limit(32)
      }),
      deleteTriggerWithBackspace: true,
      HTMLAttributes: {
        class: 'mention',
      },
      renderHTML(props) {
        return `@${props.node.attrs.id}`
      },
    }),
  ],
  contentType: 'markdown',
  onUpdate: () => {
    content.value = editor.value?.getMarkdown() || ''
  },
})

// Update editor content manually on model change
watch(content, (newContent) => {
  if (editor.value?.getMarkdown() === newContent) {
    return
  }

  editor.value?.commands.setContent(newContent ?? '', {
    contentType: 'markdown',
  })

  // If content is updated externally, focus at the end of it
  editor.value?.commands.focus('end')
})

watch(() => props, () => {
  editor.value?.setOptions({
    autofocus: props.autofocus,
    editable: !props.disabled,
    extensions: [
      Placeholder.configure({ placeholder: props.placeholder }),
    ],
  })
}, { deep: true })

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

    <!-- Emote picker menu -->

    <!-- Main editor instance -->
    <EditorContent :id="elementId" :editor="editor" class="typeset" />

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
}
</style>
