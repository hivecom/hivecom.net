<script setup lang="ts">
import { Button, ButtonGroup, Flex, Modal, Popout, Spinner } from '@dolanske/vui'
import { computed, onMounted, onUnmounted, ref, watch, watchEffect } from 'vue'
import ChatComposerAttachments from '@/components/Chat/ComposerAttachments.vue'
import ChatComposerInput from '@/components/Chat/ComposerInput.vue'
import IrcWhoisCard from '@/components/Chat/IrcWhoisCard.vue'
import RelaySourceIcon from '@/components/Chat/RelaySourceIcon.vue'
import ChatTypingIndicator from '@/components/Chat/TypingIndicator.vue'
import UserPreviewCard from '@/components/Shared/UserPreviewCard.vue'
import { useChatAttachments } from '@/composables/useChatAttachments'
import { useDataUserSettings } from '@/composables/useDataUserSettings'
import { nickColor, useIrcChat, whoisStore } from '@/composables/useIrcChat'
import { useIrcNickResolver } from '@/composables/useIrcNickResolver'
import { useBreakpoint } from '@/lib/mediaQuery'

const { inputMessage, activeName, activeBuffer, canChat, users, buffers, nick, sendMessage, replyTarget, clearReply, sendTyping, requestWhois, markBufferRead, channelList, listChannels, channelListLoading, registerComposerFocus, relaySeparator } = useIrcChat()
const { settings } = useDataUserSettings()
const { resolved: resolvedNicks, resolve: resolveNick } = useIrcNickResolver()
const isMobile = useBreakpoint('<s')
const isModernMode = computed(() => isMobile.value || settings.value.chat_display_mode === 'modern')

const inputComp = ref<InstanceType<typeof ChatComposerInput>>()

onMounted(() => {
  registerComposerFocus(() => inputComp.value?.focus())
  watchEffect(() => {
    const el = inputComp.value?.getEl()
    if (!el)
      return
    if (isModernMode.value)
      el.style.removeProperty('--irc-input-font')
    else
      el.style.setProperty('--irc-input-font', 'monospace')
  })
})

watch(activeBuffer, (buf) => {
  if (buf?.kind === 'pm')
    resolveNick([buf.name.toLowerCase()])
}, { immediate: true })

// /whois modal - independent of the active PM buffer
const whoisModalNick = ref<string | null>(null)
const whoisModalData = computed(() =>
  whoisModalNick.value ? (whoisStore.value.get(whoisModalNick.value.toLowerCase()) ?? null) : null,
)
const whoisModalUserId = computed(() =>
  whoisModalNick.value ? (resolvedNicks.value.get(whoisModalNick.value.toLowerCase())?.id ?? null) : null,
)

const placeholder = computed(() => {
  if (!canChat.value)
    return 'Join a channel to chat...'
  if (activeBuffer.value?.kind === 'server')
    return 'Type a /command (e.g. /join #channel)...'
  return `Message ${activeName.value}...`
})

// --- Depot attachments -------------------------------------------------------
// Files queued for the next send. On send they're uploaded to Depot and their
// URLs are folded into the outgoing message (where the log auto-embeds images).
const { attachments, uploading: attachmentsUploading, add: addAttachments, remove: removeAttachment, clear: clearAttachments, uploadAll: uploadAttachments } = useChatAttachments()
const fileInput = ref<HTMLInputElement>()
const dragging = ref(false)

function openFilePicker() {
  fileInput.value?.click()
}

function onFilesPicked(event: Event) {
  const input = event.target as HTMLInputElement
  if (input.files?.length)
    addAttachments(input.files)
  // Reset so picking the same file again still fires change.
  input.value = ''
}

function onDragOver(event: DragEvent) {
  if (!canChat.value || !event.dataTransfer?.types.includes('Files'))
    return
  event.preventDefault()
  dragging.value = true
}

function onDragLeave(event: DragEvent) {
  // Ignore leaves into child elements; only clear when leaving the field itself.
  if (event.currentTarget instanceof Node && event.relatedTarget instanceof Node && (event.currentTarget as Node).contains(event.relatedTarget))
    return
  dragging.value = false
}

function onDrop(event: DragEvent) {
  dragging.value = false
  const files = event.dataTransfer?.files
  if (!canChat.value || !files?.length)
    return
  event.preventDefault()
  addAttachments(files)
}

const disabled = computed(() =>
  !canChat.value || attachmentsUploading.value || (!inputMessage.value.trim() && attachments.value.length === 0),
)

// --- autocomplete (@mentions + /commands) ----------------------------------

const MAX_SUGGESTIONS = 8

interface CommandSpec {
  name: string
  usage: string
  hint: string
}

