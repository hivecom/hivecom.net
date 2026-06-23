<script setup lang="ts">
import { Drawer, EmojiPicker, Popout } from '@dolanske/vui'
import { useBreakpoint } from '@/lib/mediaQuery'

defineProps<{
  /** Whether the picker is shown. Controlled by the host. */
  open: boolean
  /** Element the desktop Popout anchors to. Ignored on mobile (uses a Drawer). */
  anchor?: HTMLElement | null
}>()

const emit = defineEmits<{
  (e: 'select', emoji: string): void
  (e: 'close'): void
}>()

const isMobile = useBreakpoint('<s')

// VUI's EmojiPicker emits the full emojibase entry; hosts only ever want the char.
function onSelect({ emoji }: { emoji: string }) {
  emit('select', emoji)
}
</script>

<template>
  <Drawer v-if="isMobile" :open="open" @close="emit('close')">
    <EmojiPicker @select="onSelect" />
  </Drawer>
  <Popout
    v-else
    :anchor="anchor"
    :visible="open"
    @click-outside="emit('close')"
  >
    <EmojiPicker @select="onSelect" />
  </Popout>
</template>
