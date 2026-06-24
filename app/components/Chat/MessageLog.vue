<script setup lang="ts">
import type { MediaItem } from '@/components/Shared/Lightbox.vue'
import type { ChatMessage } from '@/composables/useIrcChat'
import type { Segment } from '@/lib/ircFormat'
import { Badge, Button, ContextMenu, Divider, DropdownItem, Flex, pushToast, Sheet, Skeleton, Spinner } from '@dolanske/vui'
import dayjs from 'dayjs'
import IrcWhoisModal from '@/components/Chat/IrcWhoisModal.vue'
import ChatMessageReactions from '@/components/Chat/MessageReactions.vue'
import RelaySourceIcon from '@/components/Chat/RelaySourceIcon.vue'
import UserActionMenu from '@/components/Chat/UserActionMenu.vue'
import YouTubeEmbed from '@/components/Chat/YouTubeEmbed.vue'
import LinkEmbed from '@/components/LinkEmbed/index.vue'
import ReactionsSelect from '@/components/Reactions/ReactionsSelect.vue'
import AvatarMedia from '@/components/Shared/AvatarMedia.vue'
import ConfirmModal from '@/components/Shared/ConfirmModal.vue'
import JumpToPresent from '@/components/Shared/JumpToPresent.vue'
import Lightbox from '@/components/Shared/Lightbox.vue'
import TimestampDate from '@/components/Shared/TimestampDate.vue'
import UserAvatar from '@/components/Shared/UserAvatar.vue'
import UserPreviewHover from '@/components/Shared/UserPreviewHover.vue'
import { parseInternalUrl } from '@/composables/useDataLinkPreview'
import { useDataUserSettings } from '@/composables/useDataUserSettings'
import { useExternalLinkGuard } from '@/composables/useExternalLinkGuard'
import { mentionsSelf, nickColor, useIrcChat } from '@/composables/useIrcChat'
import { useIrcNickResolver } from '@/composables/useIrcNickResolver'
import { applyMarkdown, parseIrcFormatting, segStyle } from '@/lib/ircFormat'
import { useBreakpoint } from '@/lib/mediaQuery'
import { fullDate } from '@/lib/utils/date'

const props = defineProps<{ compact?: boolean }>()

const { messages: allMessages, nick, users, activeBuffer, setReply, joinChannel, fetchOlderHistory, seekToPresent, fetchNewerFromCache, toggleReaction, canRedact, redactMessage, chatHistorySupported, isChatVisible, userMetaStore, relaySeparator, markBufferRead } = useIrcChat()

function ircMeta(nickLower: string | null | undefined) {
  if (!nickLower)
    return undefined
  return userMetaStore.value.get(nickLower)
}

function ircDisplayName(from: string | null | undefined): string {
  if (!from)
    return ''
  return ircMeta(from.toLowerCase())?.get('display-name') ?? from
}

function ircAvatarUrl(nickLower: string | null | undefined): string | undefined {
  return ircMeta(nickLower)?.get('avatar') || undefined
}
const { settings } = useDataUserSettings()

// Unknown TAGMSG events are kept in the buffer but only rendered when the user
// opts in. Filtering here (not at ingestion) makes the toggle instant and also
// retroactively hides messages already in scrollback.

/** Max nicks spelled out individually before "and N others" in join/part summaries. */
const JOINPART_MAX_NAMES = 3

function fmtNickList(nicks: string[], verb: string): string {
  if (nicks.length <= JOINPART_MAX_NAMES)
    return `${nicks.join(', ')} ${verb}`
  const shown = nicks.slice(0, JOINPART_MAX_NAMES - 1).join(', ')
  const rest = nicks.length - (JOINPART_MAX_NAMES - 1)
  return `${shown} and ${rest} ${rest === 1 ? 'other' : 'others'} ${verb}`
}

/**
 * Collapse consecutive runs of 2+ backlog join/part messages into a single
 * summary line per type (joins and parts are summarised separately so colours
 * and styling are preserved). Single events and live activity are left intact.
 */
function collapseBacklogJoinParts(msgs: ChatMessage[]): ChatMessage[] {
  const out: ChatMessage[] = []
  let i = 0
  while (i < msgs.length) {
    const msg = msgs[i]!
    if (!msg.backlog || (msg.type !== 'join' && msg.type !== 'part')) {
      out.push(msg)
      i++
      continue
    }
    // Collect the full contiguous run of backlog join/part messages.
    const runStart = i
    const joinNicks: string[] = []
    const partNicks: string[] = []
    while (i < msgs.length && msgs[i]!.backlog && (msgs[i]!.type === 'join' || msgs[i]!.type === 'part')) {
      const m = msgs[i]!
      if (m.type === 'join')
        joinNicks.push(m.text.replace(/ joined$/, ''))
      else
        partNicks.push(m.text.replace(/ left$/, ''))
      i++
    }
    const anchor = msgs[runStart]!
    if (i - runStart === 1) {
      // Single message - nothing to collapse.
      out.push(anchor)
    }
    else {
      // Deduplicate nicks within each category (same user reconnecting counts once).
      const joins = [...new Set(joinNicks)]
      const parts = [...new Set(partNicks)]
      if (joins.length)
        out.push({ ...anchor, type: 'join', text: fmtNickList(joins, 'joined') })
      if (parts.length)
        out.push({ ...anchor, type: 'part', text: fmtNickList(parts, 'left') })
    }
  }
  return out
}

// Incremental render: on channel switch expose the last RENDER_CHUNK messages
// immediately, then add another chunk each animation frame until all messages
// are visible. Each frame gives the browser a repaint opportunity, keeping the
// UI responsive while the full history builds up behind the viewport.
const RENDER_CHUNK = 25
const phaseLimit = ref<number | null>(null)
let _phaseRaf: number | null = null

function expandPhase() {
  if (phaseLimit.value === null)
    return
  const total = allMessages.value.length
  const next = phaseLimit.value + RENDER_CHUNK
  if (next >= total) {
    phaseLimit.value = null
  }
  else {
    phaseLimit.value = next
    _phaseRaf = requestAnimationFrame(expandPhase)
  }
}

watch(() => activeBuffer.value?.name, () => {
  if (_phaseRaf !== null) {
    cancelAnimationFrame(_phaseRaf)
    _phaseRaf = null
  }
  phaseLimit.value = RENDER_CHUNK
  _phaseRaf = requestAnimationFrame(expandPhase)
})

const messages = computed((): ChatMessage[] => {
  const raw = settings.value.chat_show_tag_messages
    ? allMessages.value
    : allMessages.value.filter(m => m.type !== 'tagmsg')
  const collapsed = collapseBacklogJoinParts(raw)
  return phaseLimit.value !== null ? collapsed.slice(-phaseLimit.value) : collapsed
})
const { handleContentClick } = useExternalLinkGuard()

const isMobile = useBreakpoint('<s')
const mobileMenuOpen = ref(false)

const logEl = ref<HTMLElement | null>(null)
const topSentinel = ref<HTMLElement | null>(null)
const activeMessage = ref<ChatMessage | null>(null)
const lightboxRef = useTemplateRef('lightboxRef')

const nickColWidth = useLocalStorage(props.compact ? 'chat-irc-nick-col-width-compact' : 'chat-irc-nick-col-width', 160)
const isDragging = ref(false)
let dragStartX = 0
let dragStartWidth = 0

function startDrag(event: MouseEvent) {
  isDragging.value = true
  dragStartX = event.clientX
  dragStartWidth = nickColWidth.value
}

useEventListener('mousemove', (event: MouseEvent) => {
  if (!isDragging.value)
    return
  const delta = event.clientX - dragStartX
  nickColWidth.value = Math.max(60, Math.min(300, dragStartWidth + delta))
})

useEventListener('mouseup', () => {
  isDragging.value = false
})

