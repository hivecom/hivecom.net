<script setup lang="ts">
import type { ChatMessage } from '@/composables/useIrcChat'
import { ContextMenu, DropdownItem, Flex, pushToast } from '@dolanske/vui'
import dayjs from 'dayjs'
import LinkEmbed from '@/components/LinkEmbed/index.vue'
import AvatarMedia from '@/components/Shared/AvatarMedia.vue'
import UserAvatar from '@/components/Shared/UserAvatar.vue'
import { parseInternalUrl } from '@/composables/useDataLinkPreview'
import { useDataUserSettings } from '@/composables/useDataUserSettings'
import { useExternalLinkGuard } from '@/composables/useExternalLinkGuard'
import { mentionsSelf, nickColor, useIrcChat } from '@/composables/useIrcChat'
import { useIrcNickResolver } from '@/composables/useIrcNickResolver'

const props = defineProps<{ compact?: boolean }>()

const { messages, nick, inputMessage, clearMessages } = useIrcChat()
const { settings } = useDataUserSettings()
const { handleContentClick } = useExternalLinkGuard()

const logEl = ref<HTMLElement | null>(null)
const activeMessage = ref<ChatMessage | null>(null)

const URL_RE = /(https?:\/\/\S+)/g
const IMAGE_RE = /\.(?:png|jpe?g|gif|webp|avif|svg)(?:\?\S*)?$/i

const showTimestamps = computed(() => !props.compact && settings.value.chat_show_timestamps)

// --- Modern mode -------------------------------------------------------
interface MessageGroup {
  id: number
  from: string | null
  nickLower: string | null
  messages: [ChatMessage, ...ChatMessage[]]
  isSystem: boolean
  isOwnGroup: boolean
}

const { resolved, resolve } = useIrcNickResolver()

const groupedMessages = computed((): MessageGroup[] => {
  if (settings.value.chat_display_mode !== 'modern')
    return []
  const groups: MessageGroup[] = []
  for (const msg of messages.value) {
    const isSystemMsg = msg.type !== 'chat'
    if (isSystemMsg) {
      groups.push({
        id: msg.id,
        from: msg.from ?? null,
        nickLower: null,
        messages: [msg],
        isSystem: true,
        isOwnGroup: false,
      })
      continue
    }
    const last = groups[groups.length - 1]
    if (last && !last.isSystem && last.from === msg.from) {
      last.messages.push(msg)
    }
    else {
      groups.push({
        id: msg.id,
        from: msg.from ?? null,
        nickLower: msg.from?.toLowerCase() ?? null,
        messages: [msg],
        isSystem: false,
        isOwnGroup: isOwn(msg),
      })
    }
  }
  return groups
})

watch(groupedMessages, (groups) => {
  const nicks = [...new Set(groups.filter(g => !g.isSystem && g.nickLower).map(g => g.nickLower!))]
  if (nicks.length)
    resolve(nicks)
})

function resolvedUser(nickLower: string | null) {
  if (!nickLower)
    return null
  return resolved.value.get(nickLower) ?? null
}

function groupNickStyle(from: string | null) {
  if (from && settings.value.chat_colored_nicks && from !== nick.value)
    return { color: nickColor(cleanNick(from)) }
  return undefined
}

