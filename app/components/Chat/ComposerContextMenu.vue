<script setup lang="ts">
import { ContextMenu, Divider, DropdownItem } from '@dolanske/vui'
import { nextTick, ref } from 'vue'
import EmojiPickerMenu from '@/components/Shared/EmojiPickerMenu.vue'
import { useTextContextMenu } from '@/composables/useTextContextMenu'

// The bits of ChatComposerInput we drive. Offsets are wire-string positions, the
// same space as the model value, so splicing the string and the caret line up.
interface ComposerInputApi {
  getCaret: () => { start: number, end: number }
  setCaret: (start: number, end?: number) => void
  focus: () => void
}

const props = defineProps<{
  input?: ComposerInputApi
}>()

const message = defineModel<string>({ required: true })

const { emojiOpen, emojiPos, closeMenu, writeClipboard, readClipboard, recordEmojiAnchor, openEmojiPicker } = useTextContextMenu()
const emojiAnchor = useTemplateRef('emoji-anchor')
const hasSelection = ref(false)
// Unlike TipTap, a contenteditable loses its selection the moment the menu steals
// focus, so capture the caret at right-click time and operate against that.
const savedCaret = ref({ start: 0, end: 0 })

function onContextMenu(event: MouseEvent) {
  const caret = props.input?.getCaret() ?? { start: message.value.length, end: message.value.length }
  savedCaret.value = caret
  hasSelection.value = caret.start !== caret.end
  recordEmojiAnchor(event)
}

function selectionText() {
  const { start, end } = savedCaret.value
  return message.value.slice(start, end)
}

// Replace the saved selection (or insert at the caret) and restore focus there.
function replaceSelection(text: string) {
  const { start, end } = savedCaret.value
  const before = message.value.slice(0, start)
  const after = message.value.slice(end)
  message.value = before + text + after

  const nextCaret = before.length + text.length
  nextTick(() => {
    props.input?.focus()
    props.input?.setCaret(nextCaret)
  })
}

async function copySelection() {
  await writeClipboard(selectionText(), 'Selection')
  closeMenu()
}

async function cutSelection() {
  await writeClipboard(selectionText(), 'Selection')
  replaceSelection('')
  closeMenu()
}

async function paste() {
  const text = await readClipboard()
  if (text)
    replaceSelection(text)
  closeMenu()
}

function selectAll() {
  props.input?.focus()
  props.input?.setCaret(0, message.value.length)
  closeMenu()
}

function insertEmoji(emoji: string) {
  replaceSelection(emoji)
  emojiOpen.value = false
}
</script>

<template>
  <ContextMenu class="composer-context-menu">
    <div class="composer-context-menu__target" @contextmenu="onContextMenu">
      <slot />
    </div>

    <template #menu>
      <div class="vui-dropdown">
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
    class="composer-context-menu__emoji-anchor"
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
// The menu wraps the composer input, which is a flex child that must keep filling
// the row. Make the wrapper a transparent flex pass-through so the input still
// stretches exactly as it did without the menu around it.
.composer-context-menu {
  display: flex;
  flex: 1;
  min-width: 0;
}

.composer-context-menu__target {
  display: contents;
}

// Invisible point the emoji Popout latches onto, positioned at the click spot.
.composer-context-menu__emoji-anchor {
  position: fixed;
  width: 0;
  height: 0;
  pointer-events: none;
}
</style>
