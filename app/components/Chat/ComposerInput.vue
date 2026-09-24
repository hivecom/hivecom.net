<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { segStyle, tokenizeForEditor } from '@/lib/ircFormat'

// Contenteditable that renders IRC/markdown formatting live. The canonical value
// is the wire string (control codes + markers). Every source character stays in
// the DOM (formatting characters render zero-width), so DOM text is 1:1 with the
// wire string and caret offsets map directly. Shift+Enter inserts a literal '\n',
// never a browser <br>/<div>, which would break that mapping.

const props = withDefaults(defineProps<{
  modelValue: string
  placeholder?: string
  disabled?: boolean

  // Hide consumed markdown markers (** etc), matching the modern message log.
  // false keeps them visible (classic/IRC mode). Control codes are always hidden.
  stripMarkers?: boolean

  // Make a plain Enter insert a newline instead of handing off to the parent to
  // send. Used on touch where the keyboard's return key should grow the field,
  // not submit (the send button submits). Desktop keeps Enter-to-send.
  enterNewline?: boolean
}>(), {
  stripMarkers: true,
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
  'input': []
  'keydown': [e: KeyboardEvent]
  'keyup': [e: KeyboardEvent]
  'mouseup': [e: MouseEvent]
  'focusout': [e: FocusEvent]
  'pasteFiles': [files: File[]]
}>()

const root = ref<HTMLElement>()
let composing = false

// --- rendering -------------------------------------------------------------
// Emphasis is real marker characters (** * __ ~~ `). Classic/IRC mode shows them.
// Modern mode hides them and the caret skips the hidden run so it never rests on
// a zero-width char. Color has no marker, so it's always an invisible control code.
function render(value: string) {
  const el = root.value
  if (!el)
    return

  const frag = document.createDocumentFragment()
  for (const tk of tokenizeForEditor(value, props.stripMarkers)) {
    const span = document.createElement('span')
    span.textContent = tk.text
    if (tk.hidden) {
      span.className = 'composer-input__ctrl'
    }
    else {
      const st = segStyle(tk.style)
      if (st)
        Object.assign(span.style, st)
    }
    frag.appendChild(span)
  }

  // The browser collapses a trailing newline in pre-wrap content, so the caret
  // can't reach the new last line and the box won't grow. A <br> sentinel forces
  // the line to render. It has no text content, so offsets stay 1:1.
  if (value.endsWith('\n')) {
    frag.appendChild(document.createElement('br'))

    // Empty text node on the new line gives the caret a downstream position.
    // Without it, a caret at the end of the '\n' node clings to the line above
    // (see nodeAt).
    frag.appendChild(document.createTextNode(''))
  }
  el.replaceChildren(frag)
}

// --- caret <-> character-offset mapping ------------------------------------
function offsetOf(container: Node, nodeOffset: number): number {
  const el = root.value!
  const r = document.createRange()
  r.selectNodeContents(el)
  r.setEnd(container, nodeOffset)

  // Range text length counts every character, including the zero-width control
  // spans, which is exactly the wire-string offset.
  return r.toString().length
}

function getCaret(): { start: number, end: number } {
  const el = root.value
  const len = el?.textContent?.length ?? 0
  const sel = window.getSelection()
  if (!el || !sel || sel.rangeCount === 0)
    return { start: len, end: len }

  const rg = sel.getRangeAt(0)
  if (!el.contains(rg.startContainer) || !el.contains(rg.endContainer))
    return { start: len, end: len }

  return { start: offsetOf(rg.startContainer, rg.startOffset), end: offsetOf(rg.endContainer, rg.endOffset) }
}

// Resolve a character offset to a (text node, offset) position for the caret.
function nodeAt(target: number): { node: Node, offset: number } {
  const el = root.value!
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
  let count = 0
  let last: Text | null = null
  let n = walker.nextNode() as Text | null
  while (n) {
    last = n
    const end = count + n.length

    // Right after a hard line break, fall through to the next text node so the
    // caret lands at the start of the new line instead of clinging to the line
    // above. render() appends an empty text node so there's always somewhere to go.
    if (target < end || (target === end && !n.data.endsWith('\n')))
      return { node: n, offset: target - count }

    count = end
    n = walker.nextNode() as Text | null
  }
  if (last)
    return { node: last, offset: last.length }

  return { node: el, offset: 0 }
}

function setCaret(start: number, end: number = start) {
  const el = root.value
  if (!el)
    return

  el.focus()
  const sel = window.getSelection()
  if (!sel)
    return

  const a = nodeAt(start)
  const b = nodeAt(end)
  const rg = document.createRange()
  rg.setStart(a.node, a.offset)
  rg.setEnd(b.node, b.offset)
  sel.removeAllRanges()
  sel.addRange(rg)
}

function focus() {
  root.value?.focus()
}

// Viewport-space box of the current selection for the format toolbar. Null when
// there's no selection here or it spans only zero-width control spans.
function getSelectionRect(): DOMRect | null {
  const el = root.value
  const sel = window.getSelection()
  if (!el || !sel || sel.rangeCount === 0)
    return null

  const rg = sel.getRangeAt(0)
  if (!el.contains(rg.startContainer) || !el.contains(rg.endContainer))
    return null

  const rect = rg.getBoundingClientRect()
  if (rect.width === 0 && rect.height === 0)
    return null

  return rect
}

// --- input flow ------------------------------------------------------------
function syncFromDom() {
  if (composing)
    return

  const el = root.value
  if (!el)
    return

  const value = el.textContent ?? ''
  const caret = getCaret()

  // Re-apply formatting, then restore the caret by character offset (the
  // character sequence is unchanged by re-render, so the offset is stable).
  render(value)
  setCaret(caret.start, caret.end)
  if (value !== props.modelValue)
    emit('update:modelValue', value)
  emit('input')
}

// Insert text at the caret, replacing any selection, then re-sync. Paste and
// Shift+Enter go through here so newlines enter as a single '\n' text node
// instead of browser-injected blocks.
function insertTextAtCaret(text: string) {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0)
    return

  const rg = sel.getRangeAt(0)
  rg.deleteContents()
  const node = document.createTextNode(text)
  rg.insertNode(node)
  rg.setStartAfter(node)
  rg.collapse(true)
  sel.removeAllRanges()
  sel.addRange(rg)
  syncFromDom()
}