function fmtTime(d: Date): string {
  return dayjs(d).format(settings.value.chat_timestamp_format || 'HH:mm:ss')
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

function isMention(msg: ChatMessage) {
  return msg.type === 'chat' && msg.from != null && msg.from !== nick.value && mentionsSelf(msg.text)
}

function cleanNick(name: string) {
  return name.replace(/^\*\s*/, '')
}

function nickStyle(msg: ChatMessage) {
  if (msg.type === 'chat' && msg.from && settings.value.chat_colored_nicks && msg.from !== nick.value)
    return { color: nickColor(cleanNick(msg.from)) }
  return undefined
}

// mIRC 99-color palette. Color 99 = transparent/default (omitted intentionally).
const MIRC_COLORS: Record<number, string> = {
  0: '#FFFFFF',
  1: '#000000',
  2: '#00007F',
  3: '#009300',
  4: '#FF0000',
  5: '#7F0000',
  6: '#9C009C',
  7: '#FC7F00',
  8: '#FFFF00',
  9: '#00FC00',
  10: '#009393',
  11: '#00FFFF',
  12: '#0000FC',
  13: '#FF00FF',
  14: '#7F7F7F',
  15: '#D2D2D2',
  16: '#470000',
  17: '#472100',
  18: '#474700',
  19: '#324700',
  20: '#004700',
  21: '#00472C',
  22: '#004747',
  23: '#002747',
  24: '#000047',
  25: '#2E0047',
  26: '#470047',
  27: '#47002A',
  28: '#740000',
  29: '#743A00',
  30: '#747400',
  31: '#517400',
  32: '#007400',
  33: '#007449',
  34: '#007474',
  35: '#004074',
  36: '#000074',
  37: '#4B0074',
  38: '#740074',
  39: '#740045',
  40: '#B50000',
  41: '#B56300',
  42: '#B5B500',
  43: '#7DB500',
  44: '#00B500',
  45: '#00B571',
  46: '#00B5B5',
  47: '#0063B5',
  48: '#0000B5',
  49: '#7500B5',
  50: '#B500B5',
  51: '#B5006B',
  52: '#FF0000',
  53: '#FF8C00',
  54: '#FFFF00',
  55: '#B2FF00',
  56: '#00FF00',
  57: '#00FFA0',
  58: '#00FFFF',
  59: '#008CFF',
  60: '#0000FF',
  61: '#A500FF',
  62: '#FF00FF',
  63: '#FF0098',
  64: '#FF5959',
  65: '#FFB459',
  66: '#FFFF71',
  67: '#CFFF60',
  68: '#6FFF6F',
  69: '#65FFC9',
  70: '#6DFFFF',
  71: '#59B4FF',
  72: '#5959FF',
  73: '#C459FF',
  74: '#FF66FF',
  75: '#FF59BC',
  76: '#FF9C9C',
  77: '#FFD39C',
  78: '#FFFF9C',
  79: '#E2FF9C',
  80: '#9CFF9C',
  81: '#9CFFDB',
  82: '#9CFFFF',
  83: '#9CD3FF',
  84: '#9C9CFF',
  85: '#DC9CFF',
  86: '#FF9CFF',
  87: '#FF94D3',
  88: '#000000',
  89: '#131313',
  90: '#282828',
  91: '#363636',
  92: '#4D4D4D',
  93: '#656565',
  94: '#818181',
  95: '#9F9F9F',
  96: '#BCBCBC',
  97: '#E2E2E2',
  98: '#FFFFFF',
}

function mircColor(n: number): string | undefined {
  return n === 99 ? undefined : MIRC_COLORS[n]
}

interface Segment {
  type: 'text' | 'link'
  value: string
  fg?: string
  bg?: string
  bold?: boolean
  italic?: boolean
  underline?: boolean
}

function segStyle(seg: Segment): Record<string, string> | undefined {
  const style: Record<string, string> = {}
  if (seg.fg)
    style.color = seg.fg
  if (seg.bg)
    style.backgroundColor = seg.bg
  if (seg.bold)
    style.fontWeight = 'bold'
  if (seg.italic)
    style.fontStyle = 'italic'
  if (seg.underline)
    style.textDecoration = 'underline'
  return Object.keys(style).length ? style : undefined
}

function parseIrcFormatting(text: string): Segment[] {
  const out: Segment[] = []
  let i = 0
  let fg: string | undefined
  let bg: string | undefined
  let bold = false
  let italic = false
  let underline = false
  let segStart = 0

  function flush(end: number) {
    if (end > segStart) {
      const seg: Segment = { type: 'text', value: text.slice(segStart, end) }
      if (fg !== undefined)
        seg.fg = fg
      if (bg !== undefined)
        seg.bg = bg
      if (bold)
        seg.bold = true
      if (italic)
        seg.italic = true
      if (underline)
        seg.underline = true
      out.push(seg)
    }
    segStart = i
  }

  while (i < text.length) {
    const code = text.charCodeAt(i)
    if (code === 0x03) {
      flush(i)
      i++
      let fgStr = ''
      if (i < text.length && /\d/.test(text.charAt(i))) {
        fgStr += text.charAt(i++)
        if (i < text.length && /\d/.test(text.charAt(i)))
          fgStr += text.charAt(i++)
      }
      let bgStr = ''
      if (i < text.length && text.charAt(i) === ',') {
        i++
        if (i < text.length && /\d/.test(text.charAt(i))) {
          bgStr += text.charAt(i++)
          if (i < text.length && /\d/.test(text.charAt(i)))
            bgStr += text.charAt(i++)
        }
      }
      if (fgStr === '') {
        fg = undefined
        bg = undefined
      }
      else {
        fg = mircColor(Number.parseInt(fgStr, 10))
        if (bgStr !== '')
          bg = mircColor(Number.parseInt(bgStr, 10))
      }
      segStart = i
    }
    else if (code === 0x02) {
      flush(i)
      bold = !bold
      i++
      segStart = i
    }
    else if (code === 0x1D) {
      flush(i)
      italic = !italic
      i++
      segStart = i
    }
    else if (code === 0x1F) {
      flush(i)
      underline = !underline
      i++
      segStart = i
    }
    else if (code === 0x16) {
      flush(i)
      ;[fg, bg] = [bg, fg]
      i++
      segStart = i
    }
    else if (code === 0x0F) {
      flush(i)
      fg = undefined
      bg = undefined
      bold = false
      italic = false
      underline = false
      i++
      segStart = i
    }
    else {
      i++
    }
  }
  flush(i)
  return out
}

function segments(text: string): Segment[] {
  const out: Segment[] = []
  for (const seg of parseIrcFormatting(text)) {
    // Split each plain-text segment further by URLs
    const { value, type: _type, ...style } = seg
    let last = 0
    for (const match of value.matchAll(new RegExp(URL_RE.source, 'g'))) {
      const idx = match.index ?? 0
      if (idx > last)
        out.push({ type: 'text', value: value.slice(last, idx), ...style })
      out.push({ type: 'link', value: match[0], ...style })
      last = idx + match[0].length
    }
    if (last < value.length)
      out.push({ type: 'text', value: value.slice(last), ...style })
  }
  return out
}

function imageUrls(text: string): string[] {
  if (!settings.value.chat_show_inline_embeds)
    return []
  return (text.match(URL_RE) ?? []).filter(u => IMAGE_RE.test(u))
}

function previewUrls(text: string): string[] {
  if (!settings.value.chat_show_inline_embeds)
    return []
  const urls = text.match(URL_RE) ?? []
  const seen = new Set<string>()
  const out: string[] = []
  for (const u of urls) {
    if (IMAGE_RE.test(u))
      continue
    if (seen.has(u))
      continue
    if (parseInternalUrl(u) !== null) {
      seen.add(u)
      out.push(u)
    }
  }
  return out
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
  const clean = cleanNick(name)
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
    <div ref="logEl" class="chat-log__scroll" @contextmenu="onContextMenu" @click="handleContentClick">
      <template v-if="settings.chat_display_mode !== 'modern'">
        <Flex
          v-for="msg in messages"
          :key="msg.id"
          wrap
          gap="xs"
          class="chat-log__msg"
          :class="[msgClass(msg), {
            'chat-log__msg--own': isOwn(msg),
            'chat-log__msg--mention': isMention(msg),
            'chat-log__msg--backlog': msg.backlog,
          }]"
          :data-msg-id="msg.id"
        >
          <span v-if="showTimestamps" class="chat-log__ts">{{ fmtTime(msg.ts) }}</span>
          <span v-if="msg.from" class="chat-log__nick" :style="nickStyle(msg)">{{ msg.from }}</span>
          <span class="chat-log__text">
            <template v-for="(seg, i) in segments(msg.text)" :key="i">
              <a
                v-if="seg.type === 'link'"
                :href="seg.value"
                target="_blank"
                rel="noopener noreferrer"
                class="chat-log__link"
                :style="segStyle(seg)"
              >{{ seg.value }}</a>
              <span
                v-else-if="seg.fg || seg.bg || seg.bold || seg.italic || seg.underline"
                :style="segStyle(seg)"
              >{{ seg.value }}</span>
              <template v-else>{{ seg.value }}</template>
            </template>
          </span>
          <Flex v-if="imageUrls(msg.text).length" wrap gap="xs" class="chat-log__embeds">
            <a
              v-for="url in imageUrls(msg.text)"
              :key="url"
              :href="url"
              target="_blank"
              rel="noopener noreferrer"
              class="chat-log__embed"
            >
              <img :src="url" alt="" loading="lazy">
            </a>
          </Flex>
          <template v-if="previewUrls(msg.text).length">
            <LinkEmbed
              v-for="url in previewUrls(msg.text)"
              :key="url"
              :url="url"
              class="chat-log__link-preview"
            />
          </template>
        </Flex>
      </template>
      <template v-else>
        <template v-for="group in groupedMessages" :key="group.id">
          <!-- System / event one-liners (join, part, error, etc.) -->
          <Flex
            v-if="group.isSystem"
            wrap
            gap="xs"
            class="chat-log__msg"
            :class="[msgClass(group.messages[0]), { 'chat-log__msg--backlog': group.messages[0].backlog }]"
            :data-msg-id="group.messages[0].id"
          >
            <span v-if="showTimestamps" class="chat-log__ts">{{ fmtTime(group.messages[0].ts) }}</span>
            <span v-if="group.messages[0].from" class="chat-log__nick">{{ group.messages[0].from }}</span>
            <span class="chat-log__text">
              <template v-for="(seg, i) in segments(group.messages[0].text)" :key="i">
                <a v-if="seg.type === 'link'" :href="seg.value" target="_blank" rel="noopener noreferrer" class="chat-log__link" :style="segStyle(seg)">{{ seg.value }}</a>
                <span v-else-if="seg.fg || seg.bg || seg.bold || seg.italic || seg.underline" :style="segStyle(seg)">{{ seg.value }}</span>
                <template v-else>{{ seg.value }}</template>
              </template>
            </span>
          </Flex>

          <!-- Grouped chat messages (Discord-style) -->
          <div
            v-else
            class="chat-log__group"
            :class="{ 'chat-log__msg--backlog': group.messages[0].backlog }"
          >
            <div class="chat-log__group-avatar">
              <UserAvatar v-if="resolvedUser(group.nickLower)" :user-id="resolvedUser(group.nickLower)!.id" :size="32" show-preview />
              <AvatarMedia v-else :size="32" :alt="group.from ?? ''">
                <template #default>
                  {{ (group.from ?? '?').charAt(0).toUpperCase() }}
                </template>
              </AvatarMedia>
            </div>
            <div class="chat-log__group-body">
              <div class="chat-log__group-header">
                <span class="chat-log__nick" :style="groupNickStyle(group.from)">
                  {{ resolvedUser(group.nickLower)?.username ?? group.from }}
                </span>
                <span v-if="showTimestamps" class="chat-log__ts chat-log__ts--inline">{{ fmtTime(group.messages[0].ts) }}</span>
              </div>
              <div
                v-for="msg in group.messages"
                :key="msg.id"
                class="chat-log__modern-line"
                :class="{ 'chat-log__modern-line--mention': isMention(msg) }"
                :data-msg-id="msg.id"
              >
                <span class="chat-log__text">
                  <template v-for="(seg, i) in segments(msg.text)" :key="i">
                    <a v-if="seg.type === 'link'" :href="seg.value" target="_blank" rel="noopener noreferrer" class="chat-log__link" :style="segStyle(seg)">{{ seg.value }}</a>
                    <span v-else-if="seg.fg || seg.bg || seg.bold || seg.italic || seg.underline" :style="segStyle(seg)">{{ seg.value }}</span>
                    <template v-else>{{ seg.value }}</template>
                  </template>
                </span>
                <Flex v-if="imageUrls(msg.text).length" wrap gap="xs" class="chat-log__embeds">
                  <a v-for="url in imageUrls(msg.text)" :key="url" :href="url" target="_blank" rel="noopener noreferrer" class="chat-log__embed">
                    <img :src="url" alt="" loading="lazy">
                  </a>
                </Flex>
                <template v-if="previewUrls(msg.text).length">
                  <LinkEmbed v-for="url in previewUrls(msg.text)" :key="url" :url="url" class="chat-log__link-preview" />
                </template>
              </div>
            </div>
          </div>
        </template>
      </template>
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
            Mention {{ cleanNick(activeMessage.from) }}
          </DropdownItem>
          <DropdownItem
            v-if="activeMessage.from"
            @click="copyText(cleanNick(activeMessage.from), 'Nickname')"
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
  width: 100%;

  &__scroll {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    background: var(--color-bg-lowered);
    border-radius: var(--border-radius-s);
    border: 1px solid var(--color-border-weak);
    padding: var(--space-s);
    font-family: monospace;
    font-size: var(--chat-font-size, var(--font-size-s));
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
    line-height: 1.4;
    word-break: break-word;
    padding: 1px var(--space-xs);
    border-radius: var(--border-radius-xs);
    transition: background-color var(--transition-fast);

    &:hover {
      background: var(--color-bg-medium);
    }

    &--mention {
      background: var(--color-bg-accent-lowered);
      box-shadow: inset 2px 0 0 var(--color-accent);
    }

    &--backlog {
      opacity: 0.7;
    }
  }

  &__ts {
    color: var(--color-text-lightest);
    flex-shrink: 0;
    user-select: none;
    font-size: inherit;
  }

  &__nick {
    color: var(--color-accent);
    font-weight: var(--font-weight-semibold);
    flex-shrink: 0;
    font-size: inherit;

    &::after {
      content: ':';
      color: var(--color-text-lighter);
    }
  }

  &__text {
    color: var(--color-text);
    flex: 1;
    min-width: 0;
    font-size: inherit;
    white-space: pre-wrap;
  }

  &__link {
    color: var(--color-text-blue);
    text-decoration: underline;
    word-break: break-all;
  }

  &__embeds {
    width: 100%;
    padding-top: var(--space-xxs);
  }

  &__embed {
    display: block;
    max-width: 240px;
    max-height: 180px;
    border-radius: var(--border-radius-s);
    overflow: hidden;
    border: 1px solid var(--color-border-weak);

    img {
      display: block;
      max-width: 100%;
      max-height: 180px;
      object-fit: cover;
    }
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

  &__link-preview {
    width: 100%;
    margin-top: var(--space-xxs);
  }

  &__group {
    display: flex;
    gap: var(--space-s);
    padding: var(--space-xxs) var(--space-xs);
    border-radius: var(--border-radius-s);
    transition: background-color var(--transition-fast);

    &:hover {
      background: var(--color-bg-medium);
    }
  }

  &__group-avatar {
    flex-shrink: 0;
    padding-top: 2px;
  }

  &__group-body {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  &__group-header {
    display: flex;
    align-items: baseline;
    gap: var(--space-xs);
  }

  &__ts--inline {
    font-size: var(--font-size-xs);
    color: var(--color-text-lightest);
  }

  &__modern-line {
    font-size: var(--chat-font-size, var(--font-size-s));
    color: var(--color-text);
    white-space: pre-wrap;
    word-break: break-word;
    line-height: 1.4;

    &--mention {
      background: var(--color-bg-accent-lowered);
      box-shadow: inset 2px 0 0 var(--color-accent);
      padding: 1px var(--space-xs);
      margin: 0 calc(-1 * var(--space-xs));
      border-radius: var(--border-radius-xs);
    }
  }
}
</style>