const COMMANDS: CommandSpec[] = [
  { name: 'join', usage: '/join #channel [key]', hint: 'Join a channel' },
  { name: 'part', usage: '/part [#channel]', hint: 'Leave the current or named channel' },
  { name: 'query', usage: '/query <nick>', hint: 'Open a private message' },
  { name: 'me', usage: '/me <action>', hint: 'Send an action message' },
  { name: 'nick', usage: '/nick <name>', hint: 'Change your nickname' },
  { name: 'topic', usage: '/topic [text]', hint: 'Set or view the channel topic' },
  { name: 'op', usage: '/op [nick]', hint: 'Grant operator status to a user' },
  { name: 'deop', usage: '/deop [nick]', hint: 'Remove operator status from a user' },
  { name: 'voice', usage: '/voice [nick]', hint: 'Grant voice to a user' },
  { name: 'devoice', usage: '/devoice [nick]', hint: 'Remove voice from a user' },
  { name: 'kick', usage: '/kick <nick> [reason]', hint: 'Kick a user from the channel' },
  { name: 'invite', usage: '/invite <nick>', hint: 'Invite a user to the channel' },
  { name: 'mode', usage: '/mode [+/-flags] [args]', hint: 'Set modes on the current channel' },
  { name: 'whois', usage: '/whois <nick>', hint: 'Look up info about a user' },
]

interface Suggestion {
  value: string
  label: string
  hint?: string
  colored: boolean
}

type TriggerMode = 'mention' | 'command' | 'channel'

const mode = ref<TriggerMode | null>(null)
const query = ref('')
const triggerStart = ref(-1)
const activeIndex = ref(0)

// Caret helpers delegating to the contenteditable composer input. Offsets are
// in wire-string space (control codes + markers included), matching inputMessage.
function getCaret(): { start: number, end: number } {
  return inputComp.value?.getCaret() ?? { start: inputMessage.value.length, end: inputMessage.value.length }
}

function setCaret(start: number, end: number = start) {
  inputComp.value?.setCaret(start, end)
}

const suggestions = computed<Suggestion[]>(() => {
  const q = query.value.toLowerCase()
  if (mode.value === 'mention') {
    return users.value
      .filter(u => u.name !== nick.value && u.name.toLowerCase().startsWith(q))
      .slice(0, MAX_SUGGESTIONS)
      .map(u => ({ value: u.name, label: u.name, colored: true }))
  }
  if (mode.value === 'channel') {
    const prefix = `#${q}`
    const isJoinCmd = /^\/j(?:oin)? /i.test(inputMessage.value)
    if (isJoinCmd) {
      // Fetch channel list on demand if not yet loaded.
      if (!channelList.value.length && !channelListLoading.value)
        listChannels()
      const joinedNames = new Set(buffers.value.filter(b => b.kind === 'channel' && b.joined).map(b => b.name.toLowerCase()))
      // Prefer channel list (from browser) if populated; otherwise fall back to all buffered channels.
      if (channelList.value.length) {
        return channelList.value
          .filter(e => !joinedNames.has(e.name.toLowerCase()) && e.name.toLowerCase().startsWith(prefix))
          .slice(0, MAX_SUGGESTIONS)
          .map(e => ({ value: e.name, label: e.name, hint: e.topic, colored: false }))
      }
      return buffers.value
        .filter(b => b.kind === 'channel' && b.name.toLowerCase().startsWith(prefix))
        .slice(0, MAX_SUGGESTIONS)
        .map(b => ({ value: b.name, label: b.name, hint: b.topic, colored: false }))
    }
    // General #channel reference: merge buffers + channelList, dedupe, sort alphabetically.
    const seen = new Set<string>()
    const merged: Suggestion[] = []
    for (const b of buffers.value) {
      if (b.kind === 'channel' && b.name.toLowerCase().startsWith(prefix)) {
        seen.add(b.name.toLowerCase())
        merged.push({ value: b.name, label: b.name, hint: b.topic, colored: false })
      }
    }
    for (const e of channelList.value) {
      if (!seen.has(e.name.toLowerCase()) && e.name.toLowerCase().startsWith(prefix))
        merged.push({ value: e.name, label: e.name, hint: e.topic, colored: false })
    }
    return merged.sort((a, b) => a.value.localeCompare(b.value)).slice(0, MAX_SUGGESTIONS)
  }
  if (mode.value === 'command') {
    return COMMANDS
      .filter(c => c.name.startsWith(q))
      .slice(0, MAX_SUGGESTIONS)
      .map(c => ({ value: c.name, label: c.usage, hint: c.hint, colored: false }))
  }
  return []
})

const open = computed(() => mode.value !== null && suggestions.value.length > 0)

const triggerIcon = computed(() => {
  if (mode.value === 'command')
    return 'ph:terminal-window'
  if (mode.value === 'channel')
    return 'ph:hash'
  return 'ph:at'
})

// Decide which (if any) autocomplete trigger sits immediately left of the caret.
function detectTrigger(value: string, caret: number) {
  // `/command` is only valid as the very first token of the message.
  if (value[0] === '/' && !/\s/.test(value.slice(0, caret))) {
    mode.value = 'command'
    triggerStart.value = 0
    query.value = value.slice(1, caret)
    activeIndex.value = 0
    return
  }

  // `@mention` and `#channel` are valid at the start or after whitespace, with no inner spaces.
  let i = caret - 1
  while (i >= 0 && !/\s/.test(value[i]!)) {
    if (value[i] === '@' || value[i] === '#') {
      const before = value[i - 1]
      if (i === 0 || (before && /\s/.test(before))) {
        mode.value = value[i] === '@' ? 'mention' : 'channel'
        triggerStart.value = i
        query.value = value.slice(i + 1, caret)
        activeIndex.value = 0
        return
      }
      break
    }
    i--
  }

  closeSuggestions()
}

