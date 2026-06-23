<script setup lang="ts">
import type { Editor } from '@tiptap/vue-3'
import { ContextMenu, Divider, DropdownItem } from '@dolanske/vui'
import { ref } from 'vue'
import EmojiPickerMenu from '@/components/Shared/EmojiPickerMenu.vue'
import { useExternalLinkGuard } from '@/composables/useExternalLinkGuard'
import { useTextContextMenu } from '@/composables/useTextContextMenu'

const props = defineProps<{
  editor: Editor
}>()

const { guardedOpen } = useExternalLinkGuard()
const { emojiOpen, emojiPos, closeMenu, writeClipboard, readClipboard, recordEmojiAnchor, openEmojiPicker } = useTextContextMenu()

const activeLinkHref = ref<string | null>(null)
const hasSelection = ref(false)
const emojiAnchor = useTemplateRef('emoji-anchor')

function onContextMenu(event: MouseEvent) {
  const target = event.target as HTMLElement | null
  const anchor = target?.closest('a')
  activeLinkHref.value = anchor?.getAttribute('href') ?? null

  const { from, to } = props.editor.state.selection
  hasSelection.value = from !== to

  recordEmojiAnchor(event)
}

function getSelectionText() {
  const { from, to } = props.editor.state.selection
  return props.editor.state.doc.textBetween(from, to, '\n')
}

function openLink() {
  if (activeLinkHref.value)
    guardedOpen(activeLinkHref.value)
  closeMenu()
}

async function copyLink() {
  if (activeLinkHref.value)
    await writeClipboard(activeLinkHref.value, 'Link')
  closeMenu()
}

function removeLink() {
  props.editor.chain().focus().extendMarkRange('link').unsetLink().run()
  closeMenu()
}

async function copySelection() {
  await writeClipboard(getSelectionText(), 'Selection')
  closeMenu()
}

async function cutSelection() {
  await writeClipboard(getSelectionText(), 'Selection')
  props.editor.chain().focus().deleteSelection().run()
  closeMenu()
}

async function paste() {
  const text = await readClipboard()
  if (text)
    props.editor.chain().focus().insertContent(text).run()
  closeMenu()
}

function selectAll() {
  props.editor.chain().focus().selectAll().run()
  closeMenu()
}

function insertEmoji(emoji: string) {
  props.editor.chain().focus().insertContent(emoji).run()
  emojiOpen.value = false
}
</script>

<template>
  <ContextMenu class="editor-context-menu">
    <div class="editor-context-menu__target" @contextmenu="onContextMenu">
      <slot />
    </div>

    <template #menu>
      <div class="vui-dropdown editor-context-menu__menu">
        <template v-if="activeLinkHref">
          <DropdownItem @click="openLink">
            <template #icon>
              <Icon name="ph:arrow-square-out" />
            </template>
            Open link
          </DropdownItem>
          <DropdownItem @click="copyLink">
            <template #icon>
              <Icon name="ph:link" />
            </template>
            Copy link
          </DropdownItem>
          <DropdownItem @click="removeLink">
            <template #icon>
              <Icon name="ph:link-break" />
            </template>
            Remove link
          </DropdownItem>
          <Divider :size="0" />
        </template>

        <DropdownItem v-if="hasSelection" @click="cutSelection">
          <template #icon>
            <Icon name="ph:scissors" />
          </template>
          Cut
        </DropdownItem>
        <DropdownItem v-if="hasSelection" @click="copySelection">
          <template #icon>
            <Icon name="ph:copy" />
          </template>
          Copy
        </DropdownItem>
        <DropdownItem @click="paste">
          <template #icon>
            <Icon name="ph:clipboard" />
          </template>
          Paste
        </DropdownItem>
        <DropdownItem @click="selectAll">
          <template #icon>
            <Icon name="ph:selection-all" />
          </template>
          Select all
        </DropdownItem>
        <Divider :size="0" />
        <DropdownItem @click="openEmojiPicker">
          <template #icon>
            <Icon name="ph:smiley" />
          </template>
          Insert emoji
        </DropdownItem>
      </div>
    </template>
  </ContextMenu>

  <!-- Zero-size anchor placed at the right-click point so the picker opens there. -->
  <div
    ref="emoji-anchor"
    class="editor-context-menu__emoji-anchor"
    :style="{
      left: `${emojiPos.x}px`,
      top: `${emojiPos.y}px`,
    }"
  />

  <EmojiPickerMenu
    :open="emojiOpen"
    :anchor="emojiAnchor"
    @select="insertEmoji"
    @close="emojiOpen = false"
  />
</template>

<style scoped lang="scss">
// Keep the wrapper transparent to layout so the editor renders exactly as it
// would without the context menu around it.
.editor-context-menu__target {
  display: contents;
}

// Invisible point the emoji Popout latches onto, positioned at the click spot.
.editor-context-menu__emoji-anchor {
  position: fixed;
  width: 0;
  height: 0;
  pointer-events: none;
}
</style>
