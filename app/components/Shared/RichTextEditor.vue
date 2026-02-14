<script setup lang="ts">
import { Button, ButtonGroup, Flex } from '@dolanske/vui'
import { Placeholder } from '@tiptap/extensions'
import { Markdown } from '@tiptap/markdown'
import StarterKit from '@tiptap/starter-kit'
import { EditorContent, useEditor } from '@tiptap/vue-3'
import { BubbleMenu } from '@tiptap/vue-3/menus'

// https://tiptap.dev/docs/editor/markdown

// TODO: Code block highlighting & dropdown for seleting language

// TODO: add option to add link to bunch of text

// TODO: @mentions

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

    <BubbleMenu
      v-if="editor" :editor="editor" :options="{ placement: 'top',
                                                 offset: 8 }"
    >
      <div class="vui-rich-text-menu">
        <Flex :gap="4">
          <ButtonGroup>
            <Button size="s" square @click="editor.chain().focus().toggleBold().run()">
              <Icon :size="18" name="ph:text-b" />
            </Button>
            <Button size="s" square @click="editor.chain().focus().toggleItalic().run()">
              <Icon :size="18" name="ph:text-italic" />
            </Button>
            <Button size="s" square @click="editor.chain().focus().toggleUnderline().run()">
              <Icon :size="18" name="ph:text-underline" />
            </Button>
            <Button size="s" square @click="editor.chain().focus().toggleStrike().run()">
              <Icon :size="18" name="ph:text-strikethrough" />
            </Button>
            <Button size="s" square @click="editor.chain().focus().toggleCode().run()">
              <Icon :size="18" name="ph:code" />
            </Button>
          </ButtonGroup>

          <ButtonGroup>
            <Button size="s" square @click="editor.chain().focus().toggleBulletList().run()">
              <Icon :size="18" name="ph:list-bullets" />
            </Button>
            <Button size="s" square @click="editor.chain().focus().toggleOrderedList().run()">
              <Icon :size="18" name="ph:list-numbers" />
            </Button>
          <!-- <Button size="s" square>
            <Icon :size="18" name="ph:list-checks" @click="editor.chain().focus().toggleTaskList().run()" />
          </Button> -->
          </ButtonGroup>

          <ButtonGroup>
            <Button size="s" square @click="editor.chain().focus().toggleCodeBlock().run()">
              <Icon :size="18" name="ph:code-block" />
            </Button>
            <Button size="s" square @click="editor.chain().focus().toggleBlockquote().run()">
              <Icon :size="18" name="ph:quotes" />
            </Button>
          </ButtonGroup>
        </Flex>
      </div>
    </BubbleMenu>

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

    & > :first-child {
      margin-top: 0 !important;
    }
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

  .vui-rich-text-menu {
    box-shadow: var(--box-shadow);
    background-color: var(--color-bg-medium);
    padding: 2px;
  }

  :deep(hr.ProseMirror-selectednode) {
    border-color: var(--color-border-strong);
    // outline: 2px solid var(--color-accent ) !important;
  }
}
</style>