function closeSuggestions() {
  mode.value = null
  query.value = ''
  triggerStart.value = -1
}

function onInput() {
  detectTrigger(inputMessage.value, getCaret().end)
}

function accept(item: Suggestion) {
  if (triggerStart.value < 0)
    return
  const caret = getCaret().end
  const before = inputMessage.value.slice(0, triggerStart.value)
  const after = inputMessage.value.slice(caret)

  let insert: string
  if (mode.value === 'command') {
    insert = `/${item.value} `
  }
  else if (mode.value === 'channel') {
    insert = `${item.value} `
  }
  else {
    // Address the user with a colon when the mention is the whole message.
    const isStandalone = before.trim() === '' && after.trim() === ''
    insert = isStandalone ? `@${item.value}: ` : `@${item.value} `
  }

  inputMessage.value = before + insert + after
  closeSuggestions()

  const nextCaret = before.length + insert.length
  nextTick(() => setCaret(nextCaret))
}

// --- selection formatting toolbar (desktop) --------------------------------
// When the user selects text in the composer we float a small toolbar above
// it. Each button wraps the selection with an IRC control code AND keeps the
// readable markdown-style markers (** etc) literally in the message, so plain
// IRC clients still see the emphasis while our renderer styles it for real.
// Colors are code-only since there's no marker convention for them.

const selStart = ref(-1)
const selEnd = ref(-1)
const colorPickerOpen = ref(false)
const colorButtonRef = ref<HTMLElement | null>(null)

// mIRC base palette (codes 0-15). Mirrors the values the message renderer uses.
const MIRC_PALETTE: { code: number, hex: string }[] = [
  { code: 0, hex: '#FFFFFF' },
  { code: 1, hex: '#000000' },
  { code: 2, hex: '#00007F' },
  { code: 3, hex: '#009300' },
  { code: 4, hex: '#FF0000' },
  { code: 5, hex: '#7F0000' },
  { code: 6, hex: '#9C009C' },
  { code: 7, hex: '#FC7F00' },
  { code: 8, hex: '#FFFF00' },
  { code: 9, hex: '#00FC00' },
  { code: 10, hex: '#009393' },
  { code: 11, hex: '#00FFFF' },
  { code: 12, hex: '#0000FC' },
  { code: 13, hex: '#FF00FF' },
  { code: 14, hex: '#7F7F7F' },
  { code: 15, hex: '#D2D2D2' },
]

const showFormatToolbar = computed(() =>
  !isMobile.value && !open.value && canChat.value && selEnd.value > selStart.value,
)

// Track the input's current selection range. Bound to select/mouseup/keyup so
// it stays in sync however the user changes it.
function syncSelection() {
  const { start, end } = getCaret()
  selStart.value = start
  selEnd.value = end
  // Selection collapsed (toolbar will hide) - drop any open color picker so it
  // doesn't auto-reopen the next time text is selected.
  if (selEnd.value <= selStart.value)
    colorPickerOpen.value = false
}

function clearSelectionState() {
  selStart.value = -1
  selEnd.value = -1
  colorPickerOpen.value = false
}

// Toggle the `before`/`after` wrapper around the tracked selection. If the
// selection is already flanked by this exact wrapper, strip it (toggle off);
// otherwise add it (toggle on). The inner text is reselected either way so
// formats stack and the toolbar stays visible. Toggle-off matches the wrapper
// this same function produces, so apply-then-reapply cleanly removes it.
function wrapSelection(before: string, after: string) {
  const start = selStart.value
  const end = selEnd.value
  if (start < 0)
    return
  const value = inputMessage.value
  const wrappedBefore = start >= before.length && value.slice(start - before.length, start) === before
  const wrappedAfter = value.slice(end, end + after.length) === after

  if (end > start) {
    const selected = value.slice(start, end)
    if (wrappedBefore && wrappedAfter) {
      // Toggle off: drop the surrounding wrapper, reselect the bare content.
      inputMessage.value = value.slice(0, start - before.length) + selected + value.slice(end + after.length)
      const ns = start - before.length
      const ne = ns + selected.length
      selStart.value = ns
      selEnd.value = ne
      nextTick(() => setCaret(ns, ne))
      return
    }
    // Toggle on: wrap and reselect the inner text so formats can be stacked.
    inputMessage.value = value.slice(0, start) + before + selected + after + value.slice(end)
    const innerStart = start + before.length
    const innerEnd = innerStart + selected.length
    selStart.value = innerStart
    selEnd.value = innerEnd
    nextTick(() => setCaret(innerStart, innerEnd))
  }
  else {
    if (wrappedBefore && wrappedAfter) {
      // Collapsed caret sitting inside an empty wrapper: remove the empty pair.
      inputMessage.value = value.slice(0, start - before.length) + value.slice(start + after.length)
      const caret = start - before.length
      selStart.value = caret
      selEnd.value = caret
      nextTick(() => setCaret(caret))
      return
    }
    // Collapsed caret (e.g. a keybind with no selection): insert an empty pair
    // and drop the caret between the markers so the user can type inside.
    inputMessage.value = value.slice(0, start) + before + after + value.slice(start)
    const caret = start + before.length
    selStart.value = caret
    selEnd.value = caret
    nextTick(() => setCaret(caret))
  }
}

