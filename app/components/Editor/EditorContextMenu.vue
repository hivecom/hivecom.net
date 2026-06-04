<script setup lang="ts">
import type { Editor } from '@tiptap/vue-3'
import { ContextMenu, Divider, DropdownItem, pushToast } from '@dolanske/vui'
import { ref } from 'vue'
import { useExternalLinkGuard } from '@/composables/useExternalLinkGuard'

const props = defineProps<{
  editor: Editor
}>()

const { guardedOpen } = useExternalLinkGuard()

const activeLinkHref = ref<string | null>(null)
const hasSelection = ref(false)

function onContextMenu(event: MouseEvent) {
  const target = event.target as HTMLElement | null
  const anchor = target?.closest('a')
  activeLinkHref.value = anchor?.getAttribute('href') ?? null

  const { from, to } = props.editor.state.selection
  hasSelection.value = from !== to
}

// The VUI ContextMenu only closes when vueuse's onClickOutside fires. That
// requires a click event with detail=0 (programmatic) dispatched outside the
// popout AFTER the current tick - vueuse sets a same-tick dedup guard (p)
// that blocks a synchronous dispatch during the same click handling.
function closeMenu() {
  if (import.meta.client)
    setTimeout(() => document.body.dispatchEvent(new MouseEvent('click', { bubbles: true })), 0)
}

function getSelectionText() {
  const { from, to } = props.editor.state.selection
  return props.editor.state.doc.textBetween(from, to, '\n')
}

async function writeClipboard(text: string, label: string) {
  try {
    await navigator.clipboard.writeText(text)
  }
  catch {
    pushToast(`Could not copy ${label.toLowerCase()} to clipboard`)
  }
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
  try {
    const text = await navigator.clipboard.readText()
    if (text)
      props.editor.chain().focus().insertContent(text).run()
  }
  catch {
    pushToast('Could not read from clipboard')
  }
  closeMenu()
}

function selectAll() {
  props.editor.chain().focus().selectAll().run()
  closeMenu()
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
      </div>
    </template>
  </ContextMenu>
</template>

<style scoped lang="scss">
// Keep the wrapper transparent to layout so the editor renders exactly as it
// would without the context menu around it.
.editor-context-menu__target {
  display: contents;
}
</style>
