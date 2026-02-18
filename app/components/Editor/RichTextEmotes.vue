<script setup lang="ts">
import type { Editor } from '@tiptap/vue-3'

export interface RichTextEmote {
  name: string
  data: string
}

interface Props {
  editor: Editor
  data: RichTextEmote[]
}

const props = defineProps<Props>()

defineExpose({
  onKeyDown: ({ event }: { event: KeyboardEvent }) => {
    // Handle key presses
    void event
  },
})
</script>

<template>
  <div class="rich-text-mention-menu">
    {{ props.data }}
  </div>
</template>

<style scoped lang="scss">
</style>