// Whether any IRC control-code formatting (bold/italic/underline/strike/mono/
// color) is open at wire-string offset `at`. Mirrors parseIrcFormatting's toggle
// logic so we can tell if the caret sits inside a formatting wrapper.
function hasActiveFormatting(value: string, at: number): boolean {
  let bold = false
  let italic = false
  let underline = false
  let strike = false
  let mono = false
  let color = false
  let i = 0

  while (i < at) {
    const code = value.charCodeAt(i)

    if (code === 0x03) {
      // Color: optional fg[,bg] digits. An empty \x03 resets color.
      i++

      let hadColor = false

      if (i < at && /\d/.test(value[i]!)) {
        hadColor = true
        i++

        if (i < at && /\d/.test(value[i]!))
          i++
      }

      if (i < at && value[i] === ',') {
        i++

        if (i < at && /\d/.test(value[i]!)) {
          i++

          if (i < at && /\d/.test(value[i]!))
            i++
        }
      }

      color = hadColor
      continue
    }

    if (code === 0x02)
      bold = !bold
    else if (code === 0x1D)
      italic = !italic
    else if (code === 0x1F)
      underline = !underline
    else if (code === 0x1E)
      strike = !strike
    else if (code === 0x11)
      mono = !mono
    else if (code === 0x0F)
      bold = italic = underline = strike = mono = color = false

    i++
  }

  return bold || italic || underline || strike || mono || color
}

// Per-character "hidden" flag keyed by wire-string offset, from the same tokenizer
// the renderer uses. `strip` controls whether consumed markers count as hidden:
// pass the display mode for caret movement (so visible markers aren't skipped),
// or true for formatting-structure decisions (exit-on-newline) regardless of mode.
function hiddenAtOffsets(value: string, strip: boolean): boolean[] {
  const map: boolean[] = []
  for (const tk of tokenizeForEditor(value, strip)) {
    for (let i = 0; i < tk.text.length; i++)
      map.push(tk.hidden)
  }
  return map
}

// Shift+Enter. Inside an open formatting wrapper, place the newline after the
// wrapper's closing hidden run so Enter exits the formatting. Otherwise the marker
// pair splits across lines and malforms the per-line PRIVMSGs of a multiline send.
function insertNewline() {
  const value = root.value?.textContent ?? props.modelValue
  const { start, end } = getCaret()
  if (start === end && hasActiveFormatting(value, end)) {
    // Count consumed markers as part of the closing run even in classic mode,
    // since the newline must clear the whole wrapper.
    const hidden = hiddenAtOffsets(value, true)
    let at = end
    while (at < value.length && hidden[at])
      at++
    if (at !== end)
      setCaret(at)
  }
  insertTextAtCaret('\n')
}

// Step the caret across a run of zero-width formatting characters in one move,
// so it never vanishes inside one. Uses the display mode, so visible markers in
// classic/IRC mode are stepped through normally. False leaves the native step.
function skipHiddenCaret(forward: boolean): boolean {
  const value = root.value?.textContent ?? props.modelValue
  const { start, end } = getCaret()
  if (start !== end)
    return false

  const hidden = hiddenAtOffsets(value, props.stripMarkers)
  let p = start
  if (forward) {
    if (p >= value.length || !hidden[p])
      return false

    while (p < value.length && hidden[p])
      p++
  }
  else {
    if (p <= 0 || !hidden[p - 1])
      return false

    while (p > 0 && hidden[p - 1])
      p--
  }
  setCaret(p)
  return true
}

