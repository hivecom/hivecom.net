<script setup lang="ts">
import { Placeholder } from '@tiptap/extensions'
import { Markdown } from '@tiptap/markdown'
import StarterKit from '@tiptap/starter-kit'
import { EditorContent, useEditor } from '@tiptap/vue-3'

// https://tiptap.dev/docs/editor/markdown

// TODO: actual UI for styling

interface Props {
  autofocus?: boolean
  disabled?: boolean
  label?: string
  hint?: string
  errors?: string[]
  placeholder?: string
  minHeight?: string
}

const {
  errors = [],
  minHeight = '47px',
  ...props
} = defineProps<Props>()

const content = defineModel<string>()

const editor = useEditor({
  content: content.value,
  extensions: [
    StarterKit,
    Markdown,
    Placeholder.configure({
      placeholder: props.placeholder,
    }),
  ],
  contentType: 'markdown',
  onUpdate: () => {
    const markdown = editor.value?.getMarkdown() || ''
    const sanitized = markdown.replace(/&nbsp;|\s+/g, '').length === 0 ? '' : markdown
    content.value = sanitized
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

    <EditorContent :id="elementId" :editor="editor" class="typeset" />

    <ul v-if="errors.length > 0" class="vui-input-errors">
      <li v-for="err in errors" :key="err">
        {{ err }}
      </li>
    </ul>
  </div>
</template>

<style scoped lang="scss">
.vui-rich-text {
  display: block;
  width: 100%;

  :deep(.ProseMirror) {
    background-color: var(--color-bg-card);
    border: 1px solid var(--color-border);
    border-radius: var(--border-radius-m);
    padding: var(--space-s);
    min-height: v-bind(minHeight);
  }

  // Placeholder styling
  :deep(.tiptap) p.is-editor-empty:first-child::before {
    content: attr(data-placeholder);
    float: left;
    height: 0;
    pointer-events: none;
    font-weight: var(--font-weight);
    color: var(--color-text-lighter);
    font-family: var(--font);
  }

  // TODO: move to vui's .text.scss file
  .vui-input-errors {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding-top: 6px;
    list-style: none;

    li {
      display: block;
      font-size: var(--font-size-s);
      color: var(--color-text-red);
    }
  }
}
</style>