// Control code goes INSIDE the markers, e.g. strikethrough wraps as
// tilde-tilde, strike-on, text, strike-off, tilde-tilde. Only the content is
// styled so the markers stay clean (no struck or bolded asterisks), while
// code-only IRC clients still get the styling.
const formatBold = () => wrapSelection('**\u0002', '\u0002**')
const formatItalic = () => wrapSelection('*\u001D', '\u001D*')
const formatUnderline = () => wrapSelection('__\u001F', '\u001F__')
const formatStrike = () => wrapSelection('~~\u001E', '\u001E~~')
const formatMono = () => wrapSelection('`\u0011', '\u0011`')

function applyColor(code: number) {
  // Zero-pad so a digit immediately after the code isn't read as part of the
  // color number by the renderer's two-digit parser.
  const padded = String(code).padStart(2, '0')
  wrapSelection(`\u0003${padded}`, '\u0003')
  colorPickerOpen.value = false
}

function onFocusOut() {
  closeSuggestions()
  clearSelectionState()
}

// Ctrl/Cmd keybinds. Sync the tracked selection from the live caret first since
// the user may not have triggered the toolbar's selection sync.
function formatKeybind(fn: () => void) {
  const { start, end } = getCaret()
  selStart.value = start
  selEnd.value = end
  fn()
}

function handleFormatKeybind(event: KeyboardEvent): boolean {
  if ((!event.ctrlKey && !event.metaKey) || event.altKey)
    return false
  const k = event.key.toLowerCase()
  let fn: (() => void) | undefined
  if (event.shiftKey) {
    if (k === 'x')
      fn = formatStrike
    else if (k === 'm')
      fn = formatMono
  }
  else if (k === 'b') {
    fn = formatBold
  }
  else if (k === 'i') {
    fn = formatItalic
  }
  else if (k === 'u') {
    fn = formatUnderline
  }
  if (!fn)
    return false
  // Stop the browser's native contenteditable bold/italic/underline.
  event.preventDefault()
  formatKeybind(fn)
  return true
}

// --- IRC-style tab completion --------------------------------------------

interface TabCycle {
  matches: string[]
  index: number
  wordStart: number
  wordEnd: number
  hasAt: boolean
  hasHash: boolean
}

let tabCycle: TabCycle | null = null

