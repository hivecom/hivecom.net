<script setup lang="ts">
import { Button, Flex, Input, Modal, Spinner } from '@dolanske/vui'
import { computed, onMounted, ref, watch, watchEffect } from 'vue'
import ChatInfoModal from '@/components/Chat/ChannelInfoModal.vue'
import IrcWhoisCard from '@/components/Chat/IrcWhoisCard.vue'
import ChatTypingIndicator from '@/components/Chat/TypingIndicator.vue'
import UserListModal from '@/components/Chat/UserListModal.vue'
import UserPreviewCard from '@/components/Shared/UserPreviewCard.vue'
import { useDataUserSettings } from '@/composables/useDataUserSettings'
import { nickColor, useIrcChat, whoisStore } from '@/composables/useIrcChat'
import { useIrcNickResolver } from '@/composables/useIrcNickResolver'
import { useBreakpoint } from '@/lib/mediaQuery'

const props = defineProps<{
  compact?: boolean
}>()

const { inputMessage, activeName, activeBuffer, canChat, users, buffers, nick, sendMessage, replyTarget, clearReply, sendTyping, requestWhois, markBufferRead, channelList, listChannels, channelListLoading, registerComposerFocus } = useIrcChat()
const { settings } = useDataUserSettings()
const { resolved: resolvedNicks, resolve: resolveNick } = useIrcNickResolver()
const isMobile = useBreakpoint('<s')
const isModernMode = computed(() => isMobile.value || settings.value.chat_display_mode === 'modern')

const inputComp = ref<InstanceType<typeof Input>>()

onMounted(() => {
  registerComposerFocus(() => nativeInput()?.focus())
  watchEffect(() => {
    const container = inputComp.value?.$el as HTMLElement | undefined
    if (!container)
      return
    container.style.setProperty('--irc-input-size', 'var(--chat-font-size, var(--font-size-s))')
    if (isModernMode.value)
      container.style.removeProperty('--irc-input-font')
    else
      container.style.setProperty('--irc-input-font', 'monospace')
  })
})

watch(activeBuffer, (buf) => {
  if (buf?.kind === 'pm')
    resolveNick([buf.name.toLowerCase()])
}, { immediate: true })

const infoOpen = ref(false)
const usersOpen = ref(false)

// /whois modal - independent of the active PM buffer
const whoisModalNick = ref<string | null>(null)
const whoisModalData = computed(() =>
  whoisModalNick.value ? (whoisStore.value.get(whoisModalNick.value.toLowerCase()) ?? null) : null,
)
const whoisModalUserId = computed(() =>
  whoisModalNick.value ? (resolvedNicks.value.get(whoisModalNick.value.toLowerCase())?.id ?? null) : null,
)

function openPmInfo() {
  if (activeBuffer.value?.kind === 'pm')
    requestWhois(activeBuffer.value.name)
  infoOpen.value = true
}

const placeholder = computed(() => {
  if (!canChat.value)
    return 'Join a channel to chat...'
  if (activeBuffer.value?.kind === 'server')
    return 'Type a /command (e.g. /join #channel)...'
  return `Message ${activeName.value}...`
})

const disabled = computed(() => !canChat.value || !inputMessage.value.trim())

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

function nativeInput(): HTMLInputElement | null {
  return (inputComp.value?.$el as HTMLElement | undefined)?.querySelector('input') ?? null
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

function onInput(event: Event) {
  const el = event.target as HTMLInputElement
  detectTrigger(el.value, el.selectionStart ?? el.value.length)
}

function accept(item: Suggestion) {
  if (triggerStart.value < 0)
    return
  const el = nativeInput()
  const caret = el?.selectionStart ?? inputMessage.value.length
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
  nextTick(() => {
    const input = nativeInput()
    if (input) {
      input.focus()
      input.setSelectionRange(nextCaret, nextCaret)
    }
  })
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
  const el = nativeInput()
  const value = inputMessage.value
  const caret = el?.selectionStart ?? value.length

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
  nextTick(() => {
    const input = nativeInput()
    if (input) {
      input.focus()
      input.setSelectionRange(nextCaret, nextCaret)
    }
  })
}

// --- command history (up/down navigation) ----------------------------------

const messageHistory = ref<string[]>([])
const historyIndex = ref(-1)
const draftBuffer = ref('')

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
  if (msg && msg !== messageHistory.value[messageHistory.value.length - 1])
    messageHistory.value.push(msg)
  historyIndex.value = -1
  draftBuffer.value = ''
}