function onKeydown(e: KeyboardEvent) {
  // Enter: Shift+Enter inserts a newline; plain Enter is handed to the parent
  // (which decides between accepting an autocomplete suggestion and sending).
  // Either way the browser's own block insertion is prevented.
  if (e.key === 'Enter' && !e.isComposing) {
    e.preventDefault()

    // Shift+Enter always inserts a newline; on touch (enterNewline) a plain
    // Enter does too. Either way the parent never sees it as a send intent.
    if (e.shiftKey || props.enterNewline) {
      insertNewline()
      return
    }
  }

  // Plain Left/Right: jump over hidden formatting so the caret doesn't vanish on
  // a zero-width span. Modified arrows (shift/ctrl/alt/meta) keep native behavior.
  else if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
    if (skipHiddenCaret(e.key === 'ArrowRight'))
      e.preventDefault()
  }
  emit('keydown', e)
}

function onCompositionStart() {
  composing = true
}

function onCompositionEnd() {
  composing = false
  syncFromDom()
}

function onPaste(e: ClipboardEvent) {
  e.preventDefault()

  // Files on the clipboard (a screenshot, a copied image/file) go to the host as
  // attachments rather than into the text.
  const files = Array.from(e.clipboardData?.files ?? [])
  if (files.length) {
    emit('pasteFiles', files)
    return
  }

  // Normalize CRLF / lone CR to '\n' but keep the line breaks (multi-line paste).
  const text = (e.clipboardData?.getData('text/plain') ?? '').replace(/\r\n?/g, '\n')
  if (!text)
    return

  insertTextAtCaret(text)
}

// Re-render on external value changes (toolbar inserts, history, programmatic
// clears). Skip when the DOM already matches (our own input handler set it).
watch(() => props.modelValue, (val) => {
  const el = root.value
  if (!el || (el.textContent ?? '') === val)
    return

  const hadFocus = el.contains(document.activeElement)
  render(val)

  // Only touch the caret/focus when we already had focus, so a programmatic
  // clear or buffer switch doesn't steal it.
  if (hadFocus)
    setCaret(val.length)
})

// Toggling the display mode flips marker visibility without changing the wire
// string, so re-render in place and keep the caret where it is.
watch(() => props.stripMarkers, () => {
  const el = root.value
  if (!el)
    return

  const hadFocus = el.contains(document.activeElement)
  const caret = hadFocus ? getCaret() : null
  render(el.textContent ?? props.modelValue)
  if (caret)
    setCaret(caret.start, caret.end)
})

onMounted(() => render(props.modelValue))

defineExpose({ focus, getCaret, setCaret, getSelectionRect, getEl: () => root.value })
</script>

<template>
  <div
    ref="root"
    class="composer-input"
    :contenteditable="!props.disabled"
    role="textbox"
    :aria-disabled="props.disabled"
    :data-placeholder="props.placeholder"
    @input="syncFromDom"
    @keydown="onKeydown"
    @keyup="(e) => emit('keyup', e)"
    @mouseup="(e) => emit('mouseup', e)"
    @focusout="(e) => emit('focusout', e)"
    @paste="onPaste"
    @compositionstart="onCompositionStart"
    @compositionend="onCompositionEnd"
  />
</template>

<style lang="scss" scoped>
.composer-input {
  flex: 1;
  min-width: 0;
  // One line by default; a host can reserve more (--composer-input-min-height).
  min-height: var(--composer-input-min-height, var(--interactive-el-height));
  // box-sizing is border-box, so a single line budgets for the 1px top/bottom
  // border (the `- 1px` per side) or the field grows 2px when a line box appears.
  // Left/right padding are overridable so a host can make room for overlaid
  // controls. A numeric line-height keeps 1lh and the rendered line box equal
  // whatever font a span resolves to.
  line-height: 1.4;
  $v-pad: calc((var(--interactive-el-height) - 1lh) / 2 - 1px);
  padding: $v-pad var(--composer-input-pad-right, var(--space-s)) $v-pad var(--composer-input-pad-left, var(--space-s));
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  outline: none;
  cursor: text;
  // Match the message log's text size (set on .chat-app) so the composer reads
  // at the same scale as the conversation. The font family var is set by the
  // composer (classic mode uses monospace); mono spans override it inline.
  font-family: var(--irc-input-font, var(--font));
  font-size: var(--chat-font-size, var(--font-size-s));

  &[aria-disabled='true'] {
    cursor: not-allowed;
    opacity: 0.6;
  }

  // Formatting spans are created imperatively, so they carry no scoped attribute.
  // Without this, VUI's global `span { font-size }` reset renders typed text a
  // notch larger than the placeholder and nudges the box height on first input.
  :deep(span) {
    font-size: var(--chat-font-size, var(--font-size-s));
  }

  // Control codes and consumed markdown markers: kept in the DOM (so the caret
  // maps 1:1 to the wire string) but rendered with no width. Higher specificity
  // than the :deep(span) rule above, so the zero width still wins.
  :deep(.composer-input__ctrl) {
    font-size: 0;
  }

  &:empty::before {
    content: attr(data-placeholder);
    color: var(--color-text-lighter);
    pointer-events: none;
  }
}
</style>
