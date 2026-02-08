<script setup lang="ts">
import { Markdown } from '@tiptap/markdown'
import StarterKit from '@tiptap/starter-kit'
import { EditorContent, useEditor } from '@tiptap/vue-3'

interface Props {
  autofocus?: boolean
  disabled?: boolean
}

const props = defineProps<Props>()
const content = defineModel<string>()

const editor = useEditor({
  content: content.value,
  extensions: [StarterKit, Markdown],
  contentType: 'markdown',
  onUpdate: () => {
    content.value = editor.value?.getMarkdown()
  },
})

// Update editor content manually on model change
watch(content, (newContent) => {
  if (editor.value?.getMarkdown() === newContent || !newContent) {
    return
  }

  editor.value?.commands.setContent(newContent)
})

watch(props, () => {
  editor.value?.setOptions({
    autofocus: props.autofocus,
    editable: !props.disabled,
  })
}, { deep: true })
</script>

<template>
  <div class="vui-rich-text typeset">
    <EditorContent :editor="editor" />
  </div>
</template>

<style scoped lang="scss">
.vui-rich-text {
  :deep(.ProseMirror) {
    background-color: var(--color-bg-card);
    border: 1px solid var(--color-border);
    border-radius: var(--border-radius-m);
    padding: var(--space-s);
  }
}
</style>
