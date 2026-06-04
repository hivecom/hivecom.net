<script setup lang="ts">
import { Button, Flex, Input } from '@dolanske/vui'
import { useDataUserSettings } from '@/composables/useDataUserSettings'
import { nickColor, useIrcChat } from '@/composables/useIrcChat'

const { inputMessage, activeName, activeBuffer, canChat, users, nick, sendMessage } = useIrcChat()
const { settings } = useDataUserSettings()

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
  { name: 'join', usage: '/join #channel', hint: 'Join a channel' },
  { name: 'part', usage: '/part [#channel]', hint: 'Leave the current or named channel' },
  { name: 'query', usage: '/query <nick>', hint: 'Open a private message' },
  { name: 'me', usage: '/me <action>', hint: 'Send an action message' },
  { name: 'nick', usage: '/nick <name>', hint: 'Change your nickname' },
]

interface Suggestion {
  value: string
  label: string
  hint?: string
  colored: boolean
}

type TriggerMode = 'mention' | 'command'

const inputComp = ref<InstanceType<typeof Input>>()
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
  if (mode.value === 'command') {
    return COMMANDS
      .filter(c => c.name.startsWith(q))
      .slice(0, MAX_SUGGESTIONS)
      .map(c => ({ value: c.name, label: c.usage, hint: c.hint, colored: false }))
  }
  return []
})

const open = computed(() => mode.value !== null && suggestions.value.length > 0)

const triggerIcon = computed(() => (mode.value === 'command' ? 'ph:terminal-window' : 'ph:at'))

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

  // `@mention` is valid at the start or after whitespace, with no inner spaces.
  let i = caret - 1
  while (i >= 0 && !/\s/.test(value[i]!)) {
    if (value[i] === '@') {
      const before = value[i - 1]
      if (i === 0 || (before && /\s/.test(before))) {
        mode.value = 'mention'
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
  else {
    // Address the user with a colon when the mention is the whole message.
    const isStandalone = before.trim() === '' && after.trim() === ''
    insert = isStandalone ? `${item.value}: ` : `${item.value} `
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

function onKeydown(event: KeyboardEvent) {
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

  if (event.key === 'Enter')
    sendMessage()
}

function userStyle(name: string) {
  if (settings.value.chat_colored_nicks)
    return { color: nickColor(name) }
  return undefined
}

// Close the popup when switching buffers so stale entries never linger.
watch(activeName, closeSuggestions)
</script>

<template>
  <Flex gap="s" expand y-stretch class="chat-composer">
    <div class="chat-composer__field">
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
      <Input
        ref="inputComp"
        v-model="inputMessage"
        expand
        class="chat-composer__input"
        :disabled="!canChat"
        :placeholder="placeholder"
        @input="onInput"
        @keydown="onKeydown"
        @focusout="closeSuggestions"
      />
    </div>
    <Button variant="accent" :disabled="disabled" @click="sendMessage">
      Send
    </Button>
  </Flex>
</template>

<style lang="scss" scoped>
.chat-composer {
  &__field {
    position: relative;
    flex: 1;
    min-width: 0;
  }

  &__input {
    width: 100%;
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
