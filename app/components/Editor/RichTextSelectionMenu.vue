<script setup lang="ts">
import type { Editor } from '@tiptap/vue-3'
import type { ShouldShowMenuProps } from '@/types/rich-text-editor'
import { Button, ButtonGroup, Flex } from '@dolanske/vui'
import { BubbleMenu } from '@tiptap/vue-3/menus'

const props = defineProps<{
  editor: Editor
}>()

// Makes sure that when editor is clicked, we do not show bubble menu for empty text selection
function shouldShow({ state, from, to }: ShouldShowMenuProps): boolean {
  const { selection } = state
  const { empty } = selection

  if (empty) {
    return false
  }

  return state.doc.textBetween(from, to).length > 0
}
</script>

<template>
  <BubbleMenu
    :editor="editor"
    :options="{
      placement: 'top',
      offset: 8,
    }"
    :should-show="shouldShow"
  >
    <div class="vui-rich-text-menu">
      <Flex :gap="4">
        <ButtonGroup>
          <Button size="s" square @click="props.editor.chain().focus().toggleBold().run()">
            <Icon :size="18" name="ph:text-b" />
          </Button>
          <Button size="s" square @click="props.editor.chain().focus().toggleItalic().run()">
            <Icon :size="18" name="ph:text-italic" />
          </Button>
          <Button size="s" square @click="props.editor.chain().focus().toggleUnderline().run()">
            <Icon :size="18" name="ph:text-underline" />
          </Button>
          <Button size="s" square @click="props.editor.chain().focus().toggleStrike().run()">
            <Icon :size="18" name="ph:text-strikethrough" />
          </Button>
          <Button size="s" square @click="props.editor.chain().focus().toggleCode().run()">
            <Icon :size="18" name="ph:code" />
          </Button>
        </ButtonGroup>

        <ButtonGroup>
          <Button size="s" square @click="props.editor.chain().focus().toggleBulletList().run()">
            <Icon :size="18" name="ph:list-bullets" />
          </Button>
          <Button size="s" square @click="props.editor.chain().focus().toggleOrderedList().run()">
            <Icon :size="18" name="ph:list-numbers" />
          </Button>
        </ButtonGroup>

        <ButtonGroup>
          <Button size="s" square @click="props.editor.chain().focus().toggleCodeBlock().run()">
            <Icon :size="18" name="ph:code-block" />
          </Button>
          <Button size="s" square @click="props.editor.chain().focus().toggleBlockquote().run()">
            <Icon :size="18" name="ph:quotes" />
          </Button>
        </ButtonGroup>
      </Flex>
    </div>
  </BubbleMenu>
</template>

<style scoped lang="scss">
.vui-rich-text-menu {
  box-shadow: var(--box-shadow);
  background-color: var(--color-bg-medium);
  padding: 2px;
}
</style>