function tabComplete(event: KeyboardEvent) {
  event.preventDefault()
  const value = inputMessage.value
  const caret = getCaret().end

  if (tabCycle) {
    // Cycle to the next match.
    tabCycle.index = (tabCycle.index + 1) % tabCycle.matches.length
  }
  else {
    // Find the word immediately before the caret (no spaces).
    const wordEnd = caret
    let wordStart = caret
    while (wordStart > 0 && !/\s/.test(value[wordStart - 1]!)) wordStart--
    const hasAt = value[wordStart] === '@'
    const hasHash = value[wordStart] === '#'
    const partial = value.slice(wordStart, wordEnd).replace(/^[@#]/, '').toLowerCase()
    if (!partial)
      return
    const matches = hasHash
      ? buffers.value
          .filter(b => b.kind === 'channel' && b.name.toLowerCase().slice(1).startsWith(partial))
          .map(b => b.name)
      : users.value
          .filter(u => u.name.toLowerCase().startsWith(partial))
          .map(u => u.name)
    if (!matches.length)
      return
    tabCycle = { matches, index: 0, wordStart, wordEnd, hasAt, hasHash }
  }

  const { matches, index, wordStart, wordEnd, hasAt, hasHash } = tabCycle
  const match = matches[index]!
  const before = value.slice(0, wordStart)
  const after = value.slice(wordEnd)
  let insert: string
  if (hasHash) {
    // Channels: value already includes `#`, no colon convention.
    insert = `${match} `
  }
  else {
    // Standalone (only token) gets `: `, mid-message gets ` `.
    const isStandalone = before.trim() === '' && after.trim() === ''
    const prefix = hasAt ? '@' : ''
    insert = isStandalone ? `${prefix}${match}: ` : `${prefix}${match} `
  }
  inputMessage.value = before + insert + after
  tabCycle.wordEnd = wordStart + insert.length

  const nextCaret = before.length + insert.length
  nextTick(() => setCaret(nextCaret))
}

// --- per-buffer drafts + command history (persisted to localStorage) --------
// Each buffer (channel/PM/server) keeps its own composer draft and command
// history, so switching channels preserves what you were typing and your
// per-channel recall. Keyed by lowercased buffer name.

const DRAFTS_KEY = 'hivecom.chat.drafts'
const HISTORY_KEY = 'hivecom.chat.history'
const HISTORY_LIMIT = 100

const drafts = new Map<string, string>()
const histories = new Map<string, string[]>()
const historyIndex = ref(-1)
// In-progress text stashed when the user starts walking history with ArrowUp.
const historyDraft = ref('')

function bufKey(name = activeName.value) {
  return name.toLowerCase()
}

function getHistory(): string[] {
  const key = bufKey()
  let h = histories.get(key)
  if (!h) {
    h = []
    histories.set(key, h)
  }
  return h
}

function flushDrafts() {
  if (!import.meta.client)
    return
  const obj: Record<string, string> = {}
  for (const [k, v] of drafts) {
    if (v)
      obj[k] = v
  }
  localStorage.setItem(DRAFTS_KEY, JSON.stringify(obj))
}

let _persistDraftsTimer: ReturnType<typeof setTimeout> | null = null
function persistDrafts() {
  if (!import.meta.client)
    return
  if (_persistDraftsTimer !== null)
    clearTimeout(_persistDraftsTimer)
  _persistDraftsTimer = setTimeout(() => {
    _persistDraftsTimer = null
    flushDrafts()
  }, 150)
}

function persistHistory() {
  if (!import.meta.client)
    return
  const obj: Record<string, string[]> = {}
  for (const [k, v] of histories) {
    if (v.length)
      obj[k] = v
  }
  localStorage.setItem(HISTORY_KEY, JSON.stringify(obj))
}

function saveDraft(name: string, value: string) {
  const key = bufKey(name)
  if (value)
    drafts.set(key, value)
  else
    drafts.delete(key)
  persistDrafts()
}

onMounted(() => {
  if (!import.meta.client)
    return
  try {
    const d = JSON.parse(localStorage.getItem(DRAFTS_KEY) ?? '{}')
    for (const [k, v] of Object.entries(d)) {
      if (typeof v === 'string' && v)
        drafts.set(k, v)
    }
  }
  catch {}
  try {
    const h = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '{}')
    for (const [k, v] of Object.entries(h)) {
      if (Array.isArray(v))
        histories.set(k, v.filter((x): x is string => typeof x === 'string'))
    }
  }
  catch {}
  // Restore the draft for whichever buffer is active on load.
  const initial = drafts.get(bufKey())
  if (initial)
    inputMessage.value = initial
})

onUnmounted(() => {
  // Flush any pending debounced write so an in-progress draft survives a route
  // change away from the chat.
  if (_persistDraftsTimer !== null) {
    clearTimeout(_persistDraftsTimer)
    _persistDraftsTimer = null
  }
  flushDrafts()
})

// --- Typing indicator state machine -----------------------------------------
// 500ms debounce before the first 'active' send in each burst; prevents sending
// for quick corrections the user immediately deletes.
let _activeDebounceTimer: ReturnType<typeof setTimeout> | null = null
// 4s idle timer that sends 'paused' after the user stops typing.
let _pauseTimer: ReturnType<typeof setTimeout> | null = null
// True once 'active' has been sent for the current burst. Lets subsequent
// keystrokes go straight to the composable's 3s throttle without re-debouncing.
let _typingSessionActive = false
// Set true just before sendMessage() clears the input so the watcher below
// doesn't mistake the programmatic clear for the user wiping the field.
let _skipTypingDone = false

function clearTypingTimers() {
  if (_activeDebounceTimer !== null) {
    clearTimeout(_activeDebounceTimer)
    _activeDebounceTimer = null
  }
  if (_pauseTimer !== null) {
    clearTimeout(_pauseTimer)
    _pauseTimer = null
  }
  _typingSessionActive = false
}

watch(inputMessage, (newVal, oldVal) => {
  // Keep the active buffer's persisted draft in sync with the composer.
  saveDraft(activeName.value, newVal)

  // Clear read markers when the user starts typing - they're actively engaged.
  if (newVal && !oldVal?.trim())
    markBufferRead(activeName.value)

  if (!newVal) {
    if (oldVal && !_skipTypingDone && settings.value.chat_typing_indicators)
      sendTyping('done')
    _skipTypingDone = false
    clearTypingTimers()
    return
  }
  _skipTypingDone = false
  // Slash commands are not user messages - don't advertise typing.
  if (!settings.value.chat_typing_indicators || newVal.startsWith('/')) {
    clearTypingTimers()
    return
  }
  // Reset the 4s idle timer on every keystroke.
  if (_pauseTimer !== null) {
    clearTimeout(_pauseTimer)
    _pauseTimer = null
  }
  _pauseTimer = setTimeout(() => {
    _pauseTimer = null
    _typingSessionActive = false
    if (inputMessage.value && !inputMessage.value.startsWith('/') && settings.value.chat_typing_indicators)
      sendTyping('paused')
  }, 4000)
  if (_typingSessionActive) {
    // Already inside a burst - let the composable's 3s throttle gate re-sends.
    sendTyping('active')
  }
  else if (_activeDebounceTimer === null) {
    // New burst: wait 500ms before advertising typing to avoid noise from
    // quick corrections the user immediately deletes.
    _activeDebounceTimer = setTimeout(() => {
      _activeDebounceTimer = null
      if (!inputMessage.value || inputMessage.value.startsWith('/') || !settings.value.chat_typing_indicators)
        return
      _typingSessionActive = true
      sendTyping('active')
    }, 500)
  }
})

function pushHistory(msg: string) {
  const h = getHistory()
  if (msg && msg !== h[h.length - 1]) {
    h.push(msg)
    if (h.length > HISTORY_LIMIT)
      h.splice(0, h.length - HISTORY_LIMIT)
    persistHistory()
  }
  historyIndex.value = -1
  historyDraft.value = ''
}

async function sendWithHistory() {
  // Upload any queued attachments first, then fold their URLs into the message.
  // A failed upload keeps the tray so the user can retry; nothing is sent.
  if (attachments.value.length) {
    if (attachmentsUploading.value)
      return
    const urls = await uploadAttachments()
    if (!urls)
      return
    const base = inputMessage.value.trim()
    inputMessage.value = base ? `${base} ${urls.join(' ')}` : urls.join(' ')
    clearAttachments()
  }

  _skipTypingDone = true
  clearTypingTimers()
  const msg = inputMessage.value.trim()

  const whoisMatch = msg.match(/^\/whois\s+(\S+)/i)
  if (whoisMatch) {
    const targetNick = whoisMatch[1]!
    requestWhois(targetNick)
    resolveNick([targetNick.toLowerCase()])
    whoisModalNick.value = targetNick
    inputMessage.value = ''
    historyIndex.value = -1
    return
  }

  if (msg)
    pushHistory(msg)
  sendMessage()
  historyIndex.value = -1
}

function onKeydown(event: KeyboardEvent) {
  if (event.key !== 'Tab')
    tabCycle = null

  // Formatting shortcuts take priority (Ctrl/Cmd+B/I/U, +Shift+X strike, +Shift+M mono).
  if (handleFormatKeybind(event))
    return

  if (open.value) {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        activeIndex.value = (activeIndex.value + 1) % suggestions.value.length
        return
      case 'ArrowUp':
        event.preventDefault()
        activeIndex.value = (activeIndex.value - 1 + suggestions.value.length) % suggestions.value.length
        return
      case 'Enter':
      case 'Tab':
        event.preventDefault()
        accept(suggestions.value[activeIndex.value]!)
        return
      case 'Escape':
        event.preventDefault()
        closeSuggestions()
        return
    }
  }

  if (event.key === 'Tab') {
    tabComplete(event)
    return
  }

  if (event.key === 'Enter') {
    sendWithHistory()
    return
  }

  if (event.key === 'ArrowUp') {
    const caret = getCaret().start
    if (caret !== 0) {
      event.preventDefault()
      setCaret(0, 0)
      return
    }
    const hist = getHistory()
    if (!hist.length)
      return
    event.preventDefault()
    if (historyIndex.value === -1)
      historyDraft.value = inputMessage.value
    historyIndex.value = Math.min(historyIndex.value + 1, hist.length - 1)
    inputMessage.value = hist[hist.length - 1 - historyIndex.value]!
    return
  }

  if (event.key === 'ArrowDown') {
    const len = inputMessage.value.length
    const caret = getCaret().start
    if (caret !== len) {
      event.preventDefault()
      setCaret(len, len)
      return
    }
    if (historyIndex.value === -1)
      return
    event.preventDefault()
    historyIndex.value--
    const hist = getHistory()
    inputMessage.value = historyIndex.value === -1
      ? historyDraft.value
      : hist[hist.length - 1 - historyIndex.value]!
  }
}

