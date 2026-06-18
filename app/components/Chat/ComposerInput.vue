<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { segStyle, tokenizeForEditor } from '@/lib/ircFormat'

// Contenteditable that renders IRC/markdown formatting live. The canonical value
// is the wire string (control codes + markers); every source character is kept
// in the DOM (formatting characters rendered zero-width) so the DOM text stays
// 1:1 with the wire string and caret offsets map directly. Multi-line: Shift+Enter
// inserts a literal '\n' (never a browser-inserted <br>/<div>, which would break
// that 1:1 mapping); plain Enter is left to the parent to send.
// It exposes an input-like API (focus / getCaret / setCaret) so the composer's
// autocomplete, history and selection toolbar keep working unchanged.

const props = withDefaults(defineProps<{
  modelValue: string
  placeholder?: string
  disabled?: boolean
  // Hide consumed markdown markers (** etc), matching the modern message log.
  // false keeps them visible (classic/IRC mode). Control codes are always hidden.
  stripMarkers?: boolean
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
}>()

const root = ref<HTMLElement>()
let composing = false

// --- rendering -------------------------------------------------------------
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
  // can't move onto the new (empty) last line and the box won't grow. A <br>
  // sentinel forces that line to render. It has no text content, so textContent
  // length and Range offsets stay 1:1 with the wire string - caret math intact.
  if (value.endsWith('\n')) {
    frag.appendChild(document.createElement('br'))
    // Empty text node on the new line so the caret has a downstream position to
    // land in. Without it, a caret at the end of the '\n' text node renders with
    // upstream affinity - clinging to the end of the line above (see nodeAt). It
    // contributes nothing to textContent, so the 1:1 mapping stays intact.
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
    // At a boundary right after a hard line break (the node ends with '\n'), fall
    // through to the next text node so the caret lands at the START of the new line
    // (downstream affinity) rather than clinging to the end of the line above. The
    // trailing-'\n' render() appends an empty text node precisely so this has
    // somewhere to go. Everywhere else, the earliest node reaching `target` wins.
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

// Insert text at the caret, replacing any selection, then re-sync. Used for both
// paste and Shift+Enter so newlines enter as a single '\n' text node - keeping
// the DOM 1:1 with the wire string instead of letting the browser inject blocks.
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

// Shift+Enter. If the (collapsed) caret sits inside an open formatting wrapper,
// drop the newline AFTER the wrapper's trailing hidden run (the closing control
// codes + consumed **/__/~~ markers) so Enter exits the formatting cleanly. Left
// as-is, the newline would split the marker pair across lines - orphaning literal
// markers and malforming the per-line PRIVMSGs of a multiline send.
function insertNewline() {
  const value = root.value?.textContent ?? props.modelValue
  const { start, end } = getCaret()
  if (start === end && hasActiveFormatting(value, end)) {
    // Always treat consumed markers as part of the closing run here, even in
    // classic mode where they render - the newline must clear the whole wrapper.
    const hidden = hiddenAtOffsets(value, true)
    let at = end
    while (at < value.length && hidden[at])
      at++
    if (at !== end)
      setCaret(at)
  }
  insertTextAtCaret('\n')
}

// Step the caret across a contiguous run of hidden formatting characters in one
// move, so it never rests inside a zero-width span (where it would vanish) and
// arrowing past `**bold**` feels like one keystroke per visible character. Uses
// the display mode, so visible markers in classic mode are NOT skipped. Returns
// true when it handled the move; false leaves the native single-char step alone.
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
    if (e.shiftKey) {
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

defineExpose({ focus, getCaret, setCaret, getEl: () => root.value })
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
  min-height: var(--interactive-el-height);
  // box-sizing is border-box (global reset), so a single line must budget for
  // the 1px top/bottom border too - otherwise the field grows by 2px the moment
  // a line box appears. The `- 1px` per side offsets that border. Right padding
  // is overridable (--composer-input-pad-right) so a host can reserve room for an
  // overlaid control (the chat composer's send button).
  // Explicit (numeric) line-height so 1lh and the rendered line box match exactly
  // regardless of which font a span resolves to. With line-height: normal the two
  // diverge whenever a span's font metrics differ from the element's, which makes
  // the box grow by a pixel or two the moment the first line of text appears.
  line-height: 1.4;
  $v-pad: calc((var(--interactive-el-height) - 1lh) / 2 - 1px);
  padding: $v-pad var(--composer-input-pad-right, var(--space-s)) $v-pad var(--space-s);
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

  // The formatting spans are created imperatively (document.createElement), so
  // they carry no scoped-style attribute and DON'T inherit through Vue's scoping.
  // Without this, VUI's global reset (`span { font-size: var(--font-size-m) }`)
  // wins over the element's size - the typed text renders a notch larger than the
  // placeholder, which both looks wrong and nudges the box height on first input.
  // :deep targets the dynamic descendants to pin them back to the input's size.
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
