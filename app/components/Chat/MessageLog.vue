<script setup lang="ts">
import type { ChatMessage } from '@/composables/useIrcChat'
import { ContextMenu, DropdownItem, Flex, pushToast } from '@dolanske/vui'
import { useIrcChat } from '@/composables/useIrcChat'

const { messages, nick, inputMessage, clearMessages } = useIrcChat()

const logEl = ref<HTMLElement | null>(null)
const activeMessage = ref<ChatMessage | null>(null)

function fmtTime(d: Date) {
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function msgClass(msg: ChatMessage) {
  return {
    error: 'chat-log__msg--error',
    system: 'chat-log__msg--system',
    join: 'chat-log__msg--join',
    part: 'chat-log__msg--part',
    chat: 'chat-log__msg--chat',
  }[msg.type]
}

function isOwn(msg: ChatMessage) {
  return msg.type === 'chat' && msg.from === nick.value
}

function onContextMenu(event: MouseEvent) {
  const el = (event.target as HTMLElement | null)?.closest('[data-msg-id]') as HTMLElement | null
  const id = el?.dataset.msgId
  activeMessage.value = id ? messages.value.find(m => m.id === Number(id)) ?? null : null
}

// The VUI ContextMenu only closes on an outside pointerdown or Escape, so we
// dispatch a synthetic one to dismiss it after an action runs.
function closeMenu() {
  if (import.meta.client)
    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
}

async function copyText(text: string, label: string) {
  try {
    await navigator.clipboard.writeText(text)
    pushToast(`${label} copied`)
  }
  catch {
    pushToast('Could not copy to clipboard')
  }
  closeMenu()
}

function mention(name: string) {
  const clean = name.replace(/^\*\s*/, '')
  const current = inputMessage.value.trim()
  inputMessage.value = current ? `${current} ${clean}: ` : `${clean}: `
  closeMenu()
}

function clear() {
  clearMessages()
  closeMenu()
}

const stop = watch(
  () => messages.value.length,
  () => {
    nextTick(() => {
      if (logEl.value)
        logEl.value.scrollTop = logEl.value.scrollHeight
    })
  },
)

onActivated(() => {
  nextTick(() => {
    if (logEl.value)
      logEl.value.scrollTop = logEl.value.scrollHeight
  })
})

onBeforeUnmount(stop)
</script>

<template>
  <ContextMenu class="chat-log">
    <div ref="logEl" class="chat-log__scroll" @contextmenu="onContextMenu">
      <div
        v-for="msg in messages"
        :key="msg.id"
        class="chat-log__msg"
        :class="[msgClass(msg), { 'chat-log__msg--own': isOwn(msg) }]"
        :data-msg-id="msg.id"
      >
        <span class="chat-log__ts">{{ fmtTime(msg.ts) }}</span>
        <span v-if="msg.from" class="chat-log__nick">{{ msg.from }}</span>
        <span class="chat-log__text">{{ msg.text }}</span>
      </div>
      <Flex v-if="messages.length === 0" y-center x-center class="chat-log__empty" expand>
        No messages yet.
      </Flex>
    </div>

    <template #menu>
      <div class="vui-dropdown chat-log__menu">
        <template v-if="activeMessage">
          <DropdownItem
            v-if="activeMessage.from"
            @click="mention(activeMessage.from)"
          >
            <template #icon>
              <Icon name="ph:at" />
            </template>
            Mention {{ activeMessage.from.replace(/^\*\s*/, '') }}
          </DropdownItem>
          <DropdownItem
            v-if="activeMessage.from"
            @click="copyText(activeMessage.from.replace(/^\*\s*/, ''), 'Nickname')"
          >
            <template #icon>
              <Icon name="ph:user" />
            </template>
            Copy nickname
          </DropdownItem>
          <DropdownItem @click="copyText(activeMessage.text, 'Message')">
            <template #icon>
              <Icon name="ph:copy" />
            </template>
            Copy message
          </DropdownItem>
        </template>
        <DropdownItem @click="clear">
          <template #icon>
            <Icon name="ph:trash" />
          </template>
          Clear log
        </DropdownItem>
      </div>
    </template>
  </ContextMenu>
</template>

<style lang="scss" scoped>
.chat-log {
  display: flex;
  flex: 1;
  min-height: 0;

  &__scroll {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    background: var(--color-bg-lowered);
    border-radius: var(--border-radius-s);
    border: 1px solid var(--color-border-weak);
    padding: var(--space-s);
    font-family: monospace;
    font-size: var(--font-size-s);
    display: flex;
    flex-direction: column;
    gap: 2px;
    scroll-behavior: smooth;
  }

  &__empty {
    color: var(--color-text-lighter);
    font-style: italic;
    flex: 1;
  }

  &__msg {
    display: flex;
    gap: var(--space-xs);
    line-height: 1.4;
    word-break: break-word;
    padding: 1px var(--space-xs);
    border-radius: var(--border-radius-xs);
    transition: background-color var(--transition-fast);

    &:hover {
      background: var(--color-bg-medium);
    }

    &--own {
      background: var(--color-bg-accent-lowered);
    }
  }

  &__ts {
    color: var(--color-text-lightest);
    flex-shrink: 0;
    user-select: none;
  }

  &__nick {
    color: var(--color-accent);
    font-weight: var(--font-weight-semibold);
    flex-shrink: 0;

    &::after {
      content: ':';
    }
  }

  &__text {
    color: var(--color-text);
  }

  &__msg--system &__text {
    color: var(--color-text-lighter);
    font-style: italic;
  }

  &__msg--error &__text {
    color: var(--color-text-red);
  }

  &__msg--join &__text {
    color: var(--color-text-green);
  }

  &__msg--part &__text {
    color: var(--color-text-yellow);
  }
}
</style>