function userStyle(name: string) {
  if (settings.value.chat_colored_nicks)
    return { color: nickColor(name) }
  return undefined
}

// Swap composer state per buffer: stash the outgoing draft, restore the
// incoming one, and reset history navigation. Also closes the popup so stale
// entries never linger.
watch(activeName, (newName, oldName) => {
  if (oldName !== undefined)
    saveDraft(oldName, inputMessage.value)
  inputMessage.value = drafts.get(bufKey(newName)) ?? ''

  clearTypingTimers()
  closeSuggestions()
  historyIndex.value = -1
  historyDraft.value = ''
})
watch(activeName, clearReply)
</script>

<template>
  <Flex class="chat-composer" column expand :gap="0">
    <ChatTypingIndicator />
    <Flex expand :gap="0">
      <Flex
        class="chat-composer__field"
        :class="{ 'chat-composer__field--dragover': dragging }"
        expand
        column
        :gap="0"
        @dragover="onDragOver"
        @dragleave="onDragLeave"
        @drop="onDrop"
      >
        <input
          ref="fileInput"
          type="file"
          multiple
          hidden
          @change="onFilesPicked"
        >
        <div v-if="dragging" class="chat-composer__dropzone">
          <Icon name="ph:upload-simple" size="20" />
          <span>Drop files to attach</span>
        </div>
        <ul v-if="open" class="chat-composer__suggestions">
          <li v-for="(item, index) in suggestions" :key="item.value">
            <button
              type="button"
              class="chat-composer__suggestion"
              :class="{ 'chat-composer__suggestion--active': index === activeIndex }"
              @mousedown.prevent="accept(item)"
              @mouseenter="activeIndex = index"
            >
              <Icon :name="triggerIcon" size="13" class="chat-composer__suggestion-icon" />
              <span class="chat-composer__suggestion-label" :style="item.colored ? userStyle(item.value) : undefined">{{ item.label }}</span>
              <span v-if="item.hint" class="chat-composer__suggestion-hint">{{ item.hint }}</span>
            </button>
          </li>
        </ul>
        <!-- Selection formatting toolbar (desktop). mousedown.prevent keeps the
             input focused and the text selection intact while a button runs. -->
        <div v-if="showFormatToolbar" class="chat-composer__format" @mousedown.prevent>
          <ButtonGroup :gap="2">
            <Button plain square size="s" aria-label="Bold" @click="formatBold">
              <Icon name="ph:text-b" size="15" />
            </Button>
            <Button plain square size="s" aria-label="Italic" @click="formatItalic">
              <Icon name="ph:text-italic" size="15" />
            </Button>
            <Button plain square size="s" aria-label="Underline" @click="formatUnderline">
              <Icon name="ph:text-underline" size="15" />
            </Button>
            <Button plain square size="s" aria-label="Strikethrough" @click="formatStrike">
              <Icon name="ph:text-strikethrough" size="15" />
            </Button>
            <Button plain square size="s" aria-label="Monospace" @click="formatMono">
              <Icon name="ph:code" size="15" />
            </Button>
          </ButtonGroup>
          <ButtonGroup :gap="2">
            <Button
              ref="colorButtonRef"
              plain
              square
              size="s"
              aria-label="Color"
              :class="{ 'is-active': colorPickerOpen }"
              @click="colorPickerOpen = !colorPickerOpen"
            >
              <Icon name="ph:palette" size="15" />
            </Button>
          </ButtonGroup>
          <Popout
            :anchor="colorButtonRef"
            :visible="colorPickerOpen"
            placement="top"
            :offset="6"
            @click-outside="colorPickerOpen = false"
          >
            <div class="chat-composer__color-grid" @mousedown.prevent>
              <button
                v-for="c in MIRC_PALETTE"
                :key="c.code"
                type="button"
                class="chat-composer__swatch"
                :style="{ backgroundColor: c.hex }"
                :aria-label="`Color ${c.code}`"
                @click="applyColor(c.code)"
              />
            </div>
          </Popout>
        </div>
        <Flex v-if="replyTarget" y-center gap="xs" class="chat-composer__reply" expand>
          <Icon name="ph:arrow-bend-down-right" size="13" class="chat-composer__reply-icon" />
          <span class="chat-composer__reply-label">
            <template v-if="replyTarget.from">
              <span v-if="relaySeparator && replyTarget.from.includes(relaySeparator)" class="chat-composer__reply-relay-icon">
                <RelaySourceIcon :bridge="replyTarget.from.slice(replyTarget.from.indexOf(relaySeparator) + relaySeparator.length)" :size="11" />
              </span>
              <span class="chat-composer__reply-nick">{{ (isModernMode || !settings.chat_irc_pure_relay_nicks) && relaySeparator && replyTarget.from.includes(relaySeparator) ? replyTarget.from.slice(0, replyTarget.from.indexOf(relaySeparator)) : replyTarget.from }}</span>
            </template>
            <span class="chat-composer__reply-text">{{ replyTarget.text }}</span>
          </span>
          <Button plain square size="s" class="chat-composer__reply-dismiss" @click="clearReply">
            <Icon name="ph:x" size="13" />
          </Button>
        </Flex>
        <ChatComposerAttachments
          v-if="attachments.length"
          :attachments="attachments"
          @remove="removeAttachment"
        />
        <Flex :gap="0" class="chat-composer__input-row" expand>
          <Button
            plain
            square
            :disabled="!canChat || attachmentsUploading"
            class="chat-composer__attach"
            aria-label="Attach files"
            @click="openFilePicker"
          >
            <Icon name="ph:paperclip" size="16" />
          </Button>
          <ChatComposerInput
            ref="inputComp"
            v-model="inputMessage"
            :disabled="!canChat"
            :placeholder="placeholder"
            :strip-markers="isModernMode"
            :enter-newline="isMobile"
            class="chat-composer__input"
            @input="onInput"
            @keydown="onKeydown"
            @keyup="syncSelection"
            @mouseup="syncSelection"
            @focusout="onFocusOut"
            @paste-files="addAttachments"
          />
          <Button plain square :disabled="disabled" class="chat-composer__send" @click="sendWithHistory">
            <Icon name="ph:paper-plane-tilt" size="16" />
          </Button>
        </Flex>
      </Flex>
    </Flex>

    <Modal :open="!!whoisModalNick" size="s" @close="whoisModalNick = null">
      <template #header>
        <h4>{{ whoisModalNick }}</h4>
      </template>
      <Flex column :gap="0">
        <UserPreviewCard v-if="whoisModalUserId" :user-id="whoisModalUserId" class="chat-composer__pm-preview" />
        <IrcWhoisCard v-if="whoisModalData" :whois="whoisModalData" :standalone="!whoisModalUserId" :irc-only="!whoisModalUserId" />
        <Flex v-else-if="whoisModalNick" y-center gap="xs" class="text-s text-color-lighter chat-composer__whois-loading">
          <Spinner size="s" />
          <span>Fetching WHOIS...</span>
        </Flex>
      </Flex>
    </Modal>
  </Flex>