const SERVICE_NICKS = new Set(['histserv', 'nickserv', 'chanserv'])
const URL_RE = /(https?:\/\/\S+)/g
const IMAGE_RE = /[./](?:png|jpe?g|gif|webp|avif|svg)(?:[?#]\S*)?$/i
const VIDEO_RE = /\.(?:mp4|webm|mov|m4v)(?:\?\S*)?$/i
const YOUTUBE_RE = /^https?:\/\/(?:www\.)?(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/)|youtu\.be\/)([-\w]{11})/i
const MENTION_RE = /@([a-z\d][\w-]{0,31})/gi

const isModernMode = computed(() => (isMobile.value || settings.value.chat_display_mode === 'modern') && activeBuffer.value?.kind !== 'server')
const showTimestamps = computed(() => {
  // The "hide sidebar timestamps" preference only applies to the classic IRC
  // compact layout. Mobile (and modern mode) render the group-header timestamp
  // instead, so the IRC-specific hide must not suppress it there.
  if (!isModernMode.value && props.compact && settings.value.chat_display_mode === 'irc' && settings.value.chat_irc_hide_sidebar_timestamps)
    return false
  return settings.value.chat_show_timestamps
})
const isServerBuffer = computed(() => activeBuffer.value?.kind === 'server')
const isServiceQuery = computed(() => activeBuffer.value?.kind === 'pm' && SERVICE_NICKS.has((activeBuffer.value?.name ?? '').toLowerCase()))

// Show the initial-load spinner only when there's genuinely nothing to show yet.
// If the buffer was seeded from cache it already has messages, so skip the spinner
// and let history settle silently in the background.
const isLoadingInitialHistory = computed(() =>
  chatHistorySupported.value
  && !!activeBuffer.value
  && activeBuffer.value.kind !== 'server'
  && !isServiceQuery.value
  && !activeBuffer.value.historyReady
  && activeBuffer.value.messages.length === 0,
)

// --- Modern mode -------------------------------------------------------
interface MessageGroup {
  id: number
  from: string | null
  nickLower: string | null
  messages: [ChatMessage, ...ChatMessage[]]
  isSystem: boolean
  isOwnGroup: boolean
  isAction: boolean
}

const { resolved, resolve } = useIrcNickResolver()

const groupedMessages = computed((): MessageGroup[] => {
  if (!isModernMode.value)
    return []
  const groups: MessageGroup[] = []
  for (const msg of messages.value) {
    const isSystemMsg = msg.type !== 'chat' && !(isServiceQuery.value && isServiceNick(msg.from))
    const isActionMsg = msg.type === 'chat' && !!msg.action
    if (isSystemMsg || isActionMsg) {
      groups.push({
        id: msg.id,
        from: msg.from ?? null,
        nickLower: isActionMsg ? (msg.from?.toLowerCase() ?? null) : null,
        messages: [msg],
        isSystem: isSystemMsg,
        isOwnGroup: isActionMsg && isOwn(msg),
        isAction: isActionMsg,
      })
      continue
    }
    const last = groups[groups.length - 1]
    if (last && !last.isSystem && !last.isAction && last.from === msg.from) {
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
        isAction: false,
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

// Resolve nicks that appear as @mentions in message text.
watch(messages, (msgs) => {
  const nicks = new Set<string>()
  for (const msg of msgs) {
    if (msg.type !== 'chat')
      continue
    for (const m of msg.text.matchAll(new RegExp(MENTION_RE.source, 'gi'))) {
      if (m[1])
        nicks.add(m[1].toLowerCase())
    }
  }
  if (nicks.size)
    resolve([...nicks])
}, { immediate: true })

function resolvedUser(nickLower: string | null) {
  if (!nickLower)
    return null
  return resolved.value.get(nickLower) ?? null
}

function isNickBot(nickLower: string | null): boolean {
  if (!nickLower)
    return false
  return users.value.some(u => u.name.toLowerCase() === nickLower && u.bot === true)
}

function groupNickStyle(from: string | null) {
  if (from && settings.value.chat_colored_nicks && from !== nick.value)
    return { color: nickColor(cleanNick(from)) }
  return undefined
}

function fmtTime(d: Date): string {
  return dayjs(d).format(settings.value.chat_timestamp_format || 'HH:mm:ss')
}

function fmtDateTime(d: Date): string {
  return `${fullDate(d)} at ${fmtTime(d)}`
}

function isServiceNick(from?: string | null): boolean {
  return from != null && SERVICE_NICKS.has(from.toLowerCase())
}

function msgClass(msg: ChatMessage) {
  return {
    error: 'chat-log__msg--error',
    system: 'chat-log__msg--system',
    join: 'chat-log__msg--join',
    part: 'chat-log__msg--part',
    chat: 'chat-log__msg--chat',
    tagmsg: 'chat-log__msg--system',
  }[msg.type]
}

function isOwn(msg: ChatMessage) {
  return msg.type === 'chat' && msg.from === nick.value
}

function isMention(msg: ChatMessage) {
  return msg.type === 'chat' && msg.from != null && msg.from !== nick.value && mentionsSelf(msg.text)
}

// Read line - marks the boundary between already-seen and new messages.
const readLineFirstMsgId = computed<number | null>(() => {
  const readLineTs = activeBuffer.value?.readLineTs
  if (!readLineTs)
    return null
  return messages.value.find(m => m.ts.getTime() > readLineTs)?.id ?? null
})

const readLineFirstGroupId = computed<number | null>(() => {
  const readLineTs = activeBuffer.value?.readLineTs
  if (!readLineTs)
    return null
  for (const group of groupedMessages.value) {
    if (group.messages.some(m => m.ts.getTime() > readLineTs))
      return group.id
  }
  return null
})

// Clicking the divider catches the buffer up - clears the line and the count.
function markRead() {
  const name = activeBuffer.value?.name
  if (name)
    markBufferRead(name)
}

function cleanNick(name: string) {
  return name.replace(/^\*\s*/, '')
}

/**
 * Returns just the display username for a nick, stripping the relay bridge
 * suffix when in modern mode or impure IRC mode.
 */
function displayNick(from: string | null | undefined): string {
  if (!from)
    return ''
  if (isModernMode.value || !settings.value.chat_irc_pure_relay_nicks) {
    const parts = relayNickParts(from)
    if (parts)
      return parts.user
  }
  return from
}

/**
 * If the nick contains the relaymsg separator, returns { user, bridge }.
 * Otherwise returns null (not a relayed nick).
 */

function relayNickParts(from: string | null | undefined): { user: string, bridge: string } | null {
  if (!from || !relaySeparator.value)
    return null
  const sep = relaySeparator.value
  const idx = from.indexOf(sep)
  if (idx <= 0)
    return null
  return { user: from.slice(0, idx), bridge: from.slice(idx + sep.length) }
}

function nickStyle(msg: ChatMessage) {
  if (msg.type === 'chat' && msg.from && settings.value.chat_colored_nicks && msg.from !== nick.value && !isServiceNick(msg.from))
    return { color: nickColor(cleanNick(msg.from)) }
  return undefined
}

function segments(text: string): Segment[] {
  // Step 1: Parse IRC formatting + markdown, then split by URLs. Markdown styles
  // in both modes; modern strips the markers, classic keeps them (asterisks etc
  // stay visible while the content between them is still styled).
  const base = applyMarkdown(parseIrcFormatting(text), isModernMode.value)
  const afterUrl: Segment[] = []
  for (const seg of base) {
    const { value, type: _type, ...style } = seg
    let last = 0
    for (const m of value.matchAll(new RegExp(URL_RE.source, 'g'))) {
      const idx = m.index ?? 0
      if (idx > last)
        afterUrl.push({ type: 'text', value: value.slice(last, idx), ...style })
      afterUrl.push({ type: 'link', value: m[0], ...style })
      last = idx + m[0].length
    }
    if (last < value.length)
      afterUrl.push({ type: 'text', value: value.slice(last), ...style })
  }

  // Step 2: Build concatenated plain text and record link segment positions
  // so channel detection can skip over them
  const plainText = afterUrl.map(s => s.value).join('')
  let lPos = 0
  const linkRanges: Array<{ start: number, end: number }> = []
  for (const seg of afterUrl) {
    if (seg.type === 'link')
      linkRanges.push({ start: lPos, end: lPos + seg.value.length })
    lPos += seg.value.length
  }

  // Step 3: Find special references (#channels, @mentions) in plain text, ignoring URLs
  interface SpecialRange { start: number, end: number, type: 'channel' | 'mention', value: string }
  const specialRanges: SpecialRange[] = []

  for (const m of plainText.matchAll(/(#[^\s,]{1,50})/g)) {
    const start = m.index ?? 0
    const end = start + m[0].length
    if (!linkRanges.some(lr => lr.start < end && lr.end > start))
      specialRanges.push({ start, end, type: 'channel', value: m[0] })
  }

  for (const m of plainText.matchAll(new RegExp(MENTION_RE.source, 'gi'))) {
    const start = m.index ?? 0
    const end = start + m[0].length
    if (!linkRanges.some(lr => lr.start < end && lr.end > start))
      specialRanges.push({ start, end, type: 'mention', value: m[1]! })
  }

  if (specialRanges.length === 0)
    return afterUrl

  specialRanges.sort((a, b) => a.start - b.start)

  // Step 4: Re-emit segments, fusing IRC-formatting-split references into
  // single typed segments (a server may bold/color only part of a name,
  // splitting it across multiple segments - we detect on the assembled plain text)
  const out: Segment[] = []
  let plainPos = 0

  for (const seg of afterUrl) {
    const segLen = seg.value.length

    if (seg.type === 'link') {
      out.push(seg)
      plainPos += segLen
      continue
    }

    const { type: _t, value: _v, ...style } = seg
    let offset = 0

    while (offset < segLen) {
      const absPos = plainPos + offset
      const currentSp = specialRanges.find(r => r.start <= absPos && r.end > absPos)
      const nextSp = specialRanges.find(r => r.start > absPos)

      if (currentSp) {
        // Inside a special range: emit the full token only at the start
        if (absPos === currentSp.start)
          out.push({ type: currentSp.type, value: currentSp.value })
        offset = Math.min(currentSp.end - plainPos, segLen)
      }
      else if (nextSp && nextSp.start < plainPos + segLen) {
        // Text before the next special in this segment
        out.push({ type: 'text', value: seg.value.slice(offset, nextSp.start - plainPos), ...style })
        offset = nextSp.start - plainPos
      }
      else {
        // No more specials in this segment
        out.push({ type: 'text', value: seg.value.slice(offset), ...style })
        offset = segLen
      }
    }

    plainPos += segLen
  }

  return out
}

function imageUrls(text: string): string[] {
  if (!settings.value.chat_show_previews)
    return []
  return (text.match(URL_RE) ?? []).filter(u => IMAGE_RE.test(u))
}

function isImageOnlyMessage(text: string): boolean {
  const imgs = imageUrls(text)
  if (!imgs.length)
    return false
  return text.replace(URL_RE, '').trim() === ''
}

interface GalleryEntry { url: string, msgId: number }
interface RenderMsg { kind: 'msg', msg: ChatMessage }
interface RenderGallery { kind: 'gallery', rows: GalleryEntry[][], id: number }
type RenderItem = RenderMsg | RenderGallery

function groupRenderItems(msgs: readonly ChatMessage[]): RenderItem[] {
  const items: RenderItem[] = []
  let msgRun: ChatMessage[] = []

  function flush() {
    if (msgRun.length === 0)
      return
    const allEntries: GalleryEntry[] = msgRun.flatMap(m =>
      imageUrls(m.text).map(url => ({ url, msgId: m.id })),
    )
    // A single image renders as a normal message line so it keeps its hover
    // react bar; 2+ images collapse into a gallery grid.
    if (allEntries.length <= 1) {
      for (const m of msgRun) items.push({ kind: 'msg', msg: m })
    }
    else {
      const rows: GalleryEntry[][] = []
      for (let k = 0; k < allEntries.length; k += 3)
        rows.push(allEntries.slice(k, k + 3))
      items.push({ kind: 'gallery', rows, id: msgRun[0]!.id })
    }
    msgRun = []
  }

  for (const msg of msgs) {
    // Only true image-only messages feed the gallery grouping. Anything with
    // text renders as its own line carrying its text, image embeds and the
    // hover react bar together - splitting text and image apart is what used
    // to drop the image into a bar-less gallery, leaving it unhoverable (no
    // reactions, no reply).
    if (isImageOnlyMessage(msg.text)) {
      msgRun.push(msg)
    }
    else {
      flush()
      items.push({ kind: 'msg', msg })
    }
  }
  flush()
  return items
}

function youtubeVideoId(url: string): string | null {
  const m = url.match(YOUTUBE_RE)
  return m?.[1] ?? null
}

function youtubeUrls(text: string): string[] {
  if (!settings.value.chat_show_previews)
    return []
  return (text.match(URL_RE) ?? []).filter(u => youtubeVideoId(u) !== null)
}

function videoUrls(text: string): string[] {
  if (!settings.value.chat_show_previews)
    return []
  return (text.match(URL_RE) ?? []).filter(u => VIDEO_RE.test(u))
}

const videoShortUrls = reactive(new Set<string>())
const brokenImages = reactive(new Set<string>())
function onImageError(url: string) {
  brokenImages.add(url)
}

// Natural dimensions of embedded images, captured on first load and keyed by
// URL. Lets us reserve the exact box for an image before it paints - so a
// message arriving in the buffer (or scrolling back into view) holds its space
// instead of growing the row from zero height and shoving the layout around.
const imageDims = reactive(new Map<string, { w: number, h: number }>())
// URLs whose image has painted - drives swapping the Skeleton out for the image.
const loadedImages = reactive(new Set<string>())
function onImageLoad(event: Event, url: string) {
  const img = event.target as HTMLImageElement
  if (img.naturalWidth > 0 && img.naturalHeight > 0)
    imageDims.set(url, { w: img.naturalWidth, h: img.naturalHeight })
  loadedImages.add(url)
}

// Reserved box for a block embed, clamped to the same max as the CSS. Known
// natural size reserves the exact final box (no shift on load, and no shift at
// all when scrolling back to an already-seen image); unknown falls back to the
// full max box so first paint still has space held.
function embedBox(url: string, maxW: number, maxH: number): Record<string, string> {
  const d = imageDims.get(url)
  if (!d)
    return { width: `${maxW}px`, height: `${maxH}px` }
  const scale = Math.min(maxW / d.w, maxH / d.h, 1)
  return { width: `${Math.round(d.w * scale)}px`, height: `${Math.round(d.h * scale)}px` }
}

function onVideoMetadata(event: Event, url: string) {
  const video = event.target as HTMLVideoElement
  if (video.duration < 10) {
    videoShortUrls.add(url)
    video.loop = true
    video.play().catch(() => {})
  }
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

const chatMediaItems = computed((): MediaItem[] => {
  const items: MediaItem[] = []
  for (const msg of messages.value) {
    for (const url of (msg.text.match(URL_RE) ?? []).filter(u => IMAGE_RE.test(u)))
      items.push({ type: 'image', url })
    for (const url of (msg.text.match(URL_RE) ?? []).filter(u => VIDEO_RE.test(u)))
      items.push({ type: 'video', url })
  }
  return items
})

function openLightbox(url: string, type: 'image' | 'video') {
  const index = chatMediaItems.value.findIndex(m => m.type === type && m.url === url)
  if (index !== -1)
    lightboxRef.value?.open(index)
}

function handleIrcLinkClick(event: MouseEvent, url: string) {
  if (!IMAGE_RE.test(url) && !VIDEO_RE.test(url))
    return
  event.preventDefault()
  event.stopPropagation()
  openLightbox(url, IMAGE_RE.test(url) ? 'image' : 'video')
}

// Returns true when `url` (already stripped of IRC codes by segments()) will
// render as an inline embed, so the raw link text can be hidden.
function isEmbeddedLink(msgText: string, url: string): boolean {
  if (settings.value.chat_show_previews) {
    if (IMAGE_RE.test(url) || VIDEO_RE.test(url) || youtubeVideoId(url) !== null)
      return true
  }
  if (settings.value.chat_show_inline_embeds) {
    if (previewUrls(msgText).includes(url))
      return true
  }
  return false
}

function ircSegments(msg: ChatMessage): Segment[] {
  const segs = segments(msg.text)
  const hideLinks = settings.value.chat_irc_hide_embedded_links
  const inlineImages = settings.value.chat_irc_inline_images
  const showPreviews = settings.value.chat_show_previews

  // Two separate sets:
  // - inlineMediaIndices: links replaced by an inline media element (no trimming around them)
  // - removedLinkIndices: links that produce nothing (trim surrounding whitespace)
  const inlineMediaIndices = new Set<number>()
  const removedLinkIndices = new Set<number>()
  for (let i = 0; i < segs.length; i++) {
    const seg = segs[i]!
    if (seg.type !== 'link')
      continue
    if (inlineImages && showPreviews && (IMAGE_RE.test(seg.value) || VIDEO_RE.test(seg.value) || youtubeVideoId(seg.value) !== null))
      inlineMediaIndices.add(i)
    else if (hideLinks && isEmbeddedLink(msg.text, seg.value))
      removedLinkIndices.add(i)
  }

  const out: Segment[] = []
  for (let i = 0; i < segs.length; i++) {
    const seg = segs[i]!

    if (seg.type === 'link') {
      if (inlineMediaIndices.has(i)) {
        // If hide-links is off, show the link text first, then the media inline after it
        if (!hideLinks)
          out.push(seg)
        const type = VIDEO_RE.test(seg.value) ? 'inline-video' : youtubeVideoId(seg.value) !== null ? 'inline-youtube' : 'inline-image'
        out.push({ type, value: seg.value })
        continue
      }
      // Non-media embed with hide-links on: produce nothing
      if (removedLinkIndices.has(i))
        continue
      out.push(seg)
      continue
    }

    // Trim whitespace only around truly-removed links, not inline media
    if (seg.type === 'text') {
      const prevRemoved = i > 0 && removedLinkIndices.has(i - 1)
      const nextRemoved = i < segs.length - 1 && removedLinkIndices.has(i + 1)
      const val = prevRemoved && nextRemoved
        ? seg.value.trim()
        : prevRemoved
          ? seg.value.trimStart()
          : nextRemoved
            ? seg.value.trimEnd()
            : seg.value
      if (val)
        out.push({ ...seg, value: val })
      continue
    }

    out.push(seg)
  }
  return out
}

function onContextMenu(event: MouseEvent) {
  const el = (event.target as HTMLElement | null)?.closest('[data-msg-id]') as HTMLElement | null
  const id = el?.dataset.msgId
  activeMessage.value = id ? messages.value.find(m => m.id === Number(id)) ?? null : null
  if (isMobile.value) {
    event.stopPropagation()
    mobileMenuOpen.value = true
  }
}

// VUI ContextMenu closes on an outside pointerdown + click. Defer via
// setTimeout so the dispatch runs after the current event cycle finishes.
function closeMenu() {
  if (!import.meta.client)
    return
  mobileMenuOpen.value = false
  setTimeout(() => {
    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  }, 0)
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

function viewProfile(name: string) {
  const user = resolvedUser(name.toLowerCase())
  if (!user)
    return
  navigateTo(`/profile/${user.username}`)
  closeMenu()
  mobileMenuOpen.value = false
}

function activeMessagePrefix(): string | undefined {
  if (!activeMessage.value?.from)
    return undefined
  const lower = cleanNick(activeMessage.value.from).toLowerCase()
  return users.value.find(u => u.name.toLowerCase() === lower)?.prefix
}

const whoisModalNick = ref<string | null>(null)
const whoisModalRelayedBy = ref<string | null>(null)
const whoisModalOpen = ref(false)

function openWhois(name: string) {
  whoisModalNick.value = cleanNick(name)
  // If this message was relayed, pass the actual bot nick so the modal can
  // WHOIS the real IRC user rather than the spoofed virtual nick.
  whoisModalRelayedBy.value = activeMessage.value?.relayedBy ?? null
  whoisModalOpen.value = true
  closeMenu()
  mobileMenuOpen.value = false
}

function reply(msg: ChatMessage) {
  setReply(msg)
  closeMenu()
  mobileMenuOpen.value = false
}

// Message deletion (IRCv3 draft/message-redaction). Confirmed via ConfirmModal
// before the REDACT command is sent.
const redactConfirmOpen = ref(false)
const redactTargetMsg = ref<ChatMessage | null>(null)

const redactIsOwn = computed(() =>
  !!redactTargetMsg.value?.from && redactTargetMsg.value.from.toLowerCase() === nick.value.toLowerCase(),
)

function promptRedact(msg: ChatMessage) {
  redactTargetMsg.value = msg
  redactConfirmOpen.value = true
  closeMenu()
  mobileMenuOpen.value = false
}

function confirmRedact() {
  if (redactTargetMsg.value)
    redactMessage(redactTargetMsg.value)
  redactTargetMsg.value = null
}

// Placeholder shown in place of a deleted message's content.
function redactedLabel(msg: ChatMessage): string {
  const byOther = msg.redactedBy && msg.from && msg.redactedBy.toLowerCase() !== msg.from.toLowerCase()
  const base = byOther ? `Message deleted by ${msg.redactedBy}` : 'Message deleted'
  return msg.redactedReason ? `${base}: ${msg.redactedReason}` : base
}

function replySource(msg: ChatMessage): ChatMessage | null {
  if (!msg.replyTo)
    return null
  return messages.value.find(m => m.msgid === msg.replyTo) ?? null
}

function scrollToReplySource(msg: ChatMessage) {
  const source = replySource(msg)
  if (!source || !logEl.value)
    return
  const el = logEl.value.querySelector<HTMLElement>(`[data-msg-id="${source.id}"]`)
  if (!el)
    return
  el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  el.classList.add('chat-log__msg--jump-highlight')
  setTimeout(() => el.classList.remove('chat-log__msg--jump-highlight'), 1500)
}

function pickReaction(emote: string) {
  if (activeMessage.value)
    toggleReaction(activeMessage.value, emote)
  mobileMenuOpen.value = false
}

// Long-press detection for mobile. The `contextmenu` event on touch browsers
// fires only after text selection has already started, so we drive the sheet
// from touch events instead and use user-select:none to stop the selection.
let _longPressTimer: ReturnType<typeof setTimeout> | null = null
let _touchStartX = 0
let _touchStartY = 0
const LONG_PRESS_MS = 500
const LONG_PRESS_SLOP = 8 // px - cancel if finger drifts (user is scrolling)

function onTouchStart(event: TouchEvent) {
  const touch = event.touches[0]
  if (!touch)
    return
  _touchStartX = touch.clientX
  _touchStartY = touch.clientY

  const el = (event.target as HTMLElement | null)?.closest('[data-msg-id]') as HTMLElement | null
  const id = el?.dataset.msgId
  const msg = id ? messages.value.find(m => m.id === Number(id)) ?? null : null
  if (!msg)
    return

  _longPressTimer = setTimeout(() => {
    _longPressTimer = null
    activeMessage.value = msg
    mobileMenuOpen.value = true
  }, LONG_PRESS_MS)
}

function cancelLongPress() {
  if (_longPressTimer !== null) {
    clearTimeout(_longPressTimer)
    _longPressTimer = null
  }
}

function onTouchMove(event: TouchEvent) {
  if (_longPressTimer === null)
    return
  const touch = event.touches[0]
  if (!touch)
    return
  if (Math.abs(touch.clientX - _touchStartX) > LONG_PRESS_SLOP
    || Math.abs(touch.clientY - _touchStartY) > LONG_PRESS_SLOP) {
    cancelLongPress()
  }
}

// ---- Scroll management ----------------------------------------------------

const SCROLL_BOTTOM_THRESHOLD = 80
// How far ahead, in multiples of the viewport height, to start pulling the next
// page. Proportional to the viewport rather than a fixed pixel lead so a taller
// window or larger font (fewer, taller messages per screen) still gets the same
// number of screenfuls of runway. These define two separated trigger zones with
// a dead zone between them: older history loads only within BACKWARD screens of
// the top, newer only within FORWARD screens of the bottom. The window cap is
// large enough that the zones don't overlap, so the two loaders never fire
// together and fight (prepend-and-trim vs append-and-trim) - the oscillation
// that empties the log. Each load also moves the viewport back toward the dead
// zone (a prepend restores downward, an append slides the front up), so it
// settles after one page instead of bouncing between the edges.
const FORWARD_LOAD_AHEAD_SCREENS = 2
const BACKWARD_LOAD_AHEAD_SCREENS = 1
const isAtBottom = ref(true)

// Native scroll anchoring (overflow-anchor) keeps the viewport steady as
// images/embeds load in. But it's suppressed when the scroll offset is 0,
// which is exactly where we are when older history loads. So we also restore
// the position explicitly after a scroll-triggered prepend, anchored to the
// first visible message element rather than scroll arithmetic. This is immune
// to any UI chrome (spinner, history-start) appearing or disappearing at the
// top, which would throw off distance-from-bottom calculations.
let anchorMsgEl: HTMLElement | null = null
let anchorMsgVisualTop = 0
let pendingPrependRestore = false
// Set whenever a buffer switch, visibility change, or activation wants to
// land at the bottom. Cleared only when the user intentionally scrolls up
// (scrollTop decreases). overflow-anchor bumps scrollTop UP, so they don't
// clear this flag, letting late-loading media still re-pin to the bottom.
let wantBottom = false
let lastScrollTop = 0

function updateScrollState() {
  if (!logEl.value)
    return
  const { scrollTop, scrollHeight, clientHeight } = logEl.value
  const distFromBottom = scrollHeight - scrollTop - clientHeight
  const nowAtBottom = distFromBottom <= SCROLL_BOTTOM_THRESHOLD
  const scrolledUp = scrollTop < lastScrollTop
  lastScrollTop = scrollTop
  if (!nowAtBottom && scrolledUp)
    wantBottom = false
  isAtBottom.value = nowAtBottom
  // Older history only near the top, newer only near the bottom, nothing in the
  // dead zone between. The else makes them mutually exclusive at the boundary;
  // maybeForwardLoad self-gates on the same near-top cutoff, so callers from the
  // drain watch stay consistent.
  if (scrollTop <= clientHeight * BACKWARD_LOAD_AHEAD_SCREENS)
    triggerHistoryLoad()
  else
    maybeForwardLoad()
}

function scrollToBottom() {
  if (logEl.value)
    logEl.value.scrollTo({ top: logEl.value.scrollHeight, behavior: 'instant' })
}

async function jumpToPresent() {
  const buf = activeBuffer.value
  if (!buf)
    return
  if (buf.tailTrimmed)
    await seekToPresent(buf.name)
  nextTick(scrollToBottom)
}

function triggerHistoryLoad() {
  if (!activeBuffer.value || activeBuffer.value.loadingOlderHistory)
    return
  // Find the first visible message element and record its visual position.
  // Only user-scroll loads come through here, so the flag keeps the
  // initial-load auto-fetch path (fetchOlderHistory called directly) from
  // triggering a restore.
  if (logEl.value) {
    const logRect = logEl.value.getBoundingClientRect()
    const msgs = logEl.value.querySelectorAll<HTMLElement>('[data-msg-id]')
    for (const msg of msgs) {
      if (msg.getBoundingClientRect().bottom > logRect.top) {
        anchorMsgEl = msg
        anchorMsgVisualTop = msg.getBoundingClientRect().top - logRect.top
        pendingPrependRestore = true
        break
      }
    }
  }
  fetchOlderHistory(activeBuffer.value.name)
}

// Pull the next page of newer messages from cache while the bottom of a
// tail-trimmed window is within the forward lead. Mirrors triggerHistoryLoad for
// the forward direction, but unlike the older-history path there's nothing to
// restore: overflow-anchor compensates the front-trim, so the viewport stays put
// while the window slides forward. Guards: not-trimmed / in-flight / still near
// the top (older history's zone) / not-yet-near-the-bottom.
function maybeForwardLoad() {
  const buf = activeBuffer.value
  const el = logEl.value
  if (!el || !buf?.tailTrimmed || buf.loadingNewerHistory)
    return
  const { scrollTop, scrollHeight, clientHeight } = el
  // Never load newer while still in the top zone - that's older history's job,
  // and letting both run is the oscillation.
  if (scrollTop <= clientHeight * BACKWARD_LOAD_AHEAD_SCREENS)
    return
  if (scrollHeight - scrollTop - clientHeight <= clientHeight * FORWARD_LOAD_AHEAD_SCREENS)
    void fetchNewerFromCache(buf.name)
}

// Keep draining newer pages until the buffer below the fold reaches the lead.
// A single page only slides the window 25 lines, which a fast scroll blows
// straight through; re-checking after each page lands builds a runway below the
// viewport so scrolling forward feels instant instead of hitting the edge.
// Self-terminating: each page pushes the bottom further past the lead, and
// reaching the live edge clears tailTrimmed.
watch(
  () => activeBuffer.value?.loadingNewerHistory,
  (loading, wasLoading) => {
    if (wasLoading && !loading)
      nextTick(maybeForwardLoad)
  },
)

// After older history is prepended, restore the viewport to the content the
// user was looking at (runs in nextTick, before paint, so there's no flash).
watch(
  () => activeBuffer.value?.loadingOlderHistory,
  (loading, wasLoading) => {
    if (wasLoading && !loading && pendingPrependRestore) {
      pendingPrependRestore = false
      nextTick(() => {
        // Buffer switches (and visibility/activate restores) set wantBottom.
        // In that case skip anchor-restore and go straight to the bottom -
        // anchor-restore would land us mid-history when scrollTop was 0.
        if (wantBottom) {
          scrollToBottom()
        }
        else if (logEl.value && anchorMsgEl?.isConnected) {
          const logRect = logEl.value.getBoundingClientRect()
          const delta = anchorMsgEl.getBoundingClientRect().top - logRect.top - anchorMsgVisualTop
          logEl.value.scrollTop += delta
        }
        anchorMsgEl = null
      })
    }
  },
)

// When the chat surface becomes visible (sheet opened), scroll to bottom so
// messages that arrived while closed are immediately visible.
watch(isChatVisible, (visible) => {
  if (visible) {
    wantBottom = true
    isAtBottom.value = true
    nextTick(scrollToBottom)
  }
})

// When switching buffers, jump to the bottom of the new buffer. The content
// observer below keeps it pinned while the new buffer's content settles.
// Also re-check scroll/history state in case historyReady is already true
// (returning to a previously-visited channel) and the sentinel observer won't
// re-fire because the sentinel was already intersecting.
watch(
  () => activeBuffer.value?.name,
  () => {
    wantBottom = true
    isAtBottom.value = true
    nextTick(() => {
      scrollToBottom()
      updateScrollState()
    })
  },
)

// ---- Intersection observer for lazy history loading -----------------------

let sentinelObserver: IntersectionObserver | null = null

function setupSentinelObserver() {
  sentinelObserver?.disconnect()
  if (!topSentinel.value)
    return
  // Observe against the viewport (root: null) rather than logEl. The actual
  // scroll container varies by surface: on the full page it's .chat-log__scroll
  // (logEl), but inside the navbar sheet VUI's .vui-card-content is the scroller
  // while logEl just expands to fit. Using logEl as root breaks the sheet case
  // (the sentinel never clips, so the observer never re-fires). The viewport
  // root respects every intervening scroll container's clipping, so it works on
  // both. Top sentinel only: it's the at-rest backstop for older history (initial
  // fill, and the sheet where logEl gets no scroll events). Forward loading runs
  // off updateScrollState's scroll events instead - a bottom sentinel firing
  // independently of scroll position is what let the two loaders fight.
  const back = Math.round((window.innerHeight || 800) * BACKWARD_LOAD_AHEAD_SCREENS)
  sentinelObserver = new IntersectionObserver(
    (entries) => {
      if (entries[0]?.isIntersecting)
        triggerHistoryLoad()
    },
    { root: null, rootMargin: `${back}px 0px 0px 0px`, threshold: 0 },
  )
  sentinelObserver.observe(topSentinel.value)
}

// When initial history settles (historyReady flips true), retry the load if
// the sentinel is still visible OR if the scroll container has no overflow.
// Two cases hit this:
//  1. Content never filled the viewport - sentinel visible the whole time, but
//     fetchOlderHistory returned early because historyReady was false then.
//  2. CHATHISTORY LATEST pushed the sentinel just out of view, so the observer
//     flipped to not-intersecting at the same moment historyReady became true -
//     it won't re-fire and the sentinel check misses it.
// Re-evaluating scroll state in nextTick covers both: if the container still
// isn't scrollable (scrollTop === 0, within the load-ahead lead), updateScrollState
// calls triggerHistoryLoad regardless of sentinel state.
watch(
  () => activeBuffer.value?.historyReady,
  (ready) => {
    if (ready)
      nextTick(updateScrollState)
  },
)

// Keep the view pinned to the bottom while content settles (initial load,
// images / link-previews loading, and new messages) whenever the user is
// already at the bottom. A ResizeObserver fires exactly when the rendered
// height changes, so there's no polling and no fighting native anchoring:
// content added below the anchor (new lines, growing embeds) doesn't move the
// anchor, so we're free to re-pin to the bottom.
let contentObserver: ResizeObserver | null = null

function setupContentObserver() {
  contentObserver?.disconnect()
  const content = logEl.value?.querySelector('.chat-log__messages')
  if (!content || !logEl.value)
    return
  contentObserver = new ResizeObserver(() => {
    if (!logEl.value)
      return
    // wantBottom: set on buffer switch / visibility / activate, cleared only
    // when the user intentionally scrolls up. Always re-pin while it's set so
    // late-loading media (images, embeds) that expands content by more than
    // SCROLL_BOTTOM_THRESHOLD doesn't leave us stranded mid-log.
    if (wantBottom) {
      scrollToBottom()
      return
    }
    // For normal in-session use, re-read live rather than trusting
    // isAtBottom.value which native overflow-anchor scroll events can dirty.
    const { scrollTop, scrollHeight, clientHeight } = logEl.value
    if (scrollHeight - scrollTop - clientHeight <= SCROLL_BOTTOM_THRESHOLD)
      scrollToBottom()
  })
  // Observe both the message content (new lines / growing embeds) and the
  // scroll container itself. The container grows during the sheet open
  // animation; without observing it, isAtBottom goes stale-false by the time
  // images load and the ResizeObserver on content fires.
  contentObserver.observe(content)
  contentObserver.observe(logEl.value)
}

onMounted(() => {
  wantBottom = true
  isAtBottom.value = true
  setupSentinelObserver()
  setupContentObserver()
  nextTick(scrollToBottom)
})
onActivated(() => {
  wantBottom = true
  isAtBottom.value = true
  nextTick(scrollToBottom)
})

onBeforeUnmount(() => {
  sentinelObserver?.disconnect()
  contentObserver?.disconnect()
  if (_phaseRaf !== null)
    cancelAnimationFrame(_phaseRaf)
})
</script>

<template>
  <ContextMenu class="chat-log">
    <div
      ref="logEl"
      class="chat-log__scroll"
      @contextmenu.prevent="onContextMenu"
      @touchstart.passive="onTouchStart"
      @touchmove.passive="onTouchMove"
      @touchend="cancelLongPress"
      @touchcancel="cancelLongPress"
      @click="handleContentClick"
      @scroll.passive="updateScrollState"
    >
      <div
        class="chat-log__messages"
        :class="{ 'chat-log__messages--server': isServerBuffer,
                  'chat-log__messages--modern': isModernMode }"
        :style="!isModernMode ? { '--irc-nick-col': `${nickColWidth}px` } : {}"
      >
        <div ref="topSentinel" class="chat-log__history-sentinel" />
        <Flex v-if="activeBuffer?.loadingOlderHistory" x-center class="chat-log__history-loading">
          <Spinner size="s" />
        </Flex>
        <div v-else-if="activeBuffer?.historyExhausted" class="chat-log__history-start">
          Beginning of history
        </div>
        <template v-if="!isModernMode">
          <template v-for="msg in messages" :key="msg.id">
            <div v-if="msg.id === readLineFirstMsgId" class="chat-log__new-divider" role="button" tabindex="0" aria-label="Mark as read" title="Mark as read" @click="markRead" @keydown.enter.prevent="markRead" @keydown.space.prevent="markRead">
              <span>new messages</span>
            </div>
            <div
              class="chat-log__msg chat-log__msg--irc"
              :class="[isServiceNick(msg.from) ? undefined : msgClass(msg), {
                'chat-log__msg--own': isOwn(msg),
                'chat-log__msg--mention': isMention(msg) && !isServiceNick(msg.from),
                'chat-log__msg--backlog': msg.backlog && !isServiceNick(msg.from),
                'chat-log__msg--service': isServiceNick(msg.from),
                'chat-log__msg--action': msg.action,
              }]"
              :data-msg-id="msg.id"
            >
              <span class="chat-log__nick-cell">
                <TimestampDate
                  v-if="showTimestamps"
                  class="chat-log__ts"
                  :date="msg.ts.toISOString()"
                ><span class="chat-log__ts">{{ fmtTime(msg.ts) }}</span></TimestampDate>
                <template v-if="msg.action">
                  <span class="chat-log__action-star">*</span>
                </template>
                <template v-else-if="msg.from && relayNickParts(msg.from)">
                  <template v-if="settings.chat_irc_pure_relay_nicks">
                    <span class="chat-log__nick" :style="nickStyle(msg)" :title="`Relayed via ${relayNickParts(msg.from)!.bridge}`">
                      {{ relayNickParts(msg.from)!.user }}/{{ relayNickParts(msg.from)!.bridge }}
                    </span>
                  </template>
                  <template v-else>
                    <RelaySourceIcon
                      :bridge="relayNickParts(msg.from)!.bridge"
                      :relayed-by="msg.relayedBy"
                      :size="12"
                    />
                    <span class="chat-log__nick" :style="nickStyle(msg)">
                      {{ relayNickParts(msg.from)!.user }}
                    </span>
                  </template>
                </template>
                <template v-else-if="msg.from && msg.relayedBy">
                  <RelaySourceIcon :relayed-by="msg.relayedBy" :size="12" />
                  <span class="chat-log__nick" :style="nickStyle(msg)">{{ msg.from }}</span>
                </template>
                <span v-else-if="msg.from" class="chat-log__nick" :style="nickStyle(msg)">{{ msg.from }}</span>
              </span>
              <div class="chat-log__msg-cell">
                <div
                  v-if="msg.replyTo"
                  class="chat-log__reply-quote"
                  :class="{ 'chat-log__reply-quote--clickable': replySource(msg) }"
                  @click.stop="replySource(msg) && scrollToReplySource(msg)"
                >
                  <template v-if="replySource(msg)">
                    <RelaySourceIcon v-if="relayNickParts(replySource(msg)!.from)" :bridge="relayNickParts(replySource(msg)!.from)!.bridge" :size="11" />
                    <span class="chat-log__reply-nick">{{ displayNick(replySource(msg)!.from) }}:</span>
                    <span class="chat-log__reply-text">{{ replySource(msg)!.text }}</span>
                  </template>
                  <span v-else class="chat-log__reply-text">&#x21A9; Reply to a previous message</span>
                </div>
                <span v-if="msg.action" class="chat-log__nick chat-log__nick--action" :style="nickStyle(msg)">{{ msg.from }}</span>
                <div class="chat-log__text">
                  <span v-if="msg.redacted" class="chat-log__redacted">
                    <Icon name="ph:prohibit" :size="14" />
                    {{ redactedLabel(msg) }}
                  </span>
                  <template v-for="(seg, i) in (msg.redacted ? [] : ircSegments(msg))" :key="i">
                    <a
                      v-if="seg.type === 'link'"
                      :href="seg.value"
                      target="_blank"
                      rel="noopener noreferrer"
                      class="chat-log__link"
                      :style="segStyle(seg)"
                      @click="handleIrcLinkClick($event, seg.value)"
                    >{{ seg.value }}</a>
                    <span
                      v-else-if="seg.type === 'channel'"
                      class="chat-log__channel-link"
                      :style="segStyle(seg)"
                      @click="joinChannel(seg.value)"
                    >{{ seg.value }}</span>
                    <template v-else-if="seg.type === 'mention'">
                      <UserPreviewHover v-if="resolvedUser(seg.value.toLowerCase())" :user-id="resolvedUser(seg.value.toLowerCase())!.id">
                        <NuxtLink :to="`/profile/${resolvedUser(seg.value.toLowerCase())!.username}`" class="chat-log__mention-link">
                          <span>@{{ resolvedUser(seg.value.toLowerCase())!.username }}</span>
                        </NuxtLink>
                      </UserPreviewHover>
                      <span v-else>@{{ seg.value }}</span>
                    </template>
                    <span
                      v-else-if="seg.fg || seg.bg || seg.bold || seg.italic || seg.underline || seg.strike || seg.mono"
                      :style="segStyle(seg)"
                    >{{ seg.value }}</span>
                    <img
                      v-else-if="seg.type === 'inline-image'"
                      :src="seg.value"
                      alt=""
                      loading="lazy"
                      class="chat-log__embed chat-log__embed--inline"
                      @error="onImageError(seg.value)"
                      @click="openLightbox(seg.value, 'image')"
                    >
                    <YouTubeEmbed
                      v-else-if="seg.type === 'inline-youtube'"
                      :url="seg.value"
                      small
                    />
                    <video
                      v-else-if="seg.type === 'inline-video'"
                      :src="seg.value"
                      muted
                      playsinline
                      preload="metadata"
                      :loop="videoShortUrls.has(seg.value)"
                      class="chat-log__embed chat-log__embed--inline"
                      @loadedmetadata="onVideoMetadata($event, seg.value)"
                      @click="openLightbox(seg.value, 'video')"
                    />
                    <template v-else>
                      {{ seg.value }}
                    </template>
                  </template>
                  <ChatMessageReactions v-if="!msg.redacted && msg.reactions && settings.chat_irc_reactions" :message="msg" />
                </div>
                <Flex v-if="!msg.redacted && !settings.chat_irc_inline_images && imageUrls(msg.text).filter(u => !brokenImages.has(u)).length" wrap gap="xs" class="chat-log__embeds">
                  <div
                    v-for="url in imageUrls(msg.text).filter(u => !brokenImages.has(u))"
                    :key="url"
                    class="chat-log__embed-wrap"
                    :style="embedBox(url, 240, 180)"
                  >
                    <Skeleton v-if="!loadedImages.has(url)" width="100%" height="100%" :radius="5" class="chat-log__embed-skeleton" />
                    <img
                      :src="url"
                      alt=""
                      loading="lazy"
                      class="chat-log__embed"
                      @load="onImageLoad($event, url)"
                      @error="onImageError(url)"
                      @click="openLightbox(url, 'image')"
                    >
                  </div>
                </Flex>
                <Flex v-if="!msg.redacted && !settings.chat_irc_inline_images && youtubeUrls(msg.text).length" wrap gap="xs" class="chat-log__embeds">
                  <YouTubeEmbed v-for="url in youtubeUrls(msg.text)" :key="url" :url="url" />
                </Flex>
                <Flex v-if="!msg.redacted && !settings.chat_irc_inline_images && videoUrls(msg.text).length" wrap gap="xs" class="chat-log__embeds">
                  <video
                    v-for="url in videoUrls(msg.text)"
                    :key="url"
                    :src="url"
                    muted
                    playsinline
                    preload="metadata"
                    :loop="videoShortUrls.has(url)"
                    class="chat-log__embed-video"
                    @loadedmetadata="onVideoMetadata($event, url)"
                    @click="openLightbox(url, 'video')"
                  />
                </Flex>
                <template v-if="!msg.redacted && previewUrls(msg.text).length">
                  <LinkEmbed
                    v-for="url in previewUrls(msg.text)"
                    :key="url"
                    :url="url"
                    class="chat-log__link-preview"
                  />
                </template>
              </div>
              <div v-if="msg.msgid && msg.type === 'chat' && !msg.redacted" class="chat-log__line-react">
                <template v-if="settings.chat_irc_reactions">
                  <button
                    v-for="emote in settings.quick_reactions"
                    :key="emote"
                    class="chat-log__line-react-emote"
                    :class="{ 'chat-log__line-react-emote--active': msg.reactions?.[emote]?.includes(nick) }"
                    :title="`React ${emote}`"
                    @click="toggleReaction(msg, emote)"
                  >
                    {{ emote }}
                  </button>
                  <ReactionsSelect :quick="false" @reaction="(emote) => toggleReaction(msg, emote)" />
                </template>
                <button v-if="msg.from" class="chat-log__line-reply-btn" @click="reply(msg)">
                  <Icon name="ph:arrow-bend-up-left" size="16" class="text-color-lighter" />
                </button>
                <button v-if="canRedact(msg)" class="chat-log__line-reply-btn" title="Delete message" @click="promptRedact(msg)">
                  <Icon name="ph:trash" size="16" class="text-color-lighter" />
                </button>
              </div>
            </div>
          </template>
        </template>
        <template v-else>
          <template v-for="group in groupedMessages" :key="group.id">
            <div v-if="group.id === readLineFirstGroupId" class="chat-log__new-divider" role="button" tabindex="0" aria-label="Mark as read" title="Mark as read" @click="markRead" @keydown.enter.prevent="markRead" @keydown.space.prevent="markRead">
              <span>new messages</span>
            </div>
            <!-- HistServ chat announcement dividers (one per message in the group) -->
            <template v-if="!group.isSystem && group.from === 'HistServ'">
              <div
                v-for="msg in group.messages"
                :key="msg.id"
                class="chat-log__histserv-divider"
                :data-msg-id="msg.id"
              >
                <span class="chat-log__histserv-divider__text">
                  <template v-for="(seg, i) in segments(msg.text)" :key="i">
                    <a v-if="seg.type === 'link'" :href="seg.value" target="_blank" rel="noopener noreferrer" class="chat-log__link" :style="segStyle(seg)">{{ seg.value }}</a>
                    <span v-else-if="seg.type === 'channel'" class="chat-log__channel-link" :style="segStyle(seg)" @click="joinChannel(seg.value)">{{ seg.value }}</span>
                    <template v-else-if="seg.type === 'mention'">
                      <UserPreviewHover v-if="resolvedUser(seg.value.toLowerCase())" :user-id="resolvedUser(seg.value.toLowerCase())!.id">
                        <NuxtLink :to="`/profile/${resolvedUser(seg.value.toLowerCase())!.username}`" class="chat-log__mention-link">@{{ resolvedUser(seg.value.toLowerCase())!.username }}</NuxtLink>
                      </UserPreviewHover>
                      <template v-else>@{{ seg.value }}</template>
                    </template>
                    <span v-else-if="seg.fg || seg.bg || seg.bold || seg.italic || seg.underline || seg.strike || seg.mono" :style="segStyle(seg)">{{ seg.value }}</span>
                    <template v-else>{{ seg.value }}</template>
                  </template>
                </span>
              </div>
            </template>

            <!-- Server command output (e.g. /whois responses) - left-aligned inline style -->
            <div
              v-else-if="group.isSystem && group.messages[0].type === 'system'"
              class="chat-log__server-line"
              :data-msg-id="group.messages[0].id"
            >
              <span class="chat-log__action-star">*</span>
              <span class="chat-log__server-text">
                <template v-for="(seg, i) in segments(group.messages[0].text)" :key="i">
                  <a v-if="seg.type === 'link'" :href="seg.value" target="_blank" rel="noopener noreferrer" class="chat-log__link" :style="segStyle(seg)">{{ seg.value }}</a>
                  <span v-else-if="seg.type === 'channel'" class="chat-log__channel-link" :style="segStyle(seg)" @click="joinChannel(seg.value)">{{ seg.value }}</span>
                  <template v-else-if="seg.type === 'mention'">
                    <UserPreviewHover v-if="resolvedUser(seg.value.toLowerCase())" :user-id="resolvedUser(seg.value.toLowerCase())!.id">
                      <NuxtLink :to="`/profile/${resolvedUser(seg.value.toLowerCase())!.username}`" class="chat-log__mention-link">@{{ resolvedUser(seg.value.toLowerCase())!.username }}</NuxtLink>
                    </UserPreviewHover>
                    <template v-else>@{{ seg.value }}</template>
                  </template>
                  <span v-else-if="seg.fg || seg.bg || seg.bold || seg.italic || seg.underline || seg.strike || seg.mono" :style="segStyle(seg)">{{ seg.value }}</span>
                  <template v-else>{{ seg.value }}</template>
                </template>
              </span>
            </div>

            <!-- Join/part/error events as centered dividers -->
            <div
              v-else-if="group.isSystem"
              class="chat-log__histserv-divider"
              :data-msg-id="group.messages[0].id"
            >
              <span class="chat-log__histserv-divider__text">
                <template v-for="(seg, i) in segments(group.messages[0].text)" :key="i">
                  <a v-if="seg.type === 'link'" :href="seg.value" target="_blank" rel="noopener noreferrer" class="chat-log__link" :style="segStyle(seg)">{{ seg.value }}</a>
                  <span v-else-if="seg.type === 'channel'" class="chat-log__channel-link" :style="segStyle(seg)" @click="joinChannel(seg.value)">{{ seg.value }}</span>
                  <template v-else-if="seg.type === 'mention'">
                    <UserPreviewHover v-if="resolvedUser(seg.value.toLowerCase())" :user-id="resolvedUser(seg.value.toLowerCase())!.id">
                      <NuxtLink :to="`/profile/${resolvedUser(seg.value.toLowerCase())!.username}`" class="chat-log__mention-link">@{{ resolvedUser(seg.value.toLowerCase())!.username }}</NuxtLink>
                    </UserPreviewHover>
                    <template v-else>@{{ seg.value }}</template>
                  </template>
                  <span v-else-if="seg.fg || seg.bg || seg.bold || seg.italic || seg.underline || seg.strike || seg.mono" :style="segStyle(seg)">{{ seg.value }}</span>
                  <template v-else>{{ seg.value }}</template>
                </template>
              </span>
            </div>

            <!-- Action message (/me) -->
            <div
              v-else-if="group.isAction"
              class="chat-log__action-line"
              :class="{ 'chat-log__msg--backlog': group.messages[0].backlog }"
              :data-msg-id="group.messages[0].id"
            >
              <span class="chat-log__action-star">*</span>
              <span class="chat-log__nick chat-log__nick--action" :style="groupNickStyle(group.from)">{{ resolvedUser(group.nickLower)?.username ?? group.from }}</span>
              <span class="chat-log__action-text">
                <template v-for="(seg, i) in segments(group.messages[0].text)" :key="i">
                  <a v-if="seg.type === 'link'" :href="seg.value" target="_blank" rel="noopener noreferrer" class="chat-log__link" :style="segStyle(seg)">{{ seg.value }}</a>
                  <span v-else-if="seg.type === 'channel'" class="chat-log__channel-link" :style="segStyle(seg)" @click="joinChannel(seg.value)">{{ seg.value }}</span>
                  <template v-else-if="seg.type === 'mention'">
                    <UserPreviewHover v-if="resolvedUser(seg.value.toLowerCase())" :user-id="resolvedUser(seg.value.toLowerCase())!.id">
                      <NuxtLink :to="`/profile/${resolvedUser(seg.value.toLowerCase())!.username}`" class="chat-log__mention-link">@{{ resolvedUser(seg.value.toLowerCase())!.username }}</NuxtLink>
                    </UserPreviewHover>
                    <template v-else>@{{ seg.value }}</template>
                  </template>
                  <span v-else-if="seg.fg || seg.bg || seg.bold || seg.italic || seg.underline || seg.strike || seg.mono" :style="segStyle(seg)">{{ seg.value }}</span>
                  <template v-else>{{ seg.value }}</template>
                </template>
              </span>
            </div>

            <!-- Grouped chat messages (Discord-style) -->
            <div
              v-else
              class="chat-log__group"
              :class="{ 'chat-log__msg--backlog': group.messages[0].backlog }"
              :data-msg-id="group.messages[0].id"
            >
              <div class="chat-log__group-avatar">
                <UserAvatar v-if="resolvedUser(group.nickLower)" :user-id="resolvedUser(group.nickLower)!.id" :size="32" show-preview linked />
                <AvatarMedia v-else-if="ircAvatarUrl(group.nickLower)" :size="32" :url="ircAvatarUrl(group.nickLower)" :alt="group.from ?? ''" />
                <AvatarMedia v-else :size="32" :alt="group.from ?? ''">
                  <template #default>
                    <Icon v-if="isNickBot(group.nickLower)" name="ph:robot" :size="16" />
                    <template v-else>
                      {{ (group.from ?? '?').charAt(0).toUpperCase() }}
                    </template>
                  </template>
                </AvatarMedia>
              </div>
              <div class="chat-log__group-body">
                <Flex y-center gap="xs" class="chat-log__group-header">
                  <NuxtLink
                    v-if="resolvedUser(group.nickLower)"
                    :to="`/profile/${resolvedUser(group.nickLower)!.username}`"
                    class="chat-log__nick-link"
                  >
                    <span class="chat-log__nick" :style="groupNickStyle(group.from)">
                      {{ resolvedUser(group.nickLower)!.username }}
                    </span>
                  </NuxtLink>
                  <template v-else-if="relayNickParts(group.from)">
                    <span class="chat-log__nick" :style="groupNickStyle(group.from)">
                      {{ relayNickParts(group.from)!.user }}
                    </span>
                  </template>
                  <span v-else class="chat-log__nick" :style="groupNickStyle(group.from)">
                    {{ ircDisplayName(group.from) }}
                  </span>
                  <RelaySourceIcon
                    v-if="relayNickParts(group.from) || group.messages[0].relayedBy"
                    :bridge="relayNickParts(group.from)?.bridge"
                    :relayed-by="group.messages[0].relayedBy"
                  />
                  <TimestampDate
                    v-if="showTimestamps"
                    class="chat-log__ts chat-log__ts--inline"
                    :date="group.messages[0].ts.toISOString()"
                    relative
                  />
                </Flex>
                <template v-for="item in groupRenderItems(group.messages)" :key="item.kind === 'gallery' ? `g-${item.id}` : item.msg.id">
                  <div
                    v-if="item.kind === 'msg'"
                    class="chat-log__modern-line"
                    :class="{ 'chat-log__modern-line--mention': isMention(item.msg) }"
                    :data-msg-id="item.msg.id"
                  >
                    <div
                      v-if="item.msg.replyTo"
                      class="chat-log__reply-quote"
                      :class="{ 'chat-log__reply-quote--clickable': replySource(item.msg) }"
                      @click.stop="replySource(item.msg) && scrollToReplySource(item.msg)"
                    >
                      <template v-if="replySource(item.msg)">
                        <Badge variant="neutral" class="chat-log__reply-source">
                          <Flex y-center gap="xxs">
                            <Icon name="ph:arrow-bend-down-right" :size="10" />
                            <UserAvatar v-if="resolvedUser(replySource(item.msg)!.from?.toLowerCase() ?? null)" :user-id="resolvedUser(replySource(item.msg)!.from?.toLowerCase() ?? null)!.id" :size="12" />
                            <AvatarMedia v-else-if="ircAvatarUrl(replySource(item.msg)!.from?.toLowerCase() ?? '')" :size="12" :url="ircAvatarUrl(replySource(item.msg)!.from?.toLowerCase() ?? '')" :alt="replySource(item.msg)!.from ?? ''" />
                            <RelaySourceIcon v-if="relayNickParts(replySource(item.msg)!.from)" :bridge="relayNickParts(replySource(item.msg)!.from)!.bridge" :size="11" />
                            <span>{{ displayNick(replySource(item.msg)!.from) }}</span>
                          </Flex>
                        </Badge>
                        <span class="chat-log__reply-text">{{ replySource(item.msg)!.text }}</span>
                      </template>
                      <span v-else class="chat-log__reply-text">&#x21A9; Reply to a previous message</span>
                    </div>
                    <span class="chat-log__text">
                      <span v-if="item.msg.redacted" class="chat-log__redacted">
                        <Icon name="ph:prohibit" :size="14" />
                        {{ redactedLabel(item.msg) }}
                      </span>
                      <template v-for="(seg, i) in (item.msg.redacted ? [] : segments(item.msg.text))" :key="i">
                        <template v-if="seg.type === 'link'">
                          <a v-if="!imageUrls(item.msg.text).includes(seg.value) && !videoUrls(item.msg.text).includes(seg.value) && !previewUrls(item.msg.text).includes(seg.value) && !youtubeUrls(item.msg.text).includes(seg.value)" :href="seg.value" target="_blank" rel="noopener noreferrer" class="chat-log__link" :style="segStyle(seg)">{{ seg.value }}</a>
                        </template>
                        <span v-else-if="seg.type === 'channel'" class="chat-log__channel-link" :style="segStyle(seg)" @click="joinChannel(seg.value)">{{ seg.value }}</span>
                        <template v-else-if="seg.type === 'mention'">
                          <UserPreviewHover v-if="resolvedUser(seg.value.toLowerCase())" :user-id="resolvedUser(seg.value.toLowerCase())!.id">
                            <NuxtLink :to="`/profile/${resolvedUser(seg.value.toLowerCase())!.username}`" class="chat-log__mention-link">@{{ resolvedUser(seg.value.toLowerCase())!.username }}</NuxtLink>
                          </UserPreviewHover>
                          <template v-else>@{{ seg.value }}</template>
                        </template>
                        <span v-else-if="seg.fg || seg.bg || seg.bold || seg.italic || seg.underline || seg.strike || seg.mono" :style="segStyle(seg)">{{ seg.value }}</span>
                        <template v-else>{{ seg.value }}</template>
                      </template>
                    </span>
                    <Flex v-if="!item.msg.redacted && imageUrls(item.msg.text).filter(u => !brokenImages.has(u)).length" wrap gap="xs" class="chat-log__embeds">
                      <div v-for="url in imageUrls(item.msg.text).filter(u => !brokenImages.has(u))" :key="url" class="chat-log__embed-wrap" :style="embedBox(url, 240, 180)">
                        <Skeleton v-if="!loadedImages.has(url)" width="100%" height="100%" :radius="5" class="chat-log__embed-skeleton" />
                        <img :src="url" alt="" loading="lazy" class="chat-log__embed" @load="onImageLoad($event, url)" @error="onImageError(url)" @click="openLightbox(url, 'image')">
                      </div>
                    </Flex>
                    <Flex v-if="!item.msg.redacted && youtubeUrls(item.msg.text).length" wrap gap="xs" class="chat-log__embeds">
                      <YouTubeEmbed v-for="url in youtubeUrls(item.msg.text)" :key="url" :url="url" />
                    </Flex>
                    <Flex v-if="!item.msg.redacted && videoUrls(item.msg.text).length" wrap gap="xs" class="chat-log__embeds">
                      <video v-for="url in videoUrls(item.msg.text)" :key="url" :src="url" muted playsinline preload="metadata" :loop="videoShortUrls.has(url)" class="chat-log__embed-video" @loadedmetadata="onVideoMetadata($event, url)" @click="openLightbox(url, 'video')" />
                    </Flex>
                    <template v-if="!item.msg.redacted && previewUrls(item.msg.text).length">
                      <LinkEmbed v-for="url in previewUrls(item.msg.text)" :key="url" :url="url" class="chat-log__link-preview" />
                    </template>
                    <ChatMessageReactions v-if="!item.msg.redacted && item.msg.reactions" :message="item.msg" />
                    <div v-if="item.msg.msgid && !item.msg.redacted" class="chat-log__line-react">
                      <button
                        v-for="emote in settings.quick_reactions"
                        :key="emote"
                        class="chat-log__line-react-emote"
                        :class="{ 'chat-log__line-react-emote--active': item.msg.reactions?.[emote]?.includes(nick) }"
                        :title="`React ${emote}`"
                        @click="toggleReaction(item.msg, emote)"
                      >
                        {{ emote }}
                      </button>
                      <ReactionsSelect :quick="false" @reaction="(emote) => toggleReaction(item.msg, emote)" />
                      <button class="chat-log__line-reply-btn" @click="reply(item.msg)">
                        <Icon name="ph:arrow-bend-up-left" :size="16" class="text-color-lighter" />
                      </button>
                      <button v-if="canRedact(item.msg)" class="chat-log__line-reply-btn" title="Delete message" @click="promptRedact(item.msg)">
                        <Icon name="ph:trash" :size="16" class="text-color-lighter" />
                      </button>
                    </div>
                  </div>
                  <template v-else>
                    <template v-for="(row, ri) in item.rows" :key="ri">
                      <template v-if="row.filter(e => !brokenImages.has(e.url)).length">
                        <div v-if="row.filter(e => !brokenImages.has(e.url)).length === 1" class="chat-log__embeds">
                          <img
                            v-for="entry in row.filter(e => !brokenImages.has(e.url))"
                            :key="entry.url"
                            :src="entry.url"
                            :data-msg-id="entry.msgId"
                            alt=""
                            loading="lazy"
                            class="chat-log__embed"
                            @error="onImageError(entry.url)"
                            @click="openLightbox(entry.url, 'image')"
                          >
                        </div>
                        <div v-else class="chat-log__image-group">
                          <img
                            v-for="entry in row.filter(e => !brokenImages.has(e.url))"
                            :key="entry.url"
                            :src="entry.url"
                            :data-msg-id="entry.msgId"
                            alt=""
                            loading="lazy"
                            class="chat-log__embed"
                            @error="onImageError(entry.url)"
                            @click="openLightbox(entry.url, 'image')"
                          >
                        </div>
                      </template>
                    </template>
                  </template>
                </template>
              </div>
            </div>
          </template>
        </template>
        <Flex v-if="messages.length === 0 && !isLoadingInitialHistory" y-center x-center class="chat-log__empty" expand>
          No messages yet.
        </Flex>

        <Flex v-if="isLoadingInitialHistory" y-center x-center class="chat-log__loading" expand>
          <Spinner />
        </Flex>

        <div
          v-if="!isModernMode && !isServerBuffer"
          class="chat-log__nick-divider"
          :class="{ 'chat-log__nick-divider--dragging': isDragging }"
          @mousedown.prevent="startDrag"
        />
      </div>
    </div>

    <JumpToPresent :visible="!isAtBottom" @click="jumpToPresent" />

    <Lightbox ref="lightboxRef" :items="chatMediaItems" />

    <template #menu>
      <div class="vui-dropdown chat-log__menu" @click="closeMenu">
        <template v-if="activeMessage">
          <template v-if="activeMessage.msgid && activeMessage.type === 'chat' && settings.quick_reactions.length">
            <div class="chat-log__menu-react">
              <button
                v-for="emote in settings.quick_reactions"
                :key="emote"
                type="button"
                class="chat-log__menu-react-btn"
                :class="{ 'chat-log__menu-react-btn--active': activeMessage.reactions?.[emote]?.includes(nick) }"
                @click="pickReaction(emote)"
              >
                {{ emote }}
              </button>
              <ReactionsSelect :quick="false" @reaction="pickReaction">
                <template #default="{ toggle }">
                  <button type="button" class="chat-log__menu-react-btn chat-log__menu-react-btn--more" aria-label="More reactions" @click.stop="toggle">
                    <Icon name="ph:plus" :size="16" />
                  </button>
                </template>
              </ReactionsSelect>
            </div>
            <Divider />
          </template>
          <UserActionMenu
            v-if="activeMessage.from"
            :nick="cleanNick(activeMessage.from)"
            :mention-nick="relayNickParts(activeMessage.from)?.user"
            :hide-message="!!relayNickParts(activeMessage.from)"
            :prefix="activeMessagePrefix()"
            show-mod-actions
            @close="closeMenu"
            @open-whois="openWhois"
          >
            <template #middle>
              <DropdownItem
                v-if="activeMessage.msgid && activeMessage.type === 'chat'"
                @click="reply(activeMessage)"
              >
                <template #icon>
                  <Icon name="ph:arrow-bend-up-left" />
                </template>
                Reply
              </DropdownItem>
              <DropdownItem
                v-if="resolvedUser(activeMessage.from.toLowerCase())"
                @click="viewProfile(activeMessage.from)"
              >
                <template #icon>
                  <Icon name="ph:user-circle" />
                </template>
                View profile
              </DropdownItem>
            </template>
          </UserActionMenu>
          <Divider />
          <DropdownItem @click="copyText(activeMessage.text, 'Message')">
            <template #icon>
              <Icon name="ph:copy" />
            </template>
            Copy message
          </DropdownItem>
          <DropdownItem v-if="canRedact(activeMessage)" variant="danger" @click="promptRedact(activeMessage)">
            <template #icon>
              <Icon name="ph:trash" />
            </template>
            Delete message
          </DropdownItem>
        </template>
      </div>
    </template>
  </ContextMenu>

  <Sheet
    :open="mobileMenuOpen"
    position="bottom"
    class="chat-log__drawer-sheet"
    :card="{ separators: true,
             padding: false }"
    @close="mobileMenuOpen = false"
  >
    <template v-if="activeMessage" #header>
      <Flex column gap="xxs" expand>
        <Flex y-center gap="xxs">
          <span v-if="activeMessage.from && (relayNickParts(activeMessage.from) || activeMessage.relayedBy)" class="chat-log__drawer-relay-icon">
            <RelaySourceIcon
              :bridge="relayNickParts(activeMessage.from)?.bridge"
              :relayed-by="activeMessage.relayedBy"
              :size="16"
            />
          </span>
          <span class="chat-log__drawer-nick">{{ activeMessage.from ? (relayNickParts(activeMessage.from)?.user ?? cleanNick(activeMessage.from)) : '' }}</span>
          <span v-if="activeMessage.relayedBy" class="chat-log__drawer-bridge">
            via {{ activeMessage.relayedBy }}
          </span>
        </Flex>
        <span class="chat-log__drawer-ts">{{ fmtDateTime(activeMessage.ts) }}</span>
      </Flex>
    </template>
    <div v-if="activeMessage?.msgid && activeMessage.type === 'chat'" class="chat-log__quick-row">
      <Button
        v-for="emote in settings.quick_reactions"
        :key="emote"
        size="l"
        variant="gray"
        :class="{ 'reactions__button--active': activeMessage.reactions?.[emote]?.includes(nick) }"
        @click="pickReaction(emote)"
      >
        {{ emote }}
      </Button>
      <ReactionsSelect size="l" :quick="false" class="chat-log__quick-add" @reaction="pickReaction">
        <template #default="{ toggle }">
          <Button size="l" variant="gray" square @click="toggle">
            <Icon name="ph:plus" />
          </Button>
        </template>
      </ReactionsSelect>
    </div>
    <Divider />
    <div class="vui-dropdown chat-log__menu">
      <template v-if="activeMessage">
        <UserActionMenu
          v-if="activeMessage.from"
          :nick="cleanNick(activeMessage.from)"
          :mention-nick="relayNickParts(activeMessage.from)?.user"
          :hide-message="!!relayNickParts(activeMessage.from)"
          :prefix="activeMessagePrefix()"
          show-mod-actions
          @close="closeMenu"
          @open-whois="openWhois"
        >
          <template #middle>
            <DropdownItem
              v-if="activeMessage.msgid && activeMessage.type === 'chat'"
              @click="reply(activeMessage)"
            >
              <template #icon>
                <Icon name="ph:arrow-bend-up-left" />
              </template>
              Reply
            </DropdownItem>
            <DropdownItem
              v-if="resolvedUser(activeMessage.from.toLowerCase())"
              @click="viewProfile(activeMessage.from)"
            >
              <template #icon>
                <Icon name="ph:user-circle" />
              </template>
              View profile
            </DropdownItem>
          </template>
        </UserActionMenu>
        <Divider />
        <DropdownItem @click="copyText(activeMessage.text, 'Message')">
          <template #icon>
            <Icon name="ph:copy" />
          </template>
          Copy message
        </DropdownItem>
        <DropdownItem v-if="canRedact(activeMessage)" variant="danger" @click="promptRedact(activeMessage)">
          <template #icon>
            <Icon name="ph:trash" />
          </template>
          Delete message
        </DropdownItem>
      </template>
    </div>
  </Sheet>
  <IrcWhoisModal :nick="whoisModalNick" :relayed-by="whoisModalRelayedBy" :open="whoisModalOpen" @close="whoisModalOpen = false" />
  <ConfirmModal
    v-model:open="redactConfirmOpen"
    title="Delete message"
    :description="redactIsOwn ? 'Delete your message for everyone? This cannot be undone.' : 'Delete this message for everyone? This cannot be undone.'"
    confirm-text="Delete"
    destructive
    @confirm="confirmRedact"
  />
</template>

<style lang="scss" scoped>
.chat-log {
  display: flex;
  flex: 1;
  min-height: 0;
  width: 100%;
  position: relative;

  &__drawer-nick {
    font-size: var(--font-size-s);
    font-weight: var(--font-weight-semibold);
    color: var(--color-text);
  }

  &__drawer-relay-icon {
    display: flex;
    align-items: center;
    margin-right: var(--space-xxs);

    :deep(.iconify) {
      color: var(--color-text) !important;
    }
  }

  &__drawer-bridge {
    font-size: var(--font-size-xs);
    color: var(--color-text-lighter);
  }

  &__drawer-ts {
    font-size: var(--font-size-xs);
    color: var(--color-text-lighter);
    font-family: monospace;
  }

  // Quick-reaction strip in the message menu. Buttons grow to fill the row and
  // wrap to a new line instead of overflowing or leaving space-between gaps.
  &__quick-row {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-xs);
    padding: var(--space-s) var(--space-m);

    // ReactionsSelect renders an inline-block anchor wrapper; make it grow as a
    // flex track member and let its trigger button fill it.
    :deep(.chat-log__quick-add) {
      display: flex;
      flex: 1 1 44px;
    }

    // Emoji buttons (direct children) and the picker trigger all grow equally
    // and wrap. min-width: 0 lets them shrink below the default button width.
    :deep(.vui-button) {
      flex: 1 1 44px;
      width: auto;
      min-width: 0;
    }
  }

  // Compact quick-reaction strip at the top of the desktop right-click menu.
  &__menu-react {
    display: flex;
    flex-wrap: wrap;
    gap: 2px;
    padding: var(--space-xxs);
  }

  &__menu-react-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 30px;
    height: 30px;
    border-radius: var(--border-radius-m);
    font-size: var(--font-size-l);
    color: var(--color-text-lighter);

    &:hover {
      background-color: var(--color-button-gray-hover);
      color: var(--color-text);
    }

    &--active {
      background-color: color-mix(in srgb, var(--color-bg-accent-lowered) 30%, transparent);
    }
  }

  &__scroll {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    // Native scroll anchoring keeps the viewport steady when older history is
    // prepended at the top, including as images/embeds load in afterwards.
    overflow-anchor: auto;
    background: var(--color-bg-lowered);
    border-radius: var(--border-radius-s);
    border: 1px solid var(--color-border-weak);
    padding: var(--space-s);
    font-family: monospace;
    font-size: var(--chat-font-size, var(--font-size-s));
    display: flex;
    flex-direction: column;
  }

  &__messages {
    flex: 1;

    &--modern {
      font-family: var(--font);
    }
    display: flex;
    flex-direction: column;
    gap: 2px;
    position: relative;

    &--server {
      .chat-log__msg--irc {
        grid-template-columns: 1fr;
      }

      .chat-log__nick-cell {
        display: none;
      }
    }
  }

  &__history-sentinel {
    height: 1px;
    flex-shrink: 0;
  }

  &__history-loading {
    padding: var(--space-xs) 0;
    flex-shrink: 0;
    color: var(--color-text-lighter);
  }

  &__history-start {
    text-align: center;
    font-size: var(--font-size-xs);
    color: var(--color-text-lighter);
    font-style: italic;
    padding: var(--space-xs) 0;
    flex-shrink: 0;
  }

  &__empty {
    color: var(--color-text-lighter);
    font-style: italic;
    flex: 1;
  }

  &__loading {
    flex: 1;
  }

  &__msg {
    position: relative;
    line-height: 1.4;
    word-break: break-word;
    padding: 1px var(--space-xs);
    transition: background-color var(--transition-fast);

    &:hover {
      background: var(--color-bg-medium);
    }

    &--mention {
      background: var(--color-bg-accent-lowered);
      box-shadow: inset 2px 0 0 var(--color-accent);
    }

    &--irc {
      display: grid;
      grid-template-columns: var(--irc-nick-col, 120px) 1fr;
      align-items: start;
      padding: 1px 0;
    }
  }

  &__nick-cell {
    display: flex;
    justify-content: flex-end;
    align-items: center;
    gap: var(--space-xxs);
    overflow: hidden;
    min-width: 0;
    font-size: inherit;
    padding-right: var(--space-xs);

    :deep(.iconify) {
      font-size: 1em !important;
    }
  }

  &__msg-cell {
    min-width: 0;
    font-size: inherit;
  }

  &__nick-divider {
    position: absolute;
    top: 0;
    bottom: 0;
    left: var(--irc-nick-col, 120px);
    width: 8px;
    margin-left: -4px;
    cursor: col-resize;
    z-index: var(--z-active);

    &::before {
      content: '';
      position: absolute;
      left: calc(50% - 0.5px);
      top: 0;
      bottom: 0;
      width: 1px;
      background: var(--color-border);
      opacity: 0;
      transition: opacity var(--transition);
    }

    &:hover::before {
      opacity: 1;
    }

    &--dragging::before {
      opacity: 1;
      background: var(--color-accent);
    }
  }

  :deep(.chat-log__ts) {
    color: var(--color-text-lightest);
    flex-shrink: 0;
    margin-right: auto;
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

  &__relay-badge {
    font-size: var(--font-size-xxs);
    opacity: 0.7;
    :deep(.vui-badge) {
      padding: 1px 4px;
    }
  }

  &__nick-link {
    text-decoration: none;
    color: inherit;
    transition: opacity var(--transition);

    &:hover {
      opacity: 0.8;

      .chat-log__nick {
        text-decoration: underline;
      }
    }
  }

  &__text {
    color: var(--color-text);
    flex: 1;
    min-width: 0;
    font-size: inherit;
    white-space: pre-wrap;
  }

  &__redacted {
    display: inline-flex;
    align-items: center;
    gap: var(--space-xxs);
    font-style: italic;
    color: var(--color-text-lighter);
  }

  &__link {
    color: var(--color-text-blue);
    text-decoration: underline;
    word-break: break-all;
  }

  &__channel-link {
    color: var(--color-accent);
    text-decoration: underline;
    cursor: pointer;
  }

  &__mention-link {
    color: var(--color-accent);
    font-weight: 600;
    text-decoration: none;

    &:hover {
      text-decoration: underline;
    }
  }

  &__embeds {
    padding-top: var(--space-xxs);
  }

  &__image-group {
    display: flex;
    gap: var(--space-xs);
    padding-top: var(--space-xxs);

    .chat-log__embed {
      flex: 1;
      min-width: 0;
      width: 0;
      max-width: none;
      height: 160px;
      max-height: 160px;
    }
  }

  &__embed {
    display: block;
    max-width: 240px;
    max-height: 180px;
    border-radius: var(--border-radius-s);
    overflow: hidden;
    border: 1px solid var(--color-border-weak);
    object-fit: cover;
    cursor: pointer;
  }

  // Block embeds sit in a box pre-sized by embedBox() so the row holds its space
  // before the image paints. A Skeleton fills that box until load, then the image
  // covers it - no growing the layout from zero height.
  &__embed-wrap {
    position: relative;
    display: block;
    overflow: hidden;
    border-radius: var(--border-radius-s);
    border: 1px solid var(--color-border-weak);

    .chat-log__embed {
      width: 100%;
      height: 100%;
      max-width: none;
      max-height: none;
      border: none;
      border-radius: 0;
    }
  }

  &__embed-skeleton {
    position: absolute;
    inset: 0;
  }

  &__embed-video {
    display: block;
    max-width: 320px;
    max-height: 200px;
    border-radius: var(--border-radius-s);
    border: 1px solid var(--color-border-weak);
    cursor: pointer;
  }

  span {
    font-size: var(--chat-font-size, var(--font-size-s));
  }

  // IRC mode: images inline with text at font height
  &__embed--inline {
    display: inline;
    margin-left: var(--space-xxs);
    height: 1em;
    width: auto;
    max-width: 2em;
    max-height: none;
    vertical-align: middle;
    border: none;
    border-radius: 0;
  }

  &__msg &__embed-video {
    max-width: 80px;
    max-height: 48px;
  }

  &__msg--system &__text {
    color: var(--color-text-lighter);
    font-style: italic;
  }

  &__msg--error &__text {
    color: var(--color-text-red);
  }

  &__msg--service {
    background: transparent;
    opacity: 1;

    &.chat-log__nick {
      color: var(--color-text-lightest);
    }

    .chat-log__nick {
      color: var(--color-text-lightest);
    }

    .chat-log__text {
      color: var(--color-text-lightest);

      span {
        font-size: var(--chat-font-size, var(--font-size-s));
      }
    }
  }

  &__msg--join &__text {
    color: var(--color-text-green);
  }

  &__msg--part &__text {
    color: var(--color-text-yellow);
  }

  &__msg--action &__text {
    display: inline;
    font-style: italic;
    color: var(--color-text-light);
  }

  &__nick--action {
    margin-right: 0.35em;

    &::after {
      content: '';
    }
  }

  &__action-star {
    color: var(--color-text-lighter);
    font-size: inherit;
    flex-shrink: 0;
  }

  &__server-line {
    display: flex;
    align-items: baseline;
    gap: var(--space-xs);
    padding: var(--space-xxs) var(--space-s);
    line-height: 1.4;
    word-break: break-word;
    border-radius: var(--border-radius-xs);
    transition: background-color var(--transition-fast);

    &:hover {
      background: var(--color-bg-medium);
    }
  }

  &__server-text {
    font-size: var(--chat-font-size, var(--font-size-s));
    color: var(--color-text-light);
  }

  &__action-line {
    display: flex;
    align-items: baseline;
    gap: var(--space-xs);
    padding: var(--space-xxs) var(--space-s);
    line-height: 1.4;
    word-break: break-word;
    border-radius: var(--border-radius-xs);
    transition: background-color var(--transition-fast);

    &:hover {
      background: var(--color-bg-medium);
    }
  }

  &__action-text {
    font-style: italic;
    color: var(--color-text-light);
    font-size: var(--chat-font-size, var(--font-size-s));
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
    font-size: var(--chat-font-size, var(--font-size-s));

    :deep(.iconify) {
      font-size: 1em !important;
    }
  }

  &__line-react {
    position: absolute;
    right: 0;
    top: 0;
    opacity: 0;
    display: flex;
    align-items: center;
    gap: 1px;
    padding: 1px;
    height: calc(var(--chat-font-size, var(--font-size-s)) * 1.5 + 2px);
    pointer-events: none;
    transition: opacity var(--transition-fast);
    background: var(--color-bg-raised);
    border-radius: var(--border-radius-m);
    // Outset ring + drop shadow makes the toolbar pop without shifting layout.
    box-shadow:
      0 0 0 1px var(--color-border),
      var(--box-shadow);

    &:has(.reactions-anchor-active) {
      opacity: 1;
      pointer-events: auto;
    }

    @media (pointer: fine) {
      .chat-log__modern-line:hover &,
      .chat-log__msg:hover & {
        opacity: 1;
        pointer-events: auto;
      }
    }

    @media (pointer: coarse) {
      display: none;
    }

    :deep(.reactions__button),
    .chat-log__line-reply-btn {
      height: calc(var(--chat-font-size, var(--font-size-s)) * 1.5);
      width: calc(var(--chat-font-size, var(--font-size-s)) * 1.5);
      color: var(--color-text-lighter);
      font-size: var(--chat-font-size, var(--font-size-s));
    }

    .chat-log__line-reply-btn {
      display: flex;
      justify-content: center;
      align-items: center;
      border-radius: var(--border-radius-m);

      &:hover {
        background-color: var(--color-button-gray-hover);
      }
    }

    // Quick-reaction emoji shown inline so common reactions are one click away.
    .chat-log__line-react-emote {
      display: flex;
      align-items: center;
      justify-content: center;
      height: calc(var(--chat-font-size, var(--font-size-s)) * 1.5);
      min-width: calc(var(--chat-font-size, var(--font-size-s)) * 1.5);
      padding: 0 2px;
      border-radius: var(--border-radius-m);
      font-size: var(--chat-font-size, var(--font-size-s));
      line-height: 1;

      &:hover {
        background-color: var(--color-button-gray-hover);
      }

      &--active {
        background-color: color-mix(in srgb, var(--color-bg-accent-lowered) 30%, transparent);
      }
    }
  }

  &__group-react {
    opacity: 0;
    pointer-events: none;
    transition: opacity var(--transition-fast);

    // Keep visible while the picker popout is open.
    &:has(.reactions-anchor-active) {
      opacity: 1;
      pointer-events: auto;
    }

    // Desktop: reveal on group hover.
    @media (pointer: fine) {
      .chat-log__group:hover & {
        opacity: 1;
        pointer-events: auto;
      }
    }

    // Touch: no hover affordance.
    @media (pointer: coarse) {
      display: none;
    }

    :deep(.reactions__button) {
      height: 22px;
      width: 22px;
      color: var(--color-text-lighter);
    }
  }

  :deep(.chat-log__ts--inline) {
    font-size: calc(var(--chat-font-size, var(--font-size-s)) * 0.85);
    color: var(--color-text-lightest);
  }

  &__new-divider {
    display: flex;
    align-items: center;
    gap: var(--space-s);
    padding: var(--space-xs) var(--space-xs);
    color: var(--color-accent);
    cursor: pointer;

    span {
      font-size: var(--chat-font-size, var(--font-size-s));
      text-transform: uppercase;
      letter-spacing: 0.05em;
      font-weight: 600;
    }

    &::before,
    &::after {
      content: '';
      flex: 1;
      height: 1px;
      background: var(--color-accent);
      opacity: 0.4;
    }

    &:hover::before,
    &:hover::after {
      opacity: 0.7;
    }
  }

  &__histserv-divider {
    display: flex;
    align-items: center;
    gap: var(--space-s);
    padding: var(--space-xs) var(--space-xs);
    color: var(--color-text-lighter);
    font-size: var(--chat-font-size, var(--font-size-s));

    &::before,
    &::after {
      content: '';
      flex: 1;
      height: 1px;
      background: var(--color-border-weak);
    }

    &__text {
      white-space: normal;
      flex-shrink: 1;
      min-width: 0;
      font-size: var(--chat-font-size, var(--font-size-s));
    }
  }

  &__modern-line {
    position: relative;
    font-size: var(--chat-font-size, var(--font-size-s));
    color: var(--color-text);
    white-space: pre-wrap;
    word-break: break-word;
    line-height: 1.4;
    border-radius: var(--border-radius-xs);
    transition: background-color var(--transition-fast);

    &:hover {
      background: var(--color-bg-medium);
    }

    // reactions__list uses display:contents globally so its children bleed
    // inline into the text. Override it here so reactions form their own row.
    :deep(.reactions__list) {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-xxs);
      margin-top: var(--space-xxs);
    }

    &--mention {
      background: var(--color-bg-accent-lowered);
      box-shadow: inset 2px 0 0 var(--color-accent);
      padding: 1px var(--space-xs);
      margin: 0 calc(-1 * var(--space-xs));
      border-radius: 0;
    }
  }

  &__reply-quote {
    display: flex;
    align-items: center;
    gap: var(--space-xxs);
    font-size: var(--font-size-xs);
    color: var(--color-text-light);
    padding: var(--space-xxs) var(--space-xs);
    border-left: 2px solid var(--color-border-strong);

    .chat-log__modern-line & {
      border-left: none;
    }
    margin-bottom: var(--space-xxs);
    overflow: hidden;
    white-space: nowrap;
    cursor: default;
    transition:
      background var(--transition-fast),
      color var(--transition-fast);

    &--clickable {
      cursor: pointer;

      &:hover {
        background: var(--color-bg-raised);
        color: var(--color-text-light);
      }
    }
  }

  @keyframes chat-jump-highlight {
    0% {
      background-color: color-mix(in srgb, var(--color-accent) 20%, transparent);
    }
    100% {
      background-color: transparent;
    }
  }

  &__msg--jump-highlight,
  &__modern-line--jump-highlight {
    animation: chat-jump-highlight 1.5s ease-out forwards;
    border-radius: var(--border-radius-xs);
  }

  &__reply-nick {
    font-weight: 600;
    color: var(--color-text-light);
    flex-shrink: 0;
  }

  &__reply-source {
    flex-shrink: 0;
    font-size: calc(var(--chat-font-size, var(--font-size-s)) * 0.8);
    line-height: 1;

    :deep(.vui-avatar) {
      border-radius: 50%;
    }

    :deep(.iconify) {
      color: var(--color-text) !important;
      font-size: 1em !important;
    }
  }

  &__reply-text {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  // Prevent text selection during long-press on touch devices only.
  @media (pointer: coarse) {
    &__msg,
    &__modern-line,
    &__group {
      -webkit-user-select: none;
      user-select: none;
    }
  }
}
</style>

<style lang="scss">
// The Sheet teleports its card to <body> and spreads our class onto the card
// root, so a scoped :deep can't reach the header. The card's `padding: false`
// adds vui's `.no-padding` rule (`padding: 0 !important`), so out-specify it and
// match the !important to restore header padding (incl. the close button). The
// content stays unpadded since each section manages its own spacing.
.chat-log__drawer-sheet.vui-card.no-padding > .vui-card-header {
  padding: var(--space-s) var(--space-m) !important;
}
</style>
