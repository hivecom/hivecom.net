<script setup lang="ts">
import type { Editor } from '@tiptap/vue-3'
import type { ShouldShowMenuProps } from '@/types/rich-text-editor'
import { NodeSelection } from '@tiptap/pm/state'
import { BubbleMenu } from '@tiptap/vue-3/menus'

const props = defineProps<{
  editor: Editor
}>()

function shouldShow({ state }: ShouldShowMenuProps): boolean {
  const { selection } = state

  if (selection instanceof NodeSelection) {
    return selection.node.type.name === 'image'
  }

  return false
}
</script>

<template>
  <BubbleMenu :editor="editor" :should-show="shouldShow">
    TODO
  </BubbleMenu>
</template>