</template>

<style lang="scss" scoped>
.chat-composer {
  // On phones the composer sits flush to the bottom of the viewport, so add the
  // home-indicator inset (plus a little breathing room) below the input so the
  // bezel doesn't clip it.
  @media (max-width: #{$breakpoint-s}) {
    padding-bottom: calc(var(--space-xs) + env(safe-area-inset-bottom, 0px));

    .chat-composer__input {
      border-left: 1px solid var(--color-border);
      border-bottom: 1px solid var(--color-border);
    }
  }

  &__whois-loading {
    padding: var(--space-s) 0;
  }

  &__input-row {
    position: relative;
  }

  // Send button lives inside the field, pinned to the top-right. On a single
  // line it sits centered (button height == field height); as the field grows
  // with newlines it stays anchored at the top so the field grows downward.
  &__send {
    position: absolute;
    right: 0;
    top: 0;
    z-index: 1;
  }

  // Attach button mirrors the send button on the top-left.
  &__attach {
    position: absolute;
    left: 0;
    top: 0;
    z-index: 1;
    color: var(--color-text-light);

    &:hover:not(:disabled) {
      color: var(--color-text);
    }
  }

  &__field {
    position: relative;
    flex: 1;
    min-width: 0;

    &--dragover {
      outline: 2px dashed var(--color-accent);
      outline-offset: -2px;
      border-radius: var(--border-radius-s);
    }
  }

  &__dropzone {
    position: absolute;
    inset: 0;
    z-index: var(--z-popout);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-xxs);
    border-radius: var(--border-radius-s);
    background: color-mix(in srgb, var(--color-bg) 85%, transparent);
    color: var(--color-text-light);
    font-size: var(--font-size-s);
    pointer-events: none;
  }

  &__format {
    position: absolute;
    bottom: calc(100% + var(--space-xxs));
    left: 0;
    z-index: var(--z-popout);
    display: flex;
    gap: var(--space-xxs);
    padding: var(--space-xxxs);
    background: var(--color-bg-raised);
    border: 1px solid var(--color-border);
    border-radius: var(--border-radius-m);
    box-shadow: var(--box-shadow);

    :deep(.vui-button.is-active) {
      background: var(--color-bg-medium);
    }
  }

  &__input {
    // Reserve space on each side so text clears the overlaid attach/send buttons.
    --composer-input-pad-left: calc(var(--interactive-el-height) + var(--space-xxs));
    --composer-input-pad-right: calc(var(--interactive-el-height) + var(--space-xxs));
    border: 1px solid var(--color-border);
    // Desktop sits flush in the chat panel, so drop the left and bottom borders.
    // Mobile restores them below (it's not flush against a panel edge).
    border-left: none;
    border-bottom: none;
    background: var(--color-bg);
    max-height: 160px;
    overflow-y: auto;
    transition: border-color var(--transition);

    &:focus {
      border-color: var(--color-accent);
    }
  }

  &__reply {
    padding: var(--space-xxxs) var(--space-xs);
    background: var(--color-bg-medium);
    border: 1px solid var(--color-border);
    border-bottom: none;
    border-radius: var(--border-radius-s) var(--border-radius-s) 0 0;
    font-size: calc(var(--chat-font-size, var(--font-size-s)) * 0.85);
    color: var(--color-text-light);

    span,
    strong,
    p {
      font-size: calc(var(--chat-font-size, var(--font-size-s)) * 0.85);
    }
  }

  &__reply-icon {
    flex-shrink: 0;
    color: var(--color-text-lighter);
  }

  &__reply-label {
    display: flex;
    flex: 1;
    min-width: 0;
    align-items: center;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  &__reply-relay-icon {
    margin-right: var(--space-xxs);

    :deep(.iconify) {
      color: var(--color-text) !important;
      font-size: 1em !important;
    }
  }

  &__reply-nick {
    font-weight: 600;
    margin-right: var(--space-xxs);
  }

  &__reply-dismiss {
    flex-shrink: 0;
    color: var(--color-text-lighter);

    &:hover {
      color: var(--color-text);
    }
  }

  &__suggestions {
    position: absolute;
    bottom: calc(100% + var(--space-xxs));
    left: 0;
    right: 0;
    z-index: var(--z-popout);
    margin: 0;
    padding: var(--space-xxs);
    list-style: none;
    max-height: 240px;
    overflow-y: auto;
    background: var(--color-bg-raised);
    border: 1px solid var(--color-border);
    border-radius: var(--border-radius-m);
    box-shadow: var(--box-shadow);
  }

  &__suggestion {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    width: 100%;
    padding: var(--space-xxs) var(--space-xs);
    border: none;
    background: transparent;
    border-radius: var(--border-radius-s);
    font-size: var(--font-size-s);
    color: var(--color-text);
    cursor: pointer;
    text-align: left;

    &--active {
      background: var(--color-bg-medium);
    }
  }

  &__suggestion-icon {
    flex-shrink: 0;
    color: var(--color-text-lighter);
  }

  &__suggestion-label {
    flex-shrink: 0;
  }

  &__suggestion-hint {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--color-text-lighter);
    font-size: var(--font-size-xs);
  }
}
</style>

<!-- The color picker renders inside a VUI Popout, which teleports to <body>,
     so its styles cannot be scoped. -->
<style lang="scss">
.chat-composer__color-grid {
  display: grid;
  grid-template-columns: repeat(8, 16px);
  gap: 4px;
  padding: 4px;
}

.chat-composer__swatch {
  width: 16px;
  height: 16px;
  padding: 0;
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius-s);
  cursor: pointer;
  transition: transform var(--transition-fast);

  &:hover {
    transform: scale(1.15);
  }
}
</style>
