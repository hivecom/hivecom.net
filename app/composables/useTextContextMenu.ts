import { pushToast } from '@dolanske/vui'
import { ref } from 'vue'

// Shared plumbing for the editor and composer right-click menus: closing the VUI
// ContextMenu, clipboard read/write with a failure toast, and opening the emoji
// picker anchored at the click point. The text operations themselves (cut, paste,
// insert) differ per backend and stay in each component.
export function useTextContextMenu() {
  const emojiOpen = ref(false)
  // Where the right-click happened, so the picker can anchor at the menu spot.
  const emojiPos = ref({ x: 0, y: 0 })

  // The VUI ContextMenu only closes when vueuse's onClickOutside fires. That
  // requires a click event with detail=0 (programmatic) dispatched outside the
  // popout AFTER the current tick - vueuse sets a same-tick dedup guard (p)
  // that blocks a synchronous dispatch during the same click handling.
  function closeMenu() {
    if (import.meta.client)
      setTimeout(() => document.body.dispatchEvent(new MouseEvent('click', { bubbles: true })), 0)
  }

  async function writeClipboard(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text)
    }
    catch {
      pushToast(`Could not copy ${label.toLowerCase()} to clipboard`)
    }
  }

  async function readClipboard(): Promise<string | null> {
    try {
      return await navigator.clipboard.readText()
    }
    catch {
      pushToast('Could not read from clipboard')
      return null
    }
  }

  function recordEmojiAnchor(event: MouseEvent) {
    emojiPos.value = { x: event.clientX, y: event.clientY }
  }

  function openEmojiPicker() {
    closeMenu()
    // Open after the synthetic body click that closes the context menu, so the
    // picker's own click-outside guard isn't tripped by that same click.
    if (import.meta.client)
      setTimeout(() => { emojiOpen.value = true }, 0)
    else
      emojiOpen.value = true
  }

  return { emojiOpen, emojiPos, closeMenu, writeClipboard, readClipboard, recordEmojiAnchor, openEmojiPicker }
}