function sendWithHistory() {
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
    const el = nativeInput()
    const caret = el?.selectionStart ?? 0
    if (caret !== 0) {
      event.preventDefault()
      el?.setSelectionRange(0, 0)
      return
    }
    const hist = messageHistory.value
    if (!hist.length)
      return
    event.preventDefault()
    if (historyIndex.value === -1)
      draftBuffer.value = inputMessage.value
    historyIndex.value = Math.min(historyIndex.value + 1, hist.length - 1)
    inputMessage.value = hist[hist.length - 1 - historyIndex.value]!
    return
  }

  if (event.key === 'ArrowDown') {
    const el = nativeInput()
    const caret = el?.selectionStart ?? inputMessage.value.length
    if (caret !== inputMessage.value.length) {
      event.preventDefault()
      el?.setSelectionRange(inputMessage.value.length, inputMessage.value.length)
      return
    }
    if (historyIndex.value === -1)
      return
    event.preventDefault()
    historyIndex.value--
    inputMessage.value = historyIndex.value === -1
      ? draftBuffer.value
      : messageHistory.value[messageHistory.value.length - 1 - historyIndex.value]!
  }
}

function userStyle(name: string) {
  if (settings.value.chat_colored_nicks)
    return { color: nickColor(name) }
  return undefined
}

// Close the popup when switching buffers so stale entries never linger.
watch(activeName, () => {
  clearTypingTimers()
  closeSuggestions()
  historyIndex.value = -1
  draftBuffer.value = ''
})
watch(activeName, clearReply)
</script>

<template>
  <Flex class="chat-composer" column expand :gap="0">
    <ChatTypingIndicator />
    <Flex expand :gap="0">
      <Flex v-if="props.compact" :gap="0" class="chat-composer__compact-actions">
        <Button square aria-label="Channel info" class="chat-composer__compact-btn" @click="activeBuffer?.kind === 'pm' ? openPmInfo() : (infoOpen = true)">
          <Icon name="ph:info" size="16" />
        </Button>
        <Button v-if="activeBuffer?.kind === 'channel'" square aria-label="Users" class="chat-composer__compact-btn" @click="usersOpen = true">
          <Icon name="ph:users" size="16" />
        </Button>
      </Flex>
      <Flex class="chat-composer__field" expand column :gap="0">
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
        <Flex v-if="replyTarget" y-center gap="xs" class="chat-composer__reply" expand>
          <Icon name="ph:arrow-bend-down-right" size="13" class="chat-composer__reply-icon" />
          <span class="chat-composer__reply-label">
            <span v-if="replyTarget.from" class="chat-composer__reply-nick text-s">{{ replyTarget.from }}</span>
            <span class="chat-composer__reply-text text-s">{{ replyTarget.text }}</span>
          </span>
          <Button plain square size="s" class="chat-composer__reply-dismiss" @click="clearReply">
            <Icon name="ph:x" size="13" />
          </Button>
        </Flex>
        <Flex :gap="0" y-stretch class="chat-composer__input-row" expand>
          <Input
            ref="inputComp"
            v-model="inputMessage"
            expand
            :disabled="!canChat"
            :placeholder="placeholder"
            class="text-s chat-composer__input"
            @input="onInput"
            @keydown="onKeydown"
            @focusout="closeSuggestions"
          />
          <Button square :disabled="disabled" class="chat-composer__send" @click="sendWithHistory">
            <Icon name="ph:paper-plane-tilt" size="16" />
          </Button>
        </Flex>
      </Flex>
    </Flex>

    <UserListModal v-if="props.compact" :open="usersOpen" @close="usersOpen = false" />

    <ChatInfoModal v-if="props.compact" :open="infoOpen" @close="infoOpen = false" />

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
@use '@/assets/breakpoints.scss' as *;

.chat-composer {
  &__compact-actions {
    align-self: stretch;
    border-right: 1px solid var(--color-border);
  }

  &__compact-btn {
    flex: 1;
    width: var(--interactive-el-height);
    border-radius: 0;
  }

  &__whois-loading {
    padding: var(--space-s) 0;
  }

  &__input-row {
    :deep(.vui-input) {
      border-radius: var(--border-radius-s) 0 0 var(--border-radius-s);
    }
  }

  &__send {
    border-left: none;
    border-radius: 0 var(--border-radius-s) var(--border-radius-s) 0;
  }

  &__field {
    position: relative;
    flex: 1;
    min-width: 0;
  }

  &__input {
    :deep(.vui-input-style) {
      border-left: 0px;
      border-radius: 0;
    }
  }

  @media (max-width: #{$breakpoint-s - 1}) {
    &__input {
      height: 64px;
    }
  }

  &__reply {
    padding: var(--space-xxxs) var(--space-xs);
    background: var(--color-bg-medium);
    border: 1px solid var(--color-border);
    border-bottom: none;
    border-radius: var(--border-radius-s) var(--border-radius-s) 0 0;
    font-size: var(--font-size-xs);
    color: var(--color-text-light);
  }

  &__reply-icon {
    flex-shrink: 0;
    color: var(--color-text-lighter);
  }

  &__reply-label {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
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

<style lang="scss">
.chat-composer__input input,
.chat-composer__input ::placeholder {
  font-family: var(--irc-input-font, var(--font)) !important;
  font-size: var(--irc-input-size, inherit) !important;
}
</style>
