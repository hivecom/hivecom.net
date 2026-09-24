// ─────────────────────────────────────────────────────────────────────────────
// Singleton IRC-over-WebSocket client.
//
// All connection state lives at module scope so the socket survives route
// changes and stays in sync between the navbar chat sheet and the full `/chat`
// page. The WebSocket is only ever created in the browser.
//
// ## Hot-swap boundary
// Orbit will replace this module wholesale when it ships as an embeddable
// webapp. The rest of the site must only touch the public API returned by
// `useIrcChat()`, never internal IRC details. Keep that API small and
// presentation-agnostic.
//
// ## Identity (OIDC)
// The client sends a Supabase JWT as the SASL PLAIN password, and an Ergo
// `auth-script` bridge verifies it against the provider's JWKS. The token comes
// from the site's existing session via the `registerIdentityProvider` seam. When
// Orbit becomes a cross-origin iframe, only that seam changes (the token arrives
// via postMessage).
//
// If SASL fails, registration continues without a verified account.
// ─────────────────────────────────────────────────────────────────────────────

import type { StoredBufferMeta, StoredMessage } from '@/lib/chat/bufferCache'
import type { SoundDesign } from '@/types/sound'
import { rememberIrcChannel } from '@/composables/useIrcChannelNames'
import { clearChatCache, deleteBufferMessages, deleteBufferMeta, loadAllBufferMeta, loadNewerMessages, loadOlderMessages, loadRecentMessages, makeBufferKey, pruneBuffer, upsertBufferMeta, upsertMessages } from '@/lib/chat/bufferCache'
import { markdownToIrc } from '@/lib/ircFormat'
import { NONE_SOUND_ID, playNotificationSound } from '@/lib/notificationSound'

const WS_URL = 'wss://irc.hivecom.net:8097'
const DEFAULT_CHANNEL_DEV = '#playground'
const DEFAULT_CHANNEL_ANON = '#public'
const DEFAULT_CHANNEL_AUTH = '#lounge'

function defaultChannel(anon: boolean): string {
  if (import.meta.dev && !anon)
    return DEFAULT_CHANNEL_DEV

  return anon ? DEFAULT_CHANNEL_ANON : DEFAULT_CHANNEL_AUTH
}
const STORAGE_NICK = 'hivecom.chat.nick'
const STORAGE_CHANNEL = 'hivecom.chat.channel'

// '1' when the persisted nick/channel belong to a signed-in session. Cleared on a
// signed-out load so the connect form doesn't prefill a nick that would fail auth.
const STORAGE_IDENTITY_AUTHED = 'hivecom.chat.identity-authed'

// '1' once this browser has ever connected signed-in. Sticky, so the connect form
// can default a returning user to the sign-in prompt.
const STORAGE_HAD_ACCOUNT = 'hivecom.chat.had-account'

// Timestamp (ms) of the most recent live message we've seen. Used as the lower
// bound for CHATHISTORY TARGETS / LATEST on reconnect so we only pull missed DMs.
const STORAGE_LASTSEEN = 'hivecom.chat.lastseen'

// Map of lowercased DM nick -> timestamp (ms) when the user closed that query.
// Suppresses auto-reopening closed DMs unless newer activity exists.
const STORAGE_CLOSED_DMS = 'hivecom.chat.closeddms'

// Map of lowercased channel/pm name -> timestamp (ms) when the user last read it.
const STORAGE_READ_POSITIONS = 'hivecom.chat.readpos'

// Cached NickServ identity state to avoid indicator flash on reconnect.
const STORAGE_IDENTITY_EMAIL = 'hivecom.chat.identity-email'
const STORAGE_IDENTITY_ALWAYS_ON = 'hivecom.chat.identity-always-on'
const STORAGE_IDENTITY_DM_HISTORY = 'hivecom.chat.identity-dm-history'
const STORAGE_IDENTITY_DM_HISTORY_EFFECTIVE = 'hivecom.chat.identity-dm-history-effective'

// Cached channel appearance metadata (display-name, avatar, color, homepage) for
// instant display before the IRC connection delivers METADATA responses.
const STORAGE_CHANNEL_META = 'hivecom.chat.channel-meta'
const APPEARANCE_KEYS: ReadonlySet<string> = new Set(['display-name', 'avatar', 'color', 'homepage', 'subchannels'])

// Cached channel modes/flags (e.g. 'i', 'm', 'k', 'l') for instant display
// before the IRC connection delivers a MODE query response after rejoin.
const STORAGE_CHANNEL_MODES = 'hivecom.chat.channel-modes'

// The channel key (k) is a join password. Keep the 'k' flag so the UI can show
// "password protected", but never write the secret to localStorage.
const UNCACHED_MODE_PARAMS: ReadonlySet<string> = new Set(['k'])

// How far back to look for missed DMs when there is no stored cursor.
const DEFAULT_HISTORY_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000

// Clock-skew fuzz applied to history bound timestamps.
const HISTORY_FUZZ_MS = 5000

// Max messages / targets per CHATHISTORY request.
const HISTORY_LIMIT = 50

// Wait for the server to restore an always-on account's channels before joining
// the default. Each restored JOIN resets the timer.
const DEFAULT_CHANNEL_SETTLE_MS = 1500

// Synthetic buffer that holds connection-level/system output before any channel
// is joined. Never sent to the server.
const SERVER_BUFFER = '*'

const WANTED_CAPS = [
  'sasl',
  'batch',
  'message-tags',
  'message-ids',
  'labeled-response',
  'echo-message',
  'server-time',
  'multi-prefix',
  'account-tag',
  'account-notify',
  'extended-join',
  // away-notify: real-time AWAY/online presence updates in the user list
  'away-notify',
  // draft/pre-away: smooth presence transitions before disconnect
  'draft/pre-away',
  // draft/read-marker: server-side read position sync across sessions
  'draft/read-marker',
  // setname: display-name fallback for servers without draft/metadata-2
  'setname',
  'draft/chathistory',
  // Without this, Ergo replays stored TAGMSGs (reactions) as data-less HistServ
  // PRIVMSG placeholders (#1676). It also replays JOIN/PART/QUIT/NICK/MODE inside
  // history batches, so those handlers guard on `backlog`.
  'draft/event-playback',
  'draft/metadata-2',
  // draft/channel-rename: rename a channel in place, preserving membership,
  // modes, topic and lists, instead of part+join to a fresh channel.
  'draft/channel-rename',
  // draft/message-redaction: delete messages (own messages, or others' as op).
  'draft/message-redaction',
  // draft/webpush: server-sent Web Push while we're disconnected. Ergo advertises
  // its VAPID key in the `VAPID` ISUPPORT token once this is enabled.
  'draft/webpush',
  // draft/relaymsg: the tag names the relay bot behind a spoofed nick.
  'draft/relaymsg',
  // draft/multiline: one logical message via BATCH instead of a PRIVMSG per line.
  // The cap value carries max-bytes / max-lines.
  'draft/multiline',
]

export type ConnState = 'disconnected' | 'connecting' | 'connected' | 'error' | 'offline'

export interface ChatMessage {
  id: number
  ts: Date
  type: 'chat' | 'system' | 'error' | 'join' | 'part' | 'tagmsg'
  from?: string
  channel?: string
  text: string

  /** Server-assigned message ID (from message-ids cap). */
  msgid?: string

  /** msgid of the message this is replying to (+reply tag). */
  replyTo?: string

  /** True for messages replayed from server-side history (CHATHISTORY batch). */
  backlog?: boolean

  /** True for CTCP ACTION messages (/me). */
  action?: boolean

  /** IRCv3 tag key(s) from an unknown TAGMSG, comma-separated. */
  tag?: string

  /**
   * Emoji reactions on this message (IRCv3 +draft/react), keyed by reaction
   * value to the nicks who reacted. Empty values are pruned on the last unreact.
   */
  reactions?: Record<string, string[]>
  /** True once the message has been deleted via IRCv3 draft/message-redaction. */
  redacted?: boolean

  /** Nick that performed the redaction (may be the author or a channel op). */
  redactedBy?: string

  /** Optional reason supplied with the REDACT command. */
  redactedReason?: string

  /** True once the message has been edited (reserved for future edit support). */
  edited?: boolean

  /** When set, this message was relayed by a bridge bot; value is the real bot nick. */
  relayedBy?: string

  /**
   * Local-only: we've shown this message optimistically and are waiting for the
   * server to echo it back (echo-message). Renders dimmed until it lands.
   */
  pending?: boolean

  /**
   * Local-only: the echo never arrived (socket died or the wait timed out), so
   * the message most likely never made it to the server.
   */
  failed?: boolean
}

export type BufferKind = 'server' | 'channel' | 'pm'

export interface ChatBuffer {
  name: string
  kind: BufferKind
  messages: ChatMessage[]
  users: ChatUser[]
  unread: number
  mentions: number
  joined: boolean

  /** Nicks currently showing a typing indicator in this buffer (transient, client-only). */
  typing?: string[]
  topic?: string

  /** Timestamp (ms) of the last-read boundary. Messages with ts > this are "new". */
  readLineTs?: number

  /** True after the first CHATHISTORY LATEST batch has completed for this buffer. */
  historyReady?: boolean

  /** True once a CHATHISTORY response returned fewer than HISTORY_LIMIT messages. */
  historyExhausted?: boolean

  /** True while a CHATHISTORY BEFORE request is in-flight for this buffer. */
  loadingOlderHistory?: boolean

  /** Number of consecutive auto-fetch retries after sparse batches. Capped to prevent runaway loops. */
  autoFetchRetries?: number

  /** msgid to anchor the next BEFORE request on. Tracks the oldest delivered line, even lines not stored in the buffer (reactions, suppressed relays). */
  historyAnchorMsgid?: string

  /** Timestamp (ISO) to anchor the next BEFORE request on when no msgid is available. */
  historyAnchorTs?: string

  /** Active channel mode flags (e.g. 'k' = password, 'i' = invite-only, 'm' = moderated). */
  modes?: Set<string>
  /** Metadata key-value pairs received via IRCv3 draft/metadata-2. */
  metadata?: Map<string, string>
  /** Parameter values for parameterized modes (e.g. 'H' => '100:7d', 'f' => '#fallback'). */
  modeParams?: Map<string, string>
  /** Ban list entries fetched via MODE +b. */
  banList?: Array<{ mask: string, setBy: string, ts: number }>
  /** Ban exception list (+e). */
  exceptList?: Array<{ mask: string, setBy: string, ts: number }>
  /** Invite exception list (+I). */
  inviteList?: Array<{ mask: string, setBy: string, ts: number }>
  banListReady?: boolean
  exceptListReady?: boolean
  inviteListReady?: boolean

  /** Whether the channel is registered with ChanServ. undefined = not yet queried. */
  registered?: boolean

  /** Founder nick reported by ChanServ INFO. */
  founder?: string

  /** Channel creation timestamp (Unix ms) from RPL_CREATIONTIME (329). */
  createdAt?: number

  /** True once the local IndexedDB cache has no older messages for this buffer. Falls back to CHATHISTORY BEFORE when set. */
  cacheExhausted?: boolean

  /** True when the live buffer tail was trimmed during scroll-back. seekToPresent must re-seed from cache before scrolling to bottom. */
  tailTrimmed?: boolean

  /** True while a forward cache-load (fetchNewerFromCache) is in-flight. */
  loadingNewerHistory?: boolean

  /**
   * Newest cached timestamp (ms) that scroll-back must page BEFORE down to before
   * trusting the cache again. Set when a reconnect leaves a gap between cached and
   * freshly fetched LATEST messages. Cleared once a BEFORE batch reaches the cache.
   */
  cacheBridgeTs?: number

  /**
   * Transient: newest cached timestamp (ms) captured at JOIN, before the LATEST
   * batch merges in, so the batch-end handler can detect a reconnect gap.
   */
  pendingBridgeFromTs?: number
}

export interface ChannelListEntry {
  name: string
  userCount: number
  topic: string
  modes?: Set<string>
}

export interface ChatUser {
  name: string

  /** Mode prefix chars, highest privilege first (e.g. "@", "+", "~@"). Empty when none. */
  prefix: string

  /** True when the server reports this user as a bot (WHO flag B / user mode +B). */
  bot?: boolean

  /** True when the user is marked away (WHO flag G / away-notify AWAY). */
  away?: boolean
}

/** Identity supplied by the host app (the website's Supabase session). */
export interface ChatIdentity {
  username: string
  token: string
}
export type IdentityProvider = () => Promise<ChatIdentity | null> | ChatIdentity | null

const MODE_PREFIX_RE = /^[~&@%+]+/

// IRC service bots whose messages should never generate mention notifications.
export const SERVICE_NICKS = new Set(['histserv', 'nickserv', 'chanserv'])

// Label for the DM-with-yourself buffer, a private space for notes and sharing
// between your own devices.
export const SELF_SPACE_LABEL = 'Your Space'

// IRC channel-membership prefixes ordered from highest to lowest privilege.
const PREFIX_ORDER = '~&@%+'

const MODE_TO_PREFIX: Record<string, string> = { q: '~', a: '&', o: '@', h: '%', v: '+' }

// Non-prefix channel modes that consume a parameter, so we can keep MODE parsing aligned.
const PARAM_MODES_ALWAYS = new Set(['b', 'e', 'I', 'k'])
const PARAM_MODES_ON_SET = new Set(['l', 'f', 'j'])

// --- Shared reactive state ---------------------------------------------------
const connState = ref<ConnState>('disconnected')

// True once RPL_WELCOME has been seen this session. Survives socket drops so the
// UI rides out a reconnect in place. Only an intentional disconnect() clears it.
const everConnected = ref(false)
const nick = ref('')
const account = ref('')
const buffers = ref<ChatBuffer[]>([])

// Service-bot chatter (NickServ/ChanServ/HistServ). Reactive for debugging, but
// never rendered to the user.
const serviceLog = ref<ChatMessage[]>([])
const activeName = ref<string>(SERVER_BUFFER)
const previousActiveName = ref<string>(SERVER_BUFFER)

// True only after an explicit setActive('*'), so the no-channels prompt shows by
// default instead of the server log.
const serverLogPinned = ref(false)
const msgCounter = ref(0)
const SIDEBAR_HIDDEN_KEY = 'hivecom.chat.sidebar-hidden'
const sidebarHidden = ref(
  import.meta.client && localStorage.getItem(SIDEBAR_HIDDEN_KEY) === 'true',
)
const FULL_WIDTH_KEY = 'hivecom.chat.full-width'
const chatFullWidth = ref(
  import.meta.client && localStorage.getItem(FULL_WIDTH_KEY) === 'true',
)

// null = not yet checked; '' = confirmed absent (unclaimed); string = email present (claimed)
const accountEmail = ref<string | null>(null)

// null = not yet determined; true/false parsed from NickServ INFO Flags line
const accountAlwaysOn = ref<boolean | null>(null)

// NickServ dm-history setting. Ergo reports 'default' | 'disabled' | 'ephemeral' | 'persistent';
// null = not yet determined. Only effective while always-on is enabled.
export type DmHistorySetting = 'default' | 'disabled' | 'ephemeral' | 'persistent'
const DM_HISTORY_VALUES: ReadonlySet<string> = new Set(['default', 'disabled', 'ephemeral', 'persistent'])
const accountDmHistory = ref<DmHistorySetting | null>(null)

// What the stored preference resolves to under current server settings, parsed
// from the "Given current server settings" follow-up notice. This is how we
// know what 'default' actually means without hardcoding server config.
const accountDmHistoryEffective = ref<DmHistorySetting | null>(null)

// Per-nick draft/metadata-2 values keyed by lowercased nick, so avatars and
// display names work without an open PM buffer.
const userMetaStore = ref(new Map<string, Map<string, string>>())

function setUserMeta(targetNick: string, key: string, value: string | null) {
  const lc = targetNick.toLowerCase()
  const existing = userMetaStore.value.get(lc)
  const entry = new Map(existing)
  if (value == null || value === '')
    entry.delete(key)
  else
    entry.set(key, value)
  const store = new Map(userMetaStore.value)
  store.set(lc, entry)
  userMetaStore.value = store
}

// --- WHOIS structured results -----------------------------------------------
export interface WhoisData {
  nick: string
  user?: string
  host?: string
  realname?: string
  server?: string
  serverInfo?: string
  idleFmt?: string
  signonTs?: string
  channels?: string
  account?: string
  away?: string
  isOper?: boolean
  secure?: boolean
  loading: boolean
  notFound?: boolean
}
const _whoisStore = ref<Map<string, WhoisData>>(new Map())
export const whoisStore = _whoisStore

// --- Channel list (populated by LIST/322/323) --------------------------------
const channelList = ref<ChannelListEntry[]>([])

// Channel metadata keyed by lowercase name, including channels we aren't joined
// to. draft/metadata-2 allows GET/LIST on any channel, so parents in the nesting
// tree can be shown without joining.
const channelMetaCache = ref<Map<string, Map<string, string>>>(new Map())

// Channels we've issued a background METADATA LIST for: dedupes probes and lets
// us swallow the resulting FAILs (a missing or permission-denied parent is normal).
const _backgroundMetaTargets = new Set<string>()

// Channels for which a background METADATA LIST response has been received
// (either data or FAIL). Lets consumers distinguish "pending" from "no data".
const channelMetaResolved = ref<Set<string>>(new Set())

// Channel modes keyed by lowercase name, cached so flags show instantly on
// reload. The 'k' param is never persisted.
const channelModesCache = ref<Map<string, { modes: Set<string>, params: Map<string, string> }>>(new Map())
const channelListLoading = ref(false)
const channelBrowserOpen = ref(false)

// When non-null, a password-protected channel denied our JOIN and we need a key.
const channelKeyPrompt = ref<string | null>(null)

// True when the most recent key attempt was rejected (475).
const channelKeyError = ref(false)
const channelSettingsOpen = ref<string | null>(null)

// When non-null, a join was blocked by the server (e.g. registration required). Holds channel name + reason.
const channelJoinBlocked = ref<{ channel: string, reason: string } | null>(null)

// When non-null, a destructive moderation action (kick/kickban) is awaiting confirmation.
const moderationPrompt = ref<{ action: 'kick' | 'kickban', nick: string, channel: string } | null>(null)

// Form / draft state, shared so both surfaces edit the same values.
const inputNick = ref('')
const inputChannel = ref('')
const inputMessage = ref('')
const replyTarget = ref<ChatMessage | null>(null)
let focusComposerFn: (() => void) | null = null

// Extra words (besides the current nick) that count as a mention. Pushed in via
// `setMentionKeywords` so this module stays decoupled from settings.
const mentionKeywords = ref<string[]>([])

export function setMentionKeywords(words: string[]) {
  mentionKeywords.value = words.map(w => w.trim()).filter(w => w.length > 0)
}

// Whether to fire browser Notifications on mentions. Sourced from user settings.
const browserNotificationsEnabled = ref(false)

export function setBrowserNotificationsEnabled(enabled: boolean) {
  browserNotificationsEnabled.value = enabled
}

// Notification-sound preferences, sourced from user settings. A cue is disabled
// when its choice is the `none` id; otherwise it's a preset id, `custom` (plays
// the matching URL), or `design` (plays the matching tone sequence).
const soundMentionChoice = ref(NONE_SOUND_ID)
const soundMessageChoice = ref(NONE_SOUND_ID)
const soundMentionUrl = ref('')
const soundMessageUrl = ref('')
const soundMentionDesign = ref<SoundDesign | null>(null)
const soundMessageDesign = ref<SoundDesign | null>(null)

// 0-1 fraction applied to every cue.
const soundVolume = ref(1)

export function setNotificationSounds(opts: {
  mentionChoice: string
  messageChoice: string
  mentionUrl: string
  messageUrl: string
  mentionDesign: SoundDesign | null
  messageDesign: SoundDesign | null
  volume: number
}) {
  soundMentionChoice.value = opts.mentionChoice
  soundMessageChoice.value = opts.messageChoice
  soundMentionUrl.value = opts.mentionUrl
  soundMessageUrl.value = opts.messageUrl
  soundMentionDesign.value = opts.mentionDesign
  soundMessageDesign.value = opts.messageDesign
  soundVolume.value = opts.volume
}

// Per-channel last-read timestamps, keyed by lowercased channel/pm name.
let readPositions: Record<string, number> = {}

// Set when draft/read-marker CAP is negotiated successfully.
let readMarkerActive = false

// Recount unread/mention badges against the current read marker. When another
// session advances the marker (a pushed MARKREAD), the stale badge here has to
// clear too. Must match the badge gating in addToBuffer.
function reconcileUnread(buf: ChatBuffer) {
  const marker = readPositions[buf.name.toLowerCase()] ?? 0
  let unread = 0
  let mentions = 0
  for (const m of buf.messages) {
    if (m.ts.getTime() <= marker)
      continue
    if (m.type !== 'chat' || m.from == null || m.from === nick.value || SERVICE_NICKS.has(m.from.toLowerCase()))
      continue

    unread += 1

    // PMs are always a ping (service nicks already excluded above); channels
    // only when the line actually mentions you.
    if (buf.kind === 'pm' || mentionsSelf(m.text))
      mentions += 1
  }
  buf.unread = unread
  buf.mentions = mentions

  if (unread === 0)
    buf.readLineTs = undefined
}

function saveReadPosition(name: string, ts: number, opts: { sync?: boolean } = {}) {
  const key = name.toLowerCase()

  // The read marker only advances. Replayed history can land after a newer
  // system line (e.g. "You joined"), so don't let it move backwards.
  if ((readPositions[key] ?? 0) >= ts)
    return

  readPositions[key] = ts
  if (import.meta.client)
    localStorage.setItem(STORAGE_READ_POSITIONS, JSON.stringify(readPositions))

  // Only walk the buffer when there's a stale badge to clear (cross-device or
  // catch-up), so the per-message pin on the active buffer stays O(1).
  const buf = findBuffer(name)
  if (buf && (buf.unread || buf.mentions))
    reconcileUnread(buf)

  // Skipped for markers that came from the server (pushed MARKREAD) so we don't
  // echo them straight back.
  if (readMarkerActive && opts.sync !== false)
    send(`MARKREAD ${name} timestamp=${new Date(ts).toISOString()}`)
}

let ws: WebSocket | null = null
let initialised = false
let _readWatcherRegistered = false

// --- Local buffer cache (IndexedDB) ---
// Messages seeded into the live buffer on startup from the per-message IDB store.
const CACHE_SEED_COUNT = 150

// Page size for cache-first scroll-back. Matches HISTORY_LIMIT so cache and
// server pages advance in even steps.
const CACHE_PAGE_SIZE = 50

// Cap on messages in the live reactive buffer. Scroll-back trims the newest end,
// so DOM size stays bounded while IDB holds the full history.
const MAX_LIVE_MESSAGES = 300

// Trims wait until the rendered log is this many viewports tall. Collapsed
// join/part runs and hidden TAGMSGs render far shorter than their count, and
// trimming a short log makes MessageLog's top and bottom loaders oscillate.
const MIN_TRIM_SCREENS = 6

// MessageLog's scroll element, so the trim gate can measure rendered height.
// Null (chat not rendered) permits trimming.
let _liveLogEl: HTMLElement | null = null

function setLiveLogEl(el: HTMLElement | null) {
  _liveLogEl = el
}

function releaseLiveLogEl(el: HTMLElement | null) {
  if (_liveLogEl === el)
    _liveLogEl = null
}

function windowTrimAllowed(): boolean {
  if (typeof window === 'undefined' || !_liveLogEl?.isConnected)
    return true

  return _liveLogEl.scrollHeight >= (window.innerHeight || 800) * MIN_TRIM_SCREENS
}

// Per-buffer IDB message cap. Updated reactively from user settings via setCacheCap().
let _cacheCap = 10000

let _cacheHydrating = false

// Pending per-message IDB writes, keyed by `${bufferKey}|${msgid}` so that
// mutations (reactions, redactions) overwrite the previous version in the queue.
const _pendingMsgWrites = new Map<string, StoredMessage>()
let _msgFlushTimer: ReturnType<typeof setTimeout> | null = null
let _intentionalDisconnect = false
let _skipAutoJoin = false

// Default channel to join if the settle timer fires and nothing was restored
// (null = nothing pending).
let _defaultChannelFallback: string | null = null
let _defaultChannelFallbackTimer: ReturnType<typeof setTimeout> | null = null

// Set on a fatal connect failure (e.g. nick in use) that must not auto-reconnect.
// Unlike _intentionalDisconnect, it keeps the 'error' state visible.
let _fatalError = false
let _reconnectAttempts = 0
const MAX_RECONNECT_ATTEMPTS = 3
let _reconnectTimer: ReturnType<typeof setTimeout> | null = null

// Whether any chat UI surface (sheet or full page) is currently visible to the
// user. The read watcher only clears unread/mentions when this is true.
const isChatVisible = ref(false)

// Programmatic open signal for the chat sheet.
const chatSheetOpen = ref(false)

// Most recent live message timestamp (ms); persisted as the CHATHISTORY cursor.
let lastSeenTs = 0

// Lowercased DM nick -> timestamp (ms) when user closed that query.
let closedDms: Record<string, number> = {}

// --- Latency tracking -------------------------------------------------------
const latencyMs = ref<number | null>(null)
let _pingToken: string | null = null
let _pingAt = 0
let _pingInterval: ReturnType<typeof setInterval> | null = null

function _sendLatencyPing() {
  if (connState.value !== 'connected' || !ws)
    return

  _pingToken = `hc-lat-${Date.now()}`
  _pingAt = Date.now()
  send(`PING :${_pingToken}`)
}

function _startPinging() {
  _stopPinging()
  _sendLatencyPing()
  _pingInterval = setInterval(_sendLatencyPing, 30_000)
}

function _stopPinging() {
  if (_pingInterval != null) {
    clearInterval(_pingInterval)
    _pingInterval = null
  }
  _pingToken = null
  latencyMs.value = null
}

// --- Identity seam -----------------------------------------------------------
let identityProvider: IdentityProvider | null = null

/**
 * Register the host's identity provider, which resolves the Supabase session into
 * `{ username, token }` (null when signed out). This is the only place that knows
 * where the JWT comes from, which keeps the Orbit swap cheap.
 */
export function registerIdentityProvider(fn: IdentityProvider | null) {
  identityProvider = fn
}

// --- CAP / SASL negotiation state --------------------------------------------
let capLs: string[] = []
let saslMech: 'PLAIN' | 'ANONYMOUS' | null = null
let authCreds: ChatIdentity | null = null
let useAnonymous = false
let saslFailed = false
const chatHistorySupported = ref(false)

// True when the server ACKs draft/message-redaction, enabling the REDACT command.
const redactionSupported = ref(false)

// Separator character(s) for draft/relaymsg spoofed nicks (e.g. "/" for "user/bridge").
const relaySeparator = ref<string | null>(null)

// Server VAPID public key (URL-safe base64) from the `VAPID` ISUPPORT token, used
// to create the browser push subscription for draft/webpush. Null until 005 lands.
const vapidKey = ref<string | null>(null)
let echoMessageActive = false

/**
 * What it takes to resend an outgoing message, kept until the server confirms it.
 *
 * Never flushed automatically on reconnect: that would post messages the user
 * has since thought better of, into a room they may have left. Resending is
 * always explicit.
 */
interface OutboxEntry {
  /** Buffer the message was sent to, and the kind needed to re-open it. */
  target: string
  kind: BufferKind

  /** Wire text as it went out, markdown already converted to IRC codes. */
  text: string

  /** True for a CTCP ACTION (/me). */
  action: boolean

  /** msgid this send was replying to, if any. */
  replyTo?: string

  /** Gives up on the echo and flags the line as undelivered. Cleared once settled. */
  timer?: ReturnType<typeof setTimeout>
}

// Outgoing messages not yet confirmed by the server, keyed by the local message id
// of the line showing them. Entries are dropped when the echo lands, and kept for
// failed sends so the user can resend or discard them.
const outbox = new Map<number, OutboxEntry>()

// How long we wait for the echo before flagging the line as undelivered.
const PENDING_ECHO_TIMEOUT = 15_000

// Don't let a replayed message from long ago absorb a stale pending line.
const PENDING_ECHO_MAX_SKEW = 5 * 60 * 1000
let probingNickServInfo = false

// True once the NickServ INFO probe for the current session has resolved (or timed out).
const accountInfoFetched = ref(false)
let probeTimer: ReturnType<typeof setTimeout> | null = null
let suppressingNickServOp = false

// ChanServ INFO probes keyed by lowercase channel name.
const _probingChanServChannels = new Set<string>()
const _chanServProbeTimers = new Map<string, ReturnType<typeof setTimeout>>()

// Channels awaiting ChanServ DROP confirmation code (two-step flow).
const _pendingDropChannels = new Set<string>()
let messageTagsActive = false

// draft/multiline limits come from the CAP LS value. multilineRef numbers the
// batch reference tags on outgoing sends.
let multilineActive = false
let multilineMaxBytes = 0
let multilineMaxLines = 0
let multilineRef = 0

// Per-target timestamp (ms) of the last typing notification we sent, for throttling.
const lastTypingSent = new Map<string, number>()

// Expiry timers keyed by `${bufName.toLowerCase()}|${nick.toLowerCase()}`.
const typingTimers = new Map<string, ReturnType<typeof setTimeout>>()

interface BacklogBatchInfo {
  /** IRC target this batch belongs to (channel or nick). */
  target: string

  /** Number of raw IRC lines counted so far in this batch. */
  count: number

  /** True for a CHATHISTORY BEFORE response, whose messages get prepended. */
  isPrepend: boolean

  /** Staged messages for BEFORE batches; spliced into the buffer in one shot at BATCH end. */
  staging?: ChatMessage[]

  /** Oldest msgid delivered in this batch (any type, including applied reactions). */
  oldestMsgid?: string

  /** Oldest timestamp (ms) delivered in this batch. */
  oldestTs?: number

  /**
   * CHATHISTORY LATEST with a `since` bound. A sparse result here doesn't mean
   * history is exhausted: older messages may sit before the bound.
   */
  hasSinceBound?: boolean
}

// Active CHATHISTORY batch ids mapped to metadata, so replayed lines are flagged as backlog.
const backlogBatches = new Map<string, BacklogBatchInfo>()

interface MultilineBatchInfo {
  /** IRC target (channel or nick) the batch is addressed to. */
  target: string

  /** Sender nick, taken from the opening BATCH line's prefix. */
  from?: string

  /** msgid from the opening BATCH line. It covers the whole assembled message. */
  msgid?: string

  /** +reply target msgid carried on the opening BATCH line. */
  replyTo?: string

  /** Relay bot nick when sent via draft/relaymsg. */
  relayedBy?: string

  /** server-time of the opening BATCH line. */
  ts?: Date

  /** Accumulated lines, joined with '\n' when the batch closes. */
  lines: string[]

  /** Parent batch id when this multiline batch is nested inside a CHATHISTORY replay. */
  parentBatch?: string
}

// In-flight draft/multiline receive batches, keyed by batch id. Inner PRIVMSGs
// accumulate here and assemble into one ChatMessage when the batch closes.
const multilineBatches = new Map<string, MultilineBatchInfo>()

// Reactions that arrived before their parent message, keyed by lowercased buffer
// name then parent msgid. Usually reactions on our own message before its echo
// delivers the msgid. Without the queue they'd be dropped until a reload.
const pendingReactions = new Map<string, Map<string, Array<{ reaction: string, who: string, remove: boolean }>>>()

// Matches a single emoji (including ZWJ sequences, variation selectors, flags,
// skin-tone modifiers). Rejects plain text reactions.
const EMOJI_RE = /^\p{Extended_Pictographic}(?:[\uFE0F\u20E3\p{Emoji_Modifier}]|\u200D\p{Extended_Pictographic})*$/u

// Targets for which a CHATHISTORY BEFORE request is pending (lowercased).
const pendingBeforeTargets = new Set<string>()

// Targets for which a time-bounded CHATHISTORY LATEST request is pending (lowercased).
// A sparse result from these should NOT set historyExhausted.
const pendingTimeBoundTargets = new Set<string>()

// Channels whose "You joined" marker is deferred until their CHATHISTORY LATEST
// batch completes, so the marker lands below replayed history (lowercased).
const pendingJoinMarkers = new Set<string>()

// Channels the user explicitly joined this session via joinChannel(), lowercased.
// Only these get a "You joined" marker. Connect-time and server-restored joins
// stay silent.
const explicitJoinIntents = new Set<string>()

// Channels for which WHO was sent internally (for bot detection). Responses are silenced.
const internalWhoChannels = new Set<string>()

// DM targets from CHATHISTORY TARGETS awaiting a MARKREAD reply before deciding
// whether to open a buffer. Maps lowercased nick -> latestTs (ms) from TARGETS.
const pendingDmTargets = new Map<string, number>()

// --- Buffers helpers ---------------------------------------------------------
function listChannels() {
  channelList.value = []
  channelListLoading.value = true
  send('LIST')
}

function loadChannelMetaFromStorage(): Map<string, Map<string, string>> {
  if (!import.meta.client)
    return new Map()

  try {
    const raw = localStorage.getItem(STORAGE_CHANNEL_META)
    if (!raw)
      return new Map()

    const parsed = JSON.parse(raw) as Record<string, Record<string, string>>
    const result = new Map<string, Map<string, string>>()
    for (const [ch, keys] of Object.entries(parsed))
      result.set(ch, new Map(Object.entries(keys)))
    return result
  }
  catch {
    return new Map()
  }
}

function persistChannelMetaToStorage() {
  if (!import.meta.client)
    return

  const out: Record<string, Record<string, string>> = {}
  for (const [ch, meta] of channelMetaCache.value) {
    const filtered: Record<string, string> = {}
    for (const key of APPEARANCE_KEYS) {
      const val = meta.get(key)
      if (val)
        filtered[key] = val
    }
    if (Object.keys(filtered).length)
      out[ch] = filtered
  }
  localStorage.setItem(STORAGE_CHANNEL_META, JSON.stringify(out))
}

function loadChannelModesFromStorage(): Map<string, { modes: Set<string>, params: Map<string, string> }> {
  if (!import.meta.client)
    return new Map()

  try {
    const raw = localStorage.getItem(STORAGE_CHANNEL_MODES)
    if (!raw)
      return new Map()

    const parsed = JSON.parse(raw) as Record<string, { modes?: string[], params?: Record<string, string> }>
    const result = new Map<string, { modes: Set<string>, params: Map<string, string> }>()
    for (const [ch, entry] of Object.entries(parsed))
      result.set(ch, { modes: new Set(entry.modes ?? []), params: new Map(Object.entries(entry.params ?? {})) })
    return result
  }
  catch {
    return new Map()
  }
}

function persistChannelModesToStorage() {
  if (!import.meta.client)
    return

  const out: Record<string, { modes: string[], params: Record<string, string> }> = {}
  for (const [ch, entry] of channelModesCache.value) {
    if (!entry.modes.size)
      continue

    const params: Record<string, string> = {}
    for (const [mode, val] of entry.params) {
      if (!UNCACHED_MODE_PARAMS.has(mode))
        params[mode] = val
    }
    out[ch] = { modes: [...entry.modes], params }
  }
  localStorage.setItem(STORAGE_CHANNEL_MODES, JSON.stringify(out))
}

function resetBuffers() {
  for (const timer of typingTimers.values())
    clearTimeout(timer)
  typingTimers.clear()
  lastTypingSent.clear()

  // Keep channel/pm buffers across reconnects so cached messages stay visible
  // while CHATHISTORY replays. Only connection-volatile state is cleared.
  const preserved: ChatBuffer[] = buffers.value
    .filter(b => b.kind === 'channel' || b.kind === 'pm')
    .map(b => ({
      ...b,
      users: [],
      joined: false,
      typing: undefined,
      historyReady: undefined,
      historyExhausted: undefined,
      loadingOlderHistory: undefined,
      autoFetchRetries: undefined,
      historyAnchorMsgid: undefined,
      historyAnchorTs: undefined,
      banList: undefined,
      banListReady: undefined,
      exceptList: undefined,
      exceptListReady: undefined,
      inviteList: undefined,
      inviteListReady: undefined,
    }))
  buffers.value = [
    { name: SERVER_BUFFER, kind: 'server', messages: [], users: [], unread: 0, mentions: 0, joined: true },
    ...preserved,
  ]

  // Stay on the current channel if it survived the reset; go to Server otherwise.
  if (!preserved.some(b => b.name.toLowerCase() === activeName.value.toLowerCase()))
    activeName.value = SERVER_BUFFER
  channelList.value = []
  channelListLoading.value = false

  // Seed from the stored appearance cache until METADATA arrives.
  channelMetaCache.value = loadChannelMetaFromStorage()
  _backgroundMetaTargets.clear()
  channelMetaResolved.value = new Set(channelMetaCache.value.keys())
  channelModesCache.value = loadChannelModesFromStorage()
}

function findBuffer(name: string) {
  const lc = name.toLowerCase()
  return buffers.value.find(b => b.name.toLowerCase() === lc)
}

function getBuffer(name: string, kind: BufferKind): ChatBuffer {
  const existing = findBuffer(name)
  if (existing)
    return existing

  const buf: ChatBuffer = { name, kind, messages: [], users: [], unread: 0, mentions: 0, joined: false, topic: '', modes: new Set() }

  // Seed appearance metadata from cache so display-name/avatar/color are
  // visible immediately on join before the METADATA LIST response arrives.
  if (kind === 'channel') {
    const cached = channelMetaCache.value.get(name.toLowerCase())
    if (cached?.size)
      buf.metadata = new Map(cached)
    seedBufferModes(buf)
  }
  buffers.value = [...buffers.value, buf]
  return buf
}

export function mentionsSelf(text: string) {
  const targets: string[] = []
  if (nick.value)
    targets.push(nick.value)
  targets.push(...mentionKeywords.value)
  if (targets.length === 0)
    return false

  const pattern = targets.map(escapeRegExp).join('|')
  return new RegExp(`(^|[^\\w])(?:${pattern})([^\\w]|$)`, 'i').test(text)
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * True when `candidate` already exists in `list`. Lines with a msgid dedupe on it.
 * Lines without one fall back to an exact type+from+text+timestamp match: replays
 * keep the original server-time, so a re-delivered event matches to the ms while
 * a genuinely new join/part still passes. This is what stops a repeated
 * CHATHISTORY LATEST from re-appending the whole log.
 */
function messageExists(list: ChatMessage[], candidate: ChatMessage): boolean {
  if (candidate.msgid != null)
    return list.some(m => m.msgid === candidate.msgid)

  const t = candidate.ts.getTime()
  return list.some(m =>
    m.msgid == null
    && m.type === candidate.type
    && m.from === candidate.from
    && m.text === candidate.text
    && m.ts.getTime() === t)
}

function addToBuffer(
  name: string,
  kind: BufferKind,
  msg: Omit<ChatMessage, 'id' | 'ts'>,
  opts: { ts?: Date, backlog?: boolean, prepend?: boolean, batchTag?: string } = {},
) {
  const buf = getBuffer(name, kind)
  const ts = opts.ts ?? new Date()

  const newMsg: ChatMessage = {
    ...msg,
    id: msgCounter.value++,
    ts,
    backlog: opts.backlog,
  }

  if (opts.prepend) {
    // BEFORE batches stage here and splice in once at BATCH end, so the page is
    // one DOM update instead of one per line.
    const bi = opts.batchTag != null ? backlogBatches.get(opts.batchTag) : undefined

    if (bi?.staging != null) {
      // Dedupe against the buffer too, since a BEFORE page can overlap history we
      // already hold.
      if (!messageExists(bi.staging, newMsg) && !messageExists(buf.messages, newMsg))
        bi.staging.push(newMsg)

      // Not in buf.messages yet. Fall through so badge/read logic still runs.
    }
    else {
      if (messageExists(buf.messages, newMsg))
        return

      buf.messages.unshift(newMsg)
    }
  }
  else {
    // Catches cache-hydrated lines overlapping a LATEST replay, and msgid-less
    // lines that would re-append on every replay. Optimistic sends have no msgid
    // and a fresh ts, so they never collide with their echo.
    if (messageExists(buf.messages, newMsg))
      return

    // Always persist, since the cache is the sorted superset the live window
    // slides over. Only splice into the live buffer when the server-time falls
    // inside the loaded window, otherwise it lands out of order. Out-of-window
    // lines surface later via cache-backed paging.
    scheduleMsgWrite(name, newMsg)

    const tMs = ts.getTime()
    const newest = buf.messages[buf.messages.length - 1]
    const oldest = buf.messages[0]

    if (buf.tailTrimmed) {
      // Window is scrolled away from the live tip: don't disturb it. The line is
      // cached and appears via fetchNewerFromCache when the user scrolls down.
    }
    else if (newest == null || tMs >= newest.ts.getTime()) {
      buf.messages.push(newMsg)
    }
    else if (oldest != null && tMs > oldest.ts.getTime()) {
      // Out-of-order delivery inside the loaded window (event-playback replaying an
      // old JOIN/PART live). Insert at its server-time position, and flag presence
      // as backlog so it collapses into a summary.
      if (newMsg.type === 'join' || newMsg.type === 'part')
        newMsg.backlog = true

      let idx = buf.messages.length

      while (idx > 0 && buf.messages[idx - 1]!.ts.getTime() > tMs)
        idx--

      buf.messages.splice(idx, 0, newMsg)
    }

    // Older than everything loaded: cache only.
  }

  // Apply reactions that arrived before this message. Staged prepends aren't in
  // buf.messages yet, so the BATCH end handler drains those after the splice.
  if (!opts.prepend && newMsg.msgid != null)
    drainPendingReactions(buf, newMsg.msgid)

  // Backlog counts too. Otherwise a session with no live messages never advances
  // the DM history cursor and replays the same history on every load.
  if (msg.type === 'chat')
    noteSeen(ts.getTime())

  // Only other people's chat lines affect unread/mention/notification state.
  // Service bots never badge.
  if (msg.type !== 'chat' || msg.from == null || msg.from === nick.value || SERVICE_NICKS.has(msg.from.toLowerCase()))
    return

  const isPing = kind === 'pm'
    ? !SERVICE_NICKS.has(msg.from.toLowerCase())
    : !SERVICE_NICKS.has(msg.from.toLowerCase()) && mentionsSelf(msg.text)

  const isActive = buf.name.toLowerCase() === activeName.value.toLowerCase()

  // Capture the marker BEFORE pinning so notification/already-read logic compares
  // against the previously-read position, not this very message.
  const readTs = readPositions[name.toLowerCase()]

  // The read marker is the single source of truth, for live and replayed lines
  // alike. The server's backlog flag is unreliable, so don't gate on it here.
  const alreadyRead = readTs != null && ts.getTime() <= readTs

  // Pin the active buffer's marker as each message arrives, so the visible
  // channel counts as read without depending on the watcher's flush timing.
  if (isActive && isChatVisible.value && !document.hidden)
    saveReadPosition(name, ts.getTime())

  // Browser notification: genuinely-new pings only, never replayed history, and not
  // while the user is reading this exact channel live.
  if (!opts.backlog && isPing && !alreadyRead && browserNotificationsEnabled.value
    && typeof Notification !== 'undefined' && Notification.permission === 'granted'
    && (!isActive || document.hidden)) {
    // eslint-disable-next-line no-new
    new Notification(`${msg.from} mentioned you in ${buf.name}`, { body: msg.text, tag: `chat-mention-${buf.name}` })
  }

  // Same gating as browser notifications. A mention chime replaces the general
  // blip so a ping never fires both.
  if (!opts.backlog && !alreadyRead && (!isActive || document.hidden)) {
    if (isPing && soundMentionChoice.value !== NONE_SOUND_ID)
      playNotificationSound(soundMentionChoice.value, soundMentionUrl.value, soundVolume.value, soundMentionDesign.value)
    else if (soundMessageChoice.value !== NONE_SOUND_ID)
      playNotificationSound(soundMessageChoice.value, soundMessageUrl.value, soundVolume.value, soundMessageDesign.value)
  }

  // Don't badge what you're looking at (visible and foregrounded) or have read.
  if ((isActive && isChatVisible.value && !document.hidden) || alreadyRead)
    return

  // First visit to a channel (no marker): don't badge its replayed history. DMs
  // are exempt, since a replayed DM is a real new message.
  if (readTs == null && opts.backlog && kind !== 'pm')
    return

  buf.unread += 1
  if (isPing)
    buf.mentions += 1

  // Read line sits at the boundary between the last-read message and the new ones.
  buf.readLineTs ??= readTs ?? ts.getTime() - 1
}

/** Connection-level/system output that has no channel context. */
function addServer(msg: Omit<ChatMessage, 'id' | 'ts'>, opts: { ts?: Date } = {}) {
  addToBuffer(SERVER_BUFFER, 'server', msg, opts)
}

/** Append to the internal service-bot log. Never surfaced as a visible buffer. */
function addServiceLog(msg: Omit<ChatMessage, 'id' | 'ts'>, opts: { ts?: Date } = {}) {
  serviceLog.value.push({ ...msg, id: msgCounter.value++, ts: opts.ts ?? new Date() })
}

/** Show output in whatever buffer the user is currently viewing (falls back to server buffer). */
function addToActive(msg: Omit<ChatMessage, 'id' | 'ts'>, opts: { ts?: Date } = {}) {
  const name = activeName.value
  const buf = findBuffer(name)
  if (buf)
    addToBuffer(name, buf.kind, msg, opts)
  else
    addServer(msg, opts)
}

/**
 * Show a message we just sent before the server echoes it, and record what it
 * takes to send it again. Renders dimmed until reconcileOwnEcho promotes it or
 * the timeout flags it as undelivered.
 *
 * Leaner than addToBuffer on purpose: our own line never badges, notifies, or
 * dedupes, and without a msgid there's nothing to cache yet.
 */
function addPendingSend(name: string, kind: BufferKind, msg: Omit<ChatMessage, 'id' | 'ts'>): void {
  const buf = getBuffer(name, kind)
  const ts = new Date()
  const id = msgCounter.value++
  buf.messages.push({ ...msg, id, ts, pending: true })
  noteSeen(ts.getTime())
  const timer = setTimeout(() => {
    const stale = findLocalMessage(name, id)
    if (stale) {
      stale.pending = false
      stale.failed = true
    }

    // The entry itself stays: it's what a resend is rebuilt from.
    const entry = outbox.get(id)
    if (entry)
      entry.timer = undefined
  }, PENDING_ECHO_TIMEOUT)
  outbox.set(id, {
    target: name,
    kind,
    text: msg.text,
    action: msg.action === true,
    replyTo: msg.replyTo,
    timer,
  })
}

/**
 * Look up a line by local id through buf.messages to get the reactive proxy.
 * Mutating the raw object we pushed wouldn't re-render.
 */
function findLocalMessage(bufferName: string, id: number): ChatMessage | undefined {
  return findBuffer(bufferName)?.messages.find(m => m.id === id)
}

/**
 * Add our own outgoing message to its buffer. `sent` is whether it made it onto
 * the socket. Without echo-message a successful send is the only confirmation
 * we'll get, so it goes straight in as settled history.
 */
function addOwnMessage(name: string, kind: BufferKind, msg: Omit<ChatMessage, 'id' | 'ts'>, sent: boolean): void {
  if (echoMessageActive || !sent)
    addPendingSend(name, kind, msg)
  else
    addToBuffer(name, kind, msg)
}

function clearOutboxEntry(id: number) {
  const entry = outbox.get(id)
  if (entry?.timer != null)
    clearTimeout(entry.timer)
  outbox.delete(id)
}

/**
 * Take an undelivered line out of the buffer. It never got a msgid, so it was
 * never cached and there's nothing to delete there.
 */
function removeLocalMessage(bufferName: string, id: number) {
  const buf = findBuffer(bufferName)
  if (!buf)
    return

  const idx = buf.messages.findIndex(m => m.id === id)
  if (idx !== -1)
    buf.messages.splice(idx, 1)
}

/** Whether `message` is an undelivered send the user can resend or discard. */
function canResend(message: ChatMessage): boolean {
  return message.failed === true && outbox.has(message.id)
}

/**
 * Resend an undelivered message. The old line is removed and a fresh pending one
 * appears at the bottom. Target and reply context come from the outbox entry, so
 * the resend lands where the original was aimed even after switching buffers.
 */
function resendMessage(message: ChatMessage) {
  const entry = outbox.get(message.id)
  if (!entry || message.failed !== true)
    return

  clearOutboxEntry(message.id)
  removeLocalMessage(entry.target, message.id)
  deliverWire(entry.target, entry.kind, entry.text, { replyTo: entry.replyTo, action: entry.action })
}

/** Drop an undelivered message for good: it leaves the log and the outbox. */
function discardMessage(message: ChatMessage) {
  const entry = outbox.get(message.id)
  if (!entry || message.failed !== true)
    return

  clearOutboxEntry(message.id)
  removeLocalMessage(entry.target, message.id)
}

/**
 * Normalise text for echo matching. Leading and trailing whitespace on a line
 * doesn't survive the round trip reliably (a blank line goes out as a single
 * space), so it can't be part of the comparison.
 */
function echoKey(text: string): string {
  return text.split('\n').map(line => line.trim()).join('\n')
}

/**
 * Absorb a self-echo into the optimistic line we already showed, so it promotes
 * in place instead of appending a duplicate. Matches on text + action flag within
 * the buffer, which also catches a replayed copy of a send whose echo we missed
 * across a reconnect. Returns true when the caller shouldn't add it again.
 */
function reconcileOwnEcho(
  bufferName: string,
  text: string,
  action: boolean,
  msgid: string | undefined,
  replyTo: string | undefined,
  serverTs: Date | undefined,
): boolean {
  const buf = findBuffer(bufferName)
  if (!buf)
    return false

  const ts = serverTs ?? new Date()
  const key = echoKey(text)
  const match = buf.messages.find(m =>
    (m.pending === true || m.failed === true)
    && m.type === 'chat'
    && echoKey(m.text) === key
    && !!m.action === action
    && Math.abs(m.ts.getTime() - ts.getTime()) <= PENDING_ECHO_MAX_SKEW)
  if (!match)
    return false

  // Confirmed history now, so the send intent is no longer needed.
  clearOutboxEntry(match.id)
  match.pending = false
  match.failed = false
  match.msgid = msgid

  // Adopt server-time so the line sorts and stamps like every other message.
  match.ts = ts
  if (replyTo != null)
    match.replyTo = replyTo
  scheduleMsgWrite(bufferName, match)
  if (msgid != null)
    drainPendingReactions(buf, msgid)
  noteSeen(ts.getTime())
  return true
}

/**
 * Flag every in-flight send as undelivered when the socket closes, instead of
 * leaving it dim forever. Outbox entries stay for a manual resend. A CHATHISTORY
 * replay after reconnect reconciles the ones that did reach the server.
 */
function failInFlightSends() {
  for (const [id, entry] of outbox) {
    if (entry.timer != null) {
      clearTimeout(entry.timer)
      entry.timer = undefined
    }
    const msg = findLocalMessage(entry.target, id)
    if (msg?.pending === true) {
      msg.pending = false
      msg.failed = true
    }
  }
}

/**
 * Apply an IRCv3 react/unreact to `parentMsgid` in `buf`. Idempotent, so
 * optimistic updates and echoed TAGMSGs converge.
 */
function applyReaction(buf: ChatBuffer, parentMsgid: string, reaction: string, who: string, remove: boolean, extra?: ChatMessage[]) {
  if (!parentMsgid || !reaction)
    return

  // In a BEFORE batch the parent may still be staged, not yet in buf.messages.
  const parent = buf.messages.find(m => m.msgid === parentMsgid)
    ?? extra?.find(m => m.msgid === parentMsgid)
  if (!parent) {
    // Parent isn't here yet. Either our own send is still awaiting its echo, or
    // a CHATHISTORY page replayed the reaction at its own (newer) time and the
    // parent lands in an older page. Queue it and replay when the parent appears.
    queuePendingReaction(buf.name, parentMsgid, reaction, who, remove)
    return
  }

  // Copy rather than mutate: Vue needs a new object to see the change.
  const reactions: Record<string, string[]> = { ...(parent.reactions ?? {}) }
  const list = reactions[reaction] ? [...reactions[reaction]] : []
  const idx = list.indexOf(who)

  if (remove) {
    if (idx !== -1)
      list.splice(idx, 1)
  }
  else if (idx === -1) {
    list.push(who)
  }

  // An emote nobody holds any more is dropped entirely, not left as an empty list.
  if (list.length)
    reactions[reaction] = list
  else
    delete reactions[reaction]

  parent.reactions = Object.keys(reactions).length ? reactions : undefined

  scheduleMsgWrite(buf.name, parent)
}

/** Stash a reaction whose parent message isn't in the buffer yet. */
function queuePendingReaction(bufName: string, parentMsgid: string, reaction: string, who: string, remove: boolean) {
  const lc = bufName.toLowerCase()
  let byMsgid = pendingReactions.get(lc)
  if (!byMsgid) {
    byMsgid = new Map()
    pendingReactions.set(lc, byMsgid)
  }
  const list = byMsgid.get(parentMsgid) ?? []
  list.push({ reaction, who, remove })
  byMsgid.set(parentMsgid, list)
}

/** Apply (and clear) any reactions queued for `msgid`, now that its parent exists. */
function drainPendingReactions(buf: ChatBuffer, msgid: string) {
  const byMsgid = pendingReactions.get(buf.name.toLowerCase())
  const queued = byMsgid?.get(msgid)
  if (!byMsgid || !queued)
    return

  byMsgid.delete(msgid)
  for (const op of queued)
    applyReaction(buf, msgid, op.reaction, op.who, op.remove)
}

/**
 * Per spec, a REDACT for an unknown msgid MUST be ignored. The message stays in
 * place as a placeholder so authorship and ordering survive, but its text and
 * reactions are discarded. There's no "reveal".
 */
function applyRedaction(buf: ChatBuffer, msgid: string, by: string, reason: string) {
  if (!msgid)
    return

  const target = buf.messages.find(m => m.msgid === msgid)
  if (!target || target.redacted)
    return

  target.redacted = true
  target.redactedBy = by
  target.redactedReason = reason || undefined
  target.reactions = undefined

  // Drop the text too so it doesn't linger in memory or the IndexedDB cache.
  target.text = ''
  scheduleMsgWrite(buf.name, target)
}

function stripPrefix(name: string) {
  return name.replace(MODE_PREFIX_RE, '')
}

/** Split a raw NAMES entry like "@nick" into its prefix and bare nick. */
function splitPrefix(raw: string): { prefix: string, name: string } {
  const match = raw.match(MODE_PREFIX_RE)
  const prefix = match ? normalizePrefix(match[0]) : ''
  return { prefix, name: raw.slice(match ? match[0].length : 0) }
}

/** Order prefix chars by privilege and drop duplicates. */
function normalizePrefix(prefix: string) {
  return [...new Set(prefix.split(''))]
    .filter(c => PREFIX_ORDER.includes(c))
    .sort((a, b) => PREFIX_ORDER.indexOf(a) - PREFIX_ORDER.indexOf(b))
    .join('')
}

function prefixRank(prefix: string) {
  if (prefix.length === 0)
    return PREFIX_ORDER.length

  const i = PREFIX_ORDER.indexOf(prefix[0]!)
  return i === -1 ? PREFIX_ORDER.length : i
}

/** Sort highest-privilege members first, then alphabetically. */
function sortUsers(a: ChatUser, b: ChatUser) {
  const rank = prefixRank(a.prefix) - prefixRank(b.prefix)
  return rank !== 0 ? rank : a.name.localeCompare(b.name)
}

function addUser(buf: ChatBuffer, raw: string) {
  const { prefix, name } = splitPrefix(raw)
  if (!name)
    return

  const existing = buf.users.find(u => u.name === name)
  if (existing) {
    if (prefix && prefix !== existing.prefix) {
      existing.prefix = prefix
      buf.users = [...buf.users].sort(sortUsers)
    }
    return
  }
  buf.users = [...buf.users, { name, prefix }].sort(sortUsers)
}

// List modes (ban, exception, invite-exception) take a param but are tracked per
// entry, never as a boolean channel flag.
const LIST_MODES = new Set(['b', 'e', 'I'])

/** Apply a MODE change's prefix mutations to the matching channel members. */
function applyModeChanges(buf: ChatBuffer, args: string[]) {
  const modeStr = args[0]

  if (modeStr == null || modeStr.length === 0)
    return

  // The mode string is a run of +/- switches and mode letters, with the
  // parameters that some of those letters take following in order.
  let adding = true
  let paramIdx = 1
  let changed = false
  let modesChanged = false

  buf.modes ??= new Set()

  for (const ch of modeStr) {
    if (ch === '+') {
      adding = true
      continue
    }

    if (ch === '-') {
      adding = false
      continue
    }

    const prefixChar = MODE_TO_PREFIX[ch]

    // Member prefix mode (+o, +v, ...): the parameter names the member.
    if (prefixChar != null) {
      const targetNick = args[paramIdx++]

      if (targetNick == null || targetNick.length === 0)
        continue

      const user = buf.users.find(u => u.name === stripPrefix(targetNick))

      if (!user)
        continue

      const set = new Set(user.prefix.split(''))

      if (adding)
        set.add(prefixChar)
      else
        set.delete(prefixChar)

      user.prefix = normalizePrefix([...set].join(''))
      changed = true
    }

    // List mode (+b, +e, +I): the mask is fetched separately, so only the
    // parameter slot matters here.
    else if (LIST_MODES.has(ch)) {
      paramIdx++
    }

    // Channel mode that carries a parameter worth keeping (+k, +l, ...).
    else if (PARAM_MODES_ALWAYS.has(ch) || (adding && PARAM_MODES_ON_SET.has(ch))) {
      buf.modeParams ??= new Map()

      const paramVal = args[paramIdx++]

      if (adding) {
        buf.modes.add(ch)

        if (!LIST_MODES.has(ch) && paramVal)
          buf.modeParams.set(ch, paramVal)
      }
      else {
        buf.modes.delete(ch)
        buf.modeParams.delete(ch)
      }

      modesChanged = true
    }

    // Plain flag mode (+m, +t, ...).
    else {
      if (adding) {
        buf.modes.add(ch)
      }
      else {
        buf.modes.delete(ch)
        buf.modeParams?.delete(ch)
      }

      modesChanged = true
    }
  }

  // Both assignments replace the container rather than mutate it, so Vue picks
  // the change up.
  if (changed)
    buf.users = [...buf.users].sort(sortUsers)

  if (modesChanged) {
    buf.modes = new Set(buf.modes)
    cacheChannelModes(buf)
  }
}

function removeUserEverywhere(name: string) {
  const clean = stripPrefix(name)
  for (const buf of buffers.value)
    buf.users = buf.users.filter(u => u.name !== clean)
}

/** Update a user's away state across every channel they're in (away-notify). */
function setAwayEverywhere(name: string, away: boolean) {
  const clean = stripPrefix(name)
  for (const buf of buffers.value) {
    const user = buf.users.find(u => u.name === clean)
    if (user)
      user.away = away
  }
}

function clearTyping(bufName: string, typingNick: string) {
  const key = `${bufName.toLowerCase()}|${typingNick.toLowerCase()}`
  const timer = typingTimers.get(key)
  if (timer !== undefined)
    clearTimeout(timer)
  typingTimers.delete(key)
  const buf = findBuffer(bufName)
  if (!buf?.typing?.length)
    return

  const lc = typingNick.toLowerCase()
  buf.typing = buf.typing.filter(n => n.toLowerCase() !== lc)
}

function setTyping(bufName: string, typingNick: string, expiryMs: number) {
  const buf = findBuffer(bufName)
  if (!buf)
    return

  const key = `${bufName.toLowerCase()}|${typingNick.toLowerCase()}`
  const existing = typingTimers.get(key)
  if (existing !== undefined)
    clearTimeout(existing)
  buf.typing ??= []
  const lc = typingNick.toLowerCase()
  buf.typing = [...buf.typing.filter(n => n.toLowerCase() !== lc), typingNick]
  typingTimers.set(key, setTimeout(clearTyping, expiryMs, bufName, typingNick))
}

function clearTypingEverywhere(typingNick: string) {
  for (const buf of buffers.value)
    clearTyping(buf.name, typingNick)
}

// --- Persistence -------------------------------------------------------------
function loadPersisted() {
  if (!import.meta.client)
    return

  inputNick.value = localStorage.getItem(STORAGE_NICK) ?? ''
  inputChannel.value = localStorage.getItem(STORAGE_CHANNEL) ?? ''
  channelMetaCache.value = loadChannelMetaFromStorage()
  channelMetaResolved.value = new Set(channelMetaCache.value.keys())
  channelModesCache.value = loadChannelModesFromStorage()
  const cachedEmail = localStorage.getItem(STORAGE_IDENTITY_EMAIL)
  accountEmail.value = cachedEmail
  const cachedAlwaysOn = localStorage.getItem(STORAGE_IDENTITY_ALWAYS_ON)
  accountAlwaysOn.value = cachedAlwaysOn === null ? null : cachedAlwaysOn === 'true'
  const cachedDmHistory = localStorage.getItem(STORAGE_IDENTITY_DM_HISTORY)
  accountDmHistory.value = cachedDmHistory !== null && DM_HISTORY_VALUES.has(cachedDmHistory) ? cachedDmHistory as DmHistorySetting : null
  const cachedDmHistoryEffective = localStorage.getItem(STORAGE_IDENTITY_DM_HISTORY_EFFECTIVE)
  accountDmHistoryEffective.value = cachedDmHistoryEffective !== null && DM_HISTORY_VALUES.has(cachedDmHistoryEffective) ? cachedDmHistoryEffective as DmHistorySetting : null
  lastSeenTs = Number(localStorage.getItem(STORAGE_LASTSEEN)) || 0
  try {
    closedDms = JSON.parse(localStorage.getItem(STORAGE_CLOSED_DMS) ?? '{}') as Record<string, number>
  }
  catch {
    closedDms = {}
  }
  try {
    readPositions = JSON.parse(localStorage.getItem(STORAGE_READ_POSITIONS) ?? '{}') as Record<string, number>
  }
  catch {
    readPositions = {}
  }
}

/** Advance and persist the last-seen cursor when a live message is newer. */
function noteSeen(ts: number) {
  if (ts <= lastSeenTs)
    return

  lastSeenTs = ts
  if (import.meta.client)
    localStorage.setItem(STORAGE_LASTSEEN, String(ts))
}

function persistClosedDms() {
  if (import.meta.client)
    localStorage.setItem(STORAGE_CLOSED_DMS, JSON.stringify(closedDms))
}

/** Record a closed DM so reconnect won't reopen it unless newer activity exists. */
function rememberClosedDm(name: string, buf: ChatBuffer) {
  const last = buf.messages[buf.messages.length - 1]
  closedDms[name.toLowerCase()] = last?.ts ? last.ts.getTime() : Date.now()
  persistClosedDms()
}

/** Remove a DM's closed marker (reopened manually, or has fresh activity). */
function forgetClosedDm(name: string) {
  if (closedDms[name.toLowerCase()] == null)
    return

  delete closedDms[name.toLowerCase()]
  persistClosedDms()
}

function persistNick(value: string) {
  if (import.meta.client && value)
    localStorage.setItem(STORAGE_NICK, value)
}

function clearInputNick() {
  inputNick.value = ''
  if (import.meta.client)
    localStorage.removeItem(STORAGE_NICK)
}

/** Record whether the currently persisted identity belongs to a signed-in session. */
function markIdentityAuthed(authed: boolean) {
  if (!import.meta.client)
    return

  if (authed)
    localStorage.setItem(STORAGE_IDENTITY_AUTHED, '1')
  else
    localStorage.removeItem(STORAGE_IDENTITY_AUTHED)
}

const hadAccount = ref(import.meta.client && localStorage.getItem(STORAGE_HAD_ACCOUNT) === '1')

function markHadAccount() {
  hadAccount.value = true
  if (import.meta.client)
    localStorage.setItem(STORAGE_HAD_ACCOUNT, '1')
}

/**
 * Drop a persisted nick/channel that belonged to a signed-in session, on a
 * signed-out load. A returning anon user's chosen nick is left alone.
 */
function clearAuthedIdentity() {
  if (!import.meta.client)
    return
  if (localStorage.getItem(STORAGE_IDENTITY_AUTHED) !== '1')
    return

  inputNick.value = ''
  inputChannel.value = ''
  localStorage.removeItem(STORAGE_NICK)
  localStorage.removeItem(STORAGE_CHANNEL)
  localStorage.removeItem(STORAGE_IDENTITY_AUTHED)
  const _signOutKey = cacheNickKey()
  if (_signOutKey)
    void clearChatCache(_signOutKey)

  // resetBuffers() keeps channel/PM buffers across reconnects, so wipe them here
  // or a follow-up anon connect inherits channels the guest never joined.
  buffers.value = [
    { name: SERVER_BUFFER, kind: 'server', messages: [], users: [], unread: 0, mentions: 0, joined: true },
  ]
  activeName.value = SERVER_BUFFER
}

function persistChannel(value: string) {
  if (import.meta.client && value)
    localStorage.setItem(STORAGE_CHANNEL, value)
}

// --- Local buffer cache (IndexedDB) ------------------------------------------
// Chat lines with a server msgid are written as they arrive. Startup seeds
// CACHE_SEED_COUNT messages per buffer before the socket connects, and
// scroll-back reads IDB first before falling back to CHATHISTORY BEFORE.

/**
 * First non-empty identity (nick) used as the per-user cache key. Empty strings
 * fall through, so a signed-out load with no nick yields no key (no cache read/write).
 */
function cacheNickKey(): string {
  const candidates = [nick.value, inputNick.value, import.meta.client ? localStorage.getItem(STORAGE_NICK) : null]
  for (const candidate of candidates) {
    if (candidate)
      return candidate.toLowerCase()
  }
  return ''
}

/** Build the cache row for a live message, or null when it shouldn't be cached. */
function buildStoredMessage(bufferName: string, msg: ChatMessage): StoredMessage | null {
  const userKey = cacheNickKey()
  if (!userKey)
    return null

  const isEvent = msg.type === 'join' || msg.type === 'part'
  let msgid = msg.msgid
  if (isEvent) {
    // Don't persist session-scoped self markers ("You joined #x").
    if (/^You (?:joined|left)\b/.test(msg.text))
      return null

    // Presence events carry no server msgid; key them on a stable synthetic id
    // derived from content + server-time. The same event from any delivery path
    // (live, LATEST, BEFORE) maps to one row, so re-delivery just overwrites.
    msgid = `evt:${msg.type}:${msg.ts.getTime()}:${msg.text}`
  }

  if (msg.type !== 'chat' && msg.type !== 'tagmsg' && msg.type !== 'join' && msg.type !== 'part')
    return null
  if (!msgid)
    return null

  const type = msg.type
  return {
    bufferKey: makeBufferKey(userKey, bufferName),
    msgid,
    ts: msg.ts.getTime(),
    type,
    from: msg.from,
    channel: msg.channel,
    text: msg.text ?? '',
    replyTo: msg.replyTo,
    action: msg.action,
    tag: msg.tag,
    // Deep-clone reactions off the reactive proxy so IDB's structured clone doesn't throw DataCloneError.
    reactions: msg.reactions
      ? Object.fromEntries(Object.entries(msg.reactions).map(([emote, nicks]) => [emote, [...nicks]]))
      : undefined,
    redacted: msg.redacted,
    edited: msg.edited,
    relayedBy: msg.relayedBy,
  }
}

/** Inflate a cached row into a live (backlog) ChatMessage. */
function storedToMessage(m: StoredMessage): ChatMessage {
  const isEvent = m.type === 'join' || m.type === 'part'
  return {
    id: msgCounter.value++,
    ts: new Date(m.ts),
    type: m.type,
    from: m.from,
    channel: m.channel,
    text: m.text,
    // The synthetic presence id isn't a server msgid, so it must never anchor
    // CHATHISTORY. Dedup falls back to the content+ts signature instead.
    msgid: isEvent ? undefined : m.msgid,
    replyTo: m.replyTo,
    action: m.action,
    tag: m.tag,
    reactions: m.reactions ? { ...m.reactions } : undefined,
    backlog: true,
    redacted: m.redacted,
    edited: m.edited,
    relayedBy: m.relayedBy,
  }
}

/**
 * Queue a message for the debounced IDB flush. Later writes for the same
 * (bufferKey, msgid) overwrite earlier ones, so reaction/redaction chains converge.
 */
function scheduleMsgWrite(bufferName: string, msg: ChatMessage) {
  if (!import.meta.client)
    return

  const stored = buildStoredMessage(bufferName, msg)
  if (!stored)
    return

  _pendingMsgWrites.set(`${stored.bufferKey}|${stored.msgid}`, stored)
  if (_msgFlushTimer !== null)
    return

  _msgFlushTimer = setTimeout(() => {
    _msgFlushTimer = null
    const batch = [..._pendingMsgWrites.values()]
    _pendingMsgWrites.clear()
    void upsertMessages(batch)
    const seenKeys = new Set(batch.map(m => m.bufferKey))
    for (const bk of seenKeys)
      void pruneBuffer(bk, _cacheCap)
  }, 500)
}

/**
 * Load the cached buffer snapshot for the current nick from IndexedDB and seed
 * it into the live buffer list. Best-effort; failures are swallowed.
 */
async function hydrateBufferCache() {
  if (!import.meta.client || _cacheHydrating)
    return

  _cacheHydrating = true

  try {
    const userKey = cacheNickKey()

    if (!userKey)
      return

    const metas = await loadAllBufferMeta(userKey)

    if (!metas.length)
      return

    for (const meta of metas) {
      // Skip buffers that are already in the live list (e.g. on reconnect).
      if (findBuffer(meta.name))
        continue

      // Respect a closed DM: don't resurrect it unless the cache holds
      // activity newer than when the user closed it.
      if (meta.kind === 'pm') {
        const closedAt = closedDms[meta.name.toLowerCase()]

        if (closedAt != null) {
          const peek = await loadRecentMessages(userKey, meta.name, 1)

          if (!peek.length || peek[peek.length - 1]!.ts <= closedAt)
            continue
        }
      }

      const rawMsgs = await loadRecentMessages(userKey, meta.name, CACHE_SEED_COUNT)

      if (!rawMsgs.length)
        continue

      const messages: ChatMessage[] = rawMsgs.map(storedToMessage)
      const readTs = readPositions[meta.name.toLowerCase()]

      const buf: ChatBuffer = {
        name: meta.name,
        kind: meta.kind,
        messages,
        users: [],
        unread: 0,
        mentions: 0,
        joined: false,
        topic: meta.topic ?? '',
        readLineTs: readTs,
        modes: new Set(),
        cacheExhausted: rawMsgs.length < CACHE_SEED_COUNT,
      }
      if (meta.kind === 'channel') {
        const cached = channelMetaCache.value.get(meta.name.toLowerCase())

        if (cached?.size)
          buf.metadata = new Map(cached)

        seedBufferModes(buf)
      }

      // Re-check after the awaits: a live JOIN can create this buffer while
      // loadRecentMessages is in flight, which would leave a duplicate buffer.
      if (findBuffer(meta.name))
        continue

      // Commit now rather than at the end, so a JOIN during a later iteration's
      // await sees this buffer instead of appending a live duplicate.
      buffers.value = [...buffers.value, buf]
    }
  }
  catch {
    // Cache is a best-effort UX optimisation; ignore failures.
  }
  finally {
    _cacheHydrating = false
  }
}

// --- IRC wire ----------------------------------------------------------------
/** True when the socket can carry a line right now. */
function socketOpen(): boolean {
  return ws != null && ws.readyState === WebSocket.OPEN
}

function send(line: string): boolean {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(`${line}\r\n`)
    return true
  }
  return false
}

function requestWhois(targetNick: string) {
  const key = targetNick.toLowerCase()
  const next = new Map(_whoisStore.value)
  next.set(key, { nick: targetNick, loading: true })
  _whoisStore.value = next
  send(`WHOIS ${targetNick} ${targetNick}`)
}

/**
 * Background NickServ INFO probe. The reply is parsed but kept out of visible
 * buffers so no query tab opens.
 */
function queryNickServInfo() {
  if (!account.value)
    return

  probingNickServInfo = true
  if (probeTimer !== null)
    clearTimeout(probeTimer)
  send('PRIVMSG NickServ :INFO')
  send('PRIVMSG NickServ :GET always-on')
  send('PRIVMSG NickServ :GET dm-history')
  probeTimer = setTimeout(() => {
    probingNickServInfo = false
    probeTimer = null
    if (accountEmail.value === null) {
      accountEmail.value = ''
      if (import.meta.client)
        localStorage.setItem(STORAGE_IDENTITY_EMAIL, '')
    }
    if (accountAlwaysOn.value === null) {
      accountAlwaysOn.value = false
      if (import.meta.client)
        localStorage.setItem(STORAGE_IDENTITY_ALWAYS_ON, 'false')
    }
    if (accountDmHistory.value === null) {
      accountDmHistory.value = 'default'
      if (import.meta.client)
        localStorage.setItem(STORAGE_IDENTITY_DM_HISTORY, 'default')
    }
    accountInfoFetched.value = true
  }, 5000)
}

/**
 * Tell NickServ to enable always-on, suppressing its reply notices from
 * visible buffers. Sets accountAlwaysOn optimistically on send.
 */
function enableAlwaysOn() {
  if (!account.value)
    return

  accountAlwaysOn.value = true
  if (import.meta.client)
    localStorage.setItem(STORAGE_IDENTITY_ALWAYS_ON, 'true')
  suppressingNickServOp = true
  send('PRIVMSG NickServ :SET always-on true')
  setTimeout(() => {
    suppressingNickServOp = false
  }, 3000)
}

function disableAlwaysOn() {
  if (!account.value)
    return

  accountAlwaysOn.value = false
  if (import.meta.client)
    localStorage.setItem(STORAGE_IDENTITY_ALWAYS_ON, 'false')
  suppressingNickServOp = true
  send('PRIVMSG NickServ :SET always-on false')
  setTimeout(() => {
    suppressingNickServOp = false
  }, 3000)
}

/**
 * Set the NickServ dm-history preference optimistically, then re-probe GET
 * dm-history inside the suppression window to refresh the effective value.
 */
function setDmHistory(value: DmHistorySetting) {
  if (!account.value)
    return

  accountDmHistory.value = value
  if (import.meta.client)
    localStorage.setItem(STORAGE_IDENTITY_DM_HISTORY, value)
  suppressingNickServOp = true
  send(`PRIVMSG NickServ :SET dm-history ${value}`)
  send('PRIVMSG NickServ :GET dm-history')
  setTimeout(() => {
    suppressingNickServOp = false
  }, 3000)
}

/**
 * Send SET EMAIL to NickServ with suppression so NickServ's reply does not
 * open a visible query buffer.
 */
function claimEmail(email: string) {
  if (!account.value)
    return

  suppressingNickServOp = true
  send(`PRIVMSG NickServ :SET EMAIL ${email}`)
  setTimeout(() => {
    suppressingNickServOp = false
  }, 3000)
}

/**
 * Send VERIFYEMAIL to NickServ with suppression, then probe INFO after a
 * short delay so accountEmail is updated without opening a visible query.
 */
function verifyClaimCode(code: string) {
  if (!account.value)
    return

  suppressingNickServOp = true
  send(`PRIVMSG NickServ :VERIFYEMAIL ${code}`)
  setTimeout(queryNickServInfo, 1500)
  setTimeout(() => {
    suppressingNickServOp = false
  }, 3000)
}

function b64(value: string) {
  // SASL payloads are Latin1 (NUL-delimited PLAIN, ASCII JWT) so btoa is safe.
  return btoa(value)
}

function unescapeTag(value: string) {
  return value
    .replace(/\\:/g, ';')
    .replace(/\\s/g, ' ')
    .replace(/\\r/g, '\r')
    .replace(/\\n/g, '\n')
    .replace(/\\\\/g, '\\')
}

/** Inverse of unescapeTag: encode a value for the IRCv3 message-tags wire format. */
function escapeTagValue(value: string) {
  return value
    .replace(/\0/g, '') // NUL can't be encoded in IRC tag values
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\:')
    .replace(/ /g, '\\s')
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n')
}

interface ParsedIrc {
  tags: Record<string, string>
  command: string
  params: string[]
  nickFrom: string
}

function parseIrc(raw: string): ParsedIrc {
  let rest = raw
  const tags: Record<string, string> = {}

  if (rest.startsWith('@')) {
    const sp = rest.indexOf(' ')
    const tagStr = rest.slice(1, sp)
    rest = rest.slice(sp + 1)
    for (const pair of tagStr.split(';')) {
      if (!pair)
        continue

      const eq = pair.indexOf('=')
      if (eq === -1)
        tags[pair] = ''
      else
        tags[pair.slice(0, eq)] = unescapeTag(pair.slice(eq + 1))
    }
  }

  let prefix = ''
  if (rest.startsWith(':')) {
    const sp = rest.indexOf(' ')
    prefix = rest.slice(1, sp)
    rest = rest.slice(sp + 1)
  }

  const trailingIdx = rest.indexOf(' :')
  let trailing = ''
  if (trailingIdx !== -1) {
    trailing = rest.slice(trailingIdx + 2)
    rest = rest.slice(0, trailingIdx)
  }

  const parts = rest.split(' ').filter(Boolean)
  const command = parts.shift() ?? ''
  const params = trailing ? [...parts, trailing] : parts
  const nickFrom = prefix.includes('!') ? (prefix.split('!')[0] ?? '') : prefix
  return { tags, command, params, nickFrom }
}

function sendSaslPayload() {
  if (saslMech === 'ANONYMOUS') {
    send(`AUTHENTICATE ${b64('web@hivecom')}`)
    return
  }
  if (saslMech === 'PLAIN' && authCreds) {
    const payload = b64(`\u0000${authCreds.username}\u0000${authCreds.token}`)
    for (let i = 0; i < payload.length; i += 400)
      send(`AUTHENTICATE ${payload.slice(i, i + 400)}`)

    // Per IRCv3: signal the end when the payload is an exact multiple of 400.
    if (payload.length % 400 === 0)
      send('AUTHENTICATE +')
    return
  }
  send('AUTHENTICATE +')
}

function finishCap() {
  send('CAP END')
}

/**
 * Load older messages for a buffer, from the IDB cache first and CHATHISTORY
 * BEFORE once the cache is exhausted. loadingOlderHistory covers both paths.
 */
async function fetchOlderHistory(target: string) {
  if (!chatHistorySupported.value)
    return

  const buf = findBuffer(target)
  if (!buf || buf.historyExhausted || buf.loadingOlderHistory)
    return

  // Only trigger once initial history has settled.
  if (!buf.historyReady)
    return

  buf.loadingOlderHistory = true

  // --- cache-first path ---
  // While a reconnect gap is unbridged (cacheBridgeTs set), cached messages below
  // the live front aren't contiguous with it and would skip the missed window.
  // Use the server until pagination reaches cached territory and clears it.
  const userKey = cacheNickKey()
  if (userKey && !buf.cacheExhausted && buf.cacheBridgeTs == null) {
    const oldestTs = buf.messages[0]?.ts.getTime() ?? Date.now()
    const cached = await loadOlderMessages(userKey, target, oldestTs, CACHE_PAGE_SIZE)
    if (cached.length > 0) {
      // messageExists dedups chat by msgid and presence events by their
      // content+ts signature (events hold no real msgid once inflated).
      const newMsgs: ChatMessage[] = cached
        .map(storedToMessage)
        .filter(m => !messageExists(buf.messages, m))
      if (newMsgs.length) {
        buf.messages.splice(0, 0, ...newMsgs)

        // Advance CHATHISTORY anchor so BEFORE pagination continues from the
        // correct point once IDB is exhausted.
        const oldest = newMsgs[0]!
        if (oldest.msgid) {
          buf.historyAnchorMsgid = oldest.msgid
          buf.historyAnchorTs = oldest.ts.toISOString()
        }
        else {
          buf.historyAnchorTs = oldest.ts.toISOString()
        }

        // Trim at most one page from the tail per load. The user is at the top, so
        // this is off-screen. Trims skipped for a short log let excess build up,
        // and chopping it all at once could remove content near the viewport.
        if (buf.messages.length > MAX_LIVE_MESSAGES && windowTrimAllowed()) {
          buf.messages.splice(Math.max(MAX_LIVE_MESSAGES, buf.messages.length - CACHE_PAGE_SIZE))
          buf.tailTrimmed = true
        }
      }
      if (cached.length < CACHE_PAGE_SIZE)
        buf.cacheExhausted = true
      buf.loadingOlderHistory = false
      return
    }
    buf.cacheExhausted = true
  }

  // --- CHATHISTORY BEFORE fallback ---
  // loadingOlderHistory stays true until BATCH end clears it.
  let anchor: string | null = null
  if (buf.historyAnchorMsgid != null) {
    anchor = `msgid=${buf.historyAnchorMsgid}`
  }
  else if (buf.historyAnchorTs != null) {
    anchor = `timestamp=${buf.historyAnchorTs}`
  }
  else {
    // System messages (join/part) added live carry a bogus "now" ts, so they're
    // skipped as timestamp anchors.
    const anchorMsg = buf.messages.find(m => m.msgid != null)
      ?? buf.messages.find(m => m.type === 'chat')
    if (anchorMsg == null) {
      buf.loadingOlderHistory = false
      return
    }
    anchor = anchorMsg.msgid != null
      ? `msgid=${anchorMsg.msgid}`
      : `timestamp=${anchorMsg.ts.toISOString()}`
  }
  queueHistoryRequest({
    target,
    line: `CHATHISTORY BEFORE ${target} ${anchor} ${HISTORY_LIMIT}`,
    onSend: () => pendingBeforeTargets.add(target.toLowerCase()),
  })
}

// --- CHATHISTORY request scheduling ---
// Ergo answers CHATHISTORY in arrival order, so a connect burst would queue the
// buffer the user is looking at behind every other channel. The active buffer
// goes out immediately. Everything else waits at low concurrency and is
// re-prioritised whenever a slot frees.
const HISTORY_CONCURRENCY = 2

// Safety valve: a request whose batch never closes (server error, target gone)
// would otherwise hold its slot forever.
const HISTORY_SLOT_TIMEOUT_MS = 15_000

interface QueuedHistory {
  target: string

  /** The exact line to send once a slot opens. */
  line: string

  /** Bookkeeping that must happen at send time, not queue time (pending-target sets). */
  onSend?: () => void
}

const historyQueue: QueuedHistory[] = []
const historyInFlight = new Map<string, ReturnType<typeof setTimeout>>()

/**
 * Lower sorts sooner. The active buffer wins, then the channel we're landing on
 * (set before the joins even start on a restore), then the buffer we came from.
 * DMs edge out remaining channels: there are few of them and they're the most
 * likely to be waiting on a reply.
 */
function historyPriority(target: string) {
  const t = target.toLowerCase()
  if (t === activeName.value.toLowerCase())
    return 0
  if (inputChannel.value && t === inputChannel.value.toLowerCase())
    return 1
  if (t === previousActiveName.value.toLowerCase())
    return 2

  return findBuffer(target)?.kind === 'pm' ? 3 : 4
}

function dispatchHistoryRequest(req: QueuedHistory) {
  const key = req.target.toLowerCase()
  const existing = historyInFlight.get(key)
  if (existing !== undefined)
    clearTimeout(existing)
  req.onSend?.()
  historyInFlight.set(key, setTimeout(releaseHistorySlot, HISTORY_SLOT_TIMEOUT_MS, req.target))
  send(req.line)
}

function drainHistoryQueue() {
  while (historyQueue.length > 0 && historyInFlight.size < HISTORY_CONCURRENCY) {
    // Sorted at drain time rather than insert time: priorities move as the user
    // switches buffers while the restore burst is still running.
    let bestIdx = 0
    let bestRank = historyPriority(historyQueue[0]!.target)
    for (let i = 1; i < historyQueue.length; i++) {
      const rank = historyPriority(historyQueue[i]!.target)
      if (rank < bestRank) {
        bestRank = rank
        bestIdx = i
      }
    }
    const next = historyQueue.splice(bestIdx, 1)[0]
    if (next)
      dispatchHistoryRequest(next)
  }
}

function queueHistoryRequest(req: QueuedHistory) {
  // The active buffer skips the queue entirely, even if that briefly puts us one
  // over the concurrency cap.
  if (historyPriority(req.target) === 0) {
    dispatchHistoryRequest(req)
    return
  }
  historyQueue.push(req)
  drainHistoryQueue()
}

/** Free the slot held by a target's request and let the next one out. */
function releaseHistorySlot(target: string) {
  const key = target.toLowerCase()
  const timer = historyInFlight.get(key)
  if (timer === undefined)
    return

  clearTimeout(timer)
  historyInFlight.delete(key)
  drainHistoryQueue()
}

/**
 * Send any queued history for `target` right now. Called when the user switches
 * buffers mid-restore: waiting for a slot would mean staring at an empty channel
 * while some background channel finishes replaying.
 */
function promoteHistoryRequests(target: string) {
  const key = target.toLowerCase()
  for (let i = historyQueue.length - 1; i >= 0; i--) {
    if (historyQueue[i]!.target.toLowerCase() === key) {
      const req = historyQueue.splice(i, 1)[0]
      if (req)
        dispatchHistoryRequest(req)
    }
  }
}

function resetHistoryQueue() {
  for (const timer of historyInFlight.values())
    clearTimeout(timer)
  historyInFlight.clear()
  historyQueue.length = 0
}

/**
 * Record the newest cached timestamp before a LATEST fetch, so the batch-end
 * handler can spot a reconnect gap (more than HISTORY_LIMIT missed) and bridge it
 * via BEFORE pagination. A live (non-backlog) tail means we never went offline.
 */
function markPendingBridge(buf: ChatBuffer) {
  const last = buf.messages[buf.messages.length - 1]
  if (last?.backlog)
    buf.pendingBridgeFromTs = last.ts.getTime()
}

function requestHistory(target: string, since?: number) {
  if (!chatHistorySupported.value)
    return

  if (since != null && since > 0) {
    queueHistoryRequest({
      target,
      line: `CHATHISTORY LATEST ${target} timestamp=${new Date(since).toISOString()} ${HISTORY_LIMIT}`,
      onSend: () => pendingTimeBoundTargets.add(target.toLowerCase()),
    })
  }
  else {
    queueHistoryRequest({ target, line: `CHATHISTORY LATEST ${target} * ${HISTORY_LIMIT}` })
  }
}

/**
 * Lower bound (ms) shared by TARGETS discovery and per-DM LATEST fetches.
 * Uses the last-seen cursor so we only pull what arrived while away, minus fuzz
 * to absorb clock skew. Falls back to DEFAULT_HISTORY_LOOKBACK_MS on first connect.
 */
function historyLowerBound() {
  const base = lastSeenTs > 0 ? lastSeenTs : Date.now() - DEFAULT_HISTORY_LOOKBACK_MS
  return base - HISTORY_FUZZ_MS
}

/**
 * Ask for all DMs with activity since we last saw a message. Ergo replies with a
 * `draft/chathistory-targets` batch.
 */
function requestHistoryTargets() {
  if (!chatHistorySupported.value)
    return

  const lower = historyLowerBound()
  const upper = Date.now() + HISTORY_FUZZ_MS

  // TARGETS takes <after> <before> <limit>. Swapping the timestamps gives an
  // inverted range and Ergo returns every target.
  send(`CHATHISTORY TARGETS timestamp=${new Date(lower).toISOString()} timestamp=${new Date(upper).toISOString()} ${HISTORY_LIMIT}`)
}

function handleMessage(raw: string) {
  const { tags, command, params, nickFrom } = parseIrc(raw)
  const timeTag = tags.time
  const ts = timeTag != null && timeTag !== '' ? new Date(timeTag) : undefined
  const batchTag = tags.batch
  const backlog = batchTag != null && backlogBatches.has(batchTag)

  // Every handler that stores a backlog line must honour this, or BEFORE-batch
  // lines land at the bottom instead of the top.
  const isPrependBatch = (batchTag != null ? backlogBatches.get(batchTag)?.isPrepend : false) ?? false

  // Ergo counts every replayed line (JOIN, PART, PRIVMSG...) toward the batch
  // limit, so count them all. Also track the oldest line so BEFORE pagination
  // can advance past lines that never enter the buffer (reaction TAGMSGs,
  // suppressed relays). Otherwise the anchor never moves.
  if (backlog && batchTag) {
    const _bi = backlogBatches.get(batchTag)
    if (_bi) {
      _bi.count++
      const lineTs = ts?.getTime()
      if (lineTs != null && (_bi.oldestTs == null || lineTs < _bi.oldestTs)) {
        _bi.oldestTs = lineTs
        _bi.oldestMsgid = tags.msgid
      }
    }
  }

  switch (command) {
    case 'PING':
      send(`PONG :${params[0] ?? ''}`)
      break

    case 'PONG': {
      // Match client-initiated latency pings; ignore server-originated PONGs.
      const pongToken = params[params.length - 1] ?? ''
      if (_pingToken !== null && pongToken === _pingToken) {
        latencyMs.value = Date.now() - _pingAt
        _pingToken = null
      }
      break
    }

    case 'CAP': {
      const sub = params[1]
      const listRaw = params[params.length - 1] ?? ''

      // Entries can carry a value ("draft/relaymsg=/"), so keep both the raw
      // form and the bare capability names.
      const rawEntries = listRaw.split(' ').filter(Boolean)
      const list = rawEntries.map(c => (c.split('=')[0] ?? c))

      if (sub === 'LS') {
        // Separator character for relaymsg spoofed nicks, e.g. "draft/relaymsg=/".
        const relayEntry = rawEntries.find(c => c.startsWith('draft/relaymsg='))

        if (relayEntry) {
          const sep = relayEntry.slice('draft/relaymsg='.length)

          if (sep)
            relaySeparator.value = sep
        }

        // Multiline caps, e.g. "draft/multiline=max-bytes=4096,max-lines=24".
        const mlEntry = rawEntries.find(c => c.startsWith('draft/multiline='))

        if (mlEntry) {
          for (const kv of mlEntry.slice('draft/multiline='.length).split(',')) {
            const [k, v] = kv.split('=')

            if (k === 'max-bytes')
              multilineMaxBytes = Number.parseInt(v ?? '', 10) || 0
            else if (k === 'max-lines')
              multilineMaxLines = Number.parseInt(v ?? '', 10) || 0
          }
        }

        capLs.push(...list)

        // `CAP * LS * :...` indicates a continuation line is coming.
        if (params[2] === '*')
          break

        chatHistorySupported.value = capLs.includes('draft/chathistory')

        const wanted = WANTED_CAPS.filter(c => capLs.includes(c))

        if (wanted.length)
          send(`CAP REQ :${wanted.join(' ')}`)
        else
          finishCap()
      }
      else if (sub === 'ACK') {
        if (list.includes('echo-message'))
          echoMessageActive = true

        if (list.includes('message-tags'))
          messageTagsActive = true

        if (list.includes('draft/multiline'))
          multilineActive = true

        if (list.includes('draft/read-marker'))
          readMarkerActive = true

        if (list.includes('draft/message-redaction'))
          redactionSupported.value = true

        // SASL continues the handshake; everything else is done negotiating.
        if (list.includes('sasl') && (authCreds || useAnonymous)) {
          saslMech = useAnonymous ? 'ANONYMOUS' : 'PLAIN'
          send(`AUTHENTICATE ${saslMech}`)
        }
        else {
          finishCap()
        }
      }
      else if (sub === 'NAK') {
        finishCap()
      }

      break
    }

    case 'AUTHENTICATE':
      if (params[0] === '+')
        sendSaslPayload()
      break

    case '900': // RPL_LOGGEDIN
      account.value = params[2] ?? ''
      break

    case '903': // RPL_SASLSUCCESS
      addServer({ type: 'system', text: account.value ? `Authenticated as ${account.value}` : 'Authenticated' })
      finishCap()

      // Silently probe NickServ for claim status after CAP exchange completes.
      if (account.value)
        setTimeout(queryNickServInfo, 500)
      break

    case '902': // ERR_NICKLOCKED
    case '904': // ERR_SASLFAIL
    case '905': // ERR_SASLTOOLONG
    case '906': // ERR_SASLABORTED
    case '907': // ERR_SASLALREADY
      saslFailed = true
      addServer({ type: 'error', text: 'Authentication failed - continuing without a verified account.' })
      finishCap()
      break

    case '001': // RPL_WELCOME
      connState.value = 'connected'
      everConnected.value = true
      nick.value = params[0] ?? inputNick.value
      addServer({ type: 'system', text: `Connected as ${nick.value}` })
      if (!_skipAutoJoin && inputChannel.value)
        send(`JOIN ${inputChannel.value}`)
      _skipAutoJoin = false

      // Arm the default-channel fallback. If the server restores channels for an
      // always-on account, the JOIN handler keeps pushing this out and the final
      // check sees those channels and skips the default.
      scheduleDefaultChannelFallback()
      _startPinging()

      // Without this subscription Ergo only sends metadata in reply to explicit
      // GET/LIST, so live avatar/display-name/status changes would never arrive.
      if (capLs.includes('draft/metadata-2'))
        send('METADATA * SUB avatar display-name orbit.status')

      // Discover DMs with activity since we were last online.
      requestHistoryTargets()
      break

    case '005': { // RPL_ISUPPORT
      // Tokens sit between the nick and the trailing text. The VAPID key must be
      // the push subscription's applicationServerKey or Ergo's pushes won't validate.
      for (let i = 1; i < params.length - 1; i++) {
        const tok = params[i] ?? ''
        if (tok.startsWith('VAPID='))
          vapidKey.value = tok.slice('VAPID='.length) || null
      }
      break
    }

    case 'WEBPUSH':
      // Ack of a WEBPUSH REGISTER/UNREGISTER (`WEBPUSH <subcommand> <endpoint>`).
      // Success needs no UI; failures arrive as `FAIL WEBPUSH ...` (handled below).
      break

    case '433': // ERR_NICKNAMEINUSE
      // Before registration completes, Ergo ghosts the occupant once SASL claims
      // the account's nick, so this isn't fatal yet. After a failed SASL it is.
      if (connState.value === 'connecting' && authCreds && !saslFailed)
        break

      addServer({ type: 'error', text: `Nickname ${params[1]} is already in use. Try a different one.` })

      // Fatal: reconnecting with the same taken nick would just loop.
      _fatalError = true
      connState.value = 'error'
      ws?.close()
      break

    case 'JOIN': {
      const channel = params[0] ?? inputChannel.value
      const buf = getBuffer(channel, 'channel')

      // Replayed JOINs (event-playback history) must not touch live presence,
      // re-request history, or steal focus. Only render other users' historical
      // join lines; our own replayed join is covered by the deferred marker.
      if (backlog) {
        if (nickFrom !== nick.value)
          addToBuffer(channel, 'channel', { type: 'join', channel, text: `${nickFrom} joined` }, { ts, backlog, prepend: isPrependBatch, batchTag: batchTag ?? undefined })

        break
      }

      // Someone else joining is a presence update and a line in the log. The
      // rest of this arm is about landing in the channel ourselves.
      if (nickFrom !== nick.value) {
        addUser(buf, nickFrom)
        addToBuffer(channel, 'channel', { type: 'join', channel, text: `${nickFrom} joined` }, { ts, backlog })
        break
      }

      buf.joined = true

      // Secret channels show in public metrics as a hash of their name. Remembering
      // the ones we're in lets the dashboard label those rows after chat closes.
      rememberIrcChannel(channel)

      // Push the default-channel fallback out so it only fires once the restore
      // burst is quiet, and not at all now that we have a channel.
      scheduleDefaultChannelFallback()

      if (channelKeyPrompt.value?.toLowerCase() === channel.toLowerCase()) {
        channelKeyPrompt.value = null
        channelKeyError.value = false
      }

      // Only focus the channel we intend to land on. Flipping through every
      // server auto-join on reconnect would let the read watcher mark them all
      // read. With no persisted channel, land on the first join.
      const want = inputChannel.value.toLowerCase()
      const shouldFocus = want
        ? channel.toLowerCase() === want
        : activeName.value === SERVER_BUFFER

      if (shouldFocus)
        setActive(channel)

      // Ask for the modes and metadata so the badges are accurate whether or not
      // a live MODE event was sent during the join burst.
      send(`MODE ${channel}`)
      send(`METADATA ${channel} LIST`)

      // Consume the intent so a later JOIN echo doesn't re-trigger the marker.
      const isExplicitJoin = explicitJoinIntents.delete(channel.toLowerCase())

      // Persist buffer metadata so the next load can hydrate this channel from
      // cache without waiting for a new JOIN.
      const _joinUserKey = cacheNickKey()

      if (_joinUserKey) {
        void upsertBufferMeta({
          key: makeBufferKey(_joinUserKey, channel),
          name: buf.name,
          kind: 'channel',
          topic: buf.topic,
        } satisfies StoredBufferMeta)
      }

      if (chatHistorySupported.value) {
        // Defer the "You joined" marker until the channel's CHATHISTORY LATEST
        // batch has been appended, so replayed history sits above the marker
        // (newest) instead of below it.
        if (isExplicitJoin)
          pendingJoinMarkers.add(channel.toLowerCase())

        // Plain LATEST, not bounded by the cached tail. A `since` LATEST returns
        // only the newest HISTORY_LIMIT lines and silently drops anything older
        // that arrived while away. Short absences overlap the cache and dedupe.
        // Longer ones leave a gap the batch-end handler bridges via BEFORE.
        markPendingBridge(buf)
        requestHistory(channel)
      }

      // Without history support the marker goes in right away.
      else if (isExplicitJoin) {
        addToBuffer(channel, 'channel', { type: 'join', channel, text: `You joined ${channel}` }, { ts })
      }

      break
    }

    case 'PART': {
      const channel = params[0] ?? ''
      const buf = findBuffer(channel)

      // Replayed PARTs must not evict currently-present users; just render the
      // historical line for other users.
      if (backlog) {
        if (buf && nickFrom !== nick.value)
          addToBuffer(channel, 'channel', { type: 'part', channel, text: `${nickFrom} left` }, { ts, backlog, prepend: isPrependBatch, batchTag: batchTag ?? undefined })
        break
      }
      if (buf)
        buf.users = buf.users.filter(u => u.name !== stripPrefix(nickFrom))
      clearTyping(channel, stripPrefix(nickFrom))
      if (nickFrom === nick.value) {
        // Clear any stale join intent so a future deliberate re-join is honoured.
        explicitJoinIntents.delete(channel.toLowerCase())

        // Only show the message if the buffer still exists; if closeBuffer() already
        // removed it, skip so we don't resurrect the buffer with a stale message.
        if (buf)
          addToBuffer(channel, 'channel', { type: 'part', channel, text: `You left ${channel}` }, { ts })
      }
      else {
        addToBuffer(channel, 'channel', { type: 'part', channel, text: `${nickFrom} left` }, { ts, backlog })
      }
      break
    }

    case 'KICK': {
      // :kicker!user@host KICK #channel target :reason
      const channel = params[0] ?? ''
      const target = stripPrefix(params[1] ?? '')
      const reason = params[2] ?? ''
      const reasonSuffix = reason ? ` (${reason})` : ''
      const buf = findBuffer(channel)
      const wasSelf = target === nick.value
      const lineText = wasSelf
        ? `You were kicked from ${channel} by ${nickFrom}${reasonSuffix}`
        : `${target} was kicked by ${nickFrom}${reasonSuffix}`

      // Replayed KICK history must not evict currently-present users; just render
      // the historical line for context.
      if (backlog) {
        if (buf)
          addToBuffer(channel, 'channel', { type: 'part', channel, text: lineText }, { ts, backlog, prepend: isPrependBatch, batchTag: batchTag ?? undefined })
        break
      }
      if (buf)
        buf.users = buf.users.filter(u => u.name !== target)
      clearTyping(channel, target)
      if (wasSelf) {
        // We were kicked; clear stale join intent so a future deliberate re-join is honoured.
        explicitJoinIntents.delete(channel.toLowerCase())
      }
      if (buf)
        addToBuffer(channel, 'channel', { type: 'part', channel, text: lineText }, { ts })
      break
    }

    case 'MODE': {
      // Replayed MODE history must not rewrite current channel modes or user
      // prefixes; live MODE events and the explicit MODE query keep state accurate.
      if (backlog)
        break

      const target = params[0] ?? ''
      if (target.startsWith('#') || target.startsWith('&')) {
        const buf = findBuffer(target)
        if (buf)
          applyModeChanges(buf, params.slice(1))
      }
      else {
        // User mode change: track the bot flag (+B/-B).
        const modeStr = params[1] ?? ''
        const setBot = /\+[^-]*B/.test(modeStr)
        const unsetBot = /-[^+]*B/.test(modeStr)
        if (setBot || unsetBot) {
          for (const buf of buffers.value) {
            const user = buf.users.find(u => u.name === target)
            if (user)
              user.bot = setBot
          }
        }
      }
      break
    }

    case 'NICK': {
      // Replayed NICK history must not rename currently-present users.
      if (backlog)
        break

      const newNick = params[0] ?? ''
      const oldName = stripPrefix(nickFrom)
      clearTypingEverywhere(oldName)
      for (const buf of buffers.value) {
        const existing = buf.users.find(u => u.name === oldName)
        if (existing) {
          buf.users = buf.users.filter(u => u.name !== oldName)
          addUser(buf, existing.prefix + newNick)
        }
      }
      const isOwnNick = oldName === nick.value
      if (isOwnNick)
        nick.value = newNick

      // Migrate user metadata to the new nick so avatars and display names survive a rename.
      const oldMetaLc = oldName.toLowerCase()
      const metaEntry = userMetaStore.value.get(oldMetaLc)
      if (metaEntry) {
        const store = new Map(userMetaStore.value)
        store.delete(oldMetaLc)
        store.set(newNick.toLowerCase(), metaEntry)
        userMetaStore.value = store
      }
      addServer({ type: 'system', text: `${oldName} is now known as ${newNick}` }, { ts })
      if (isOwnNick && activeName.value !== SERVER_BUFFER)
        addToBuffer(activeName.value, findBuffer(activeName.value)?.kind ?? 'channel', { type: 'system', text: `You are now known as ${newNick}` }, { ts })
      break
    }

    case 'RENAME': {
      // IRCv3 draft/channel-rename: :nick!user@host RENAME #old #new :reason
      // The rename preserves all channel state, so we migrate the existing buffer
      // in place rather than tearing it down and rebuilding it.
      if (backlog)
        break

      const oldChannel = params[0] ?? ''
      const newChannel = params[1] ?? ''
      const renameReason = params[2] ?? ''

      if (!oldChannel || !newChannel)
        break

      const buf = findBuffer(oldChannel)
      const oldLc = oldChannel.toLowerCase()
      const newLc = newChannel.toLowerCase()

      if (buf) {
        buf.name = newChannel

        // Migrate the persisted read position to the new key.
        if (oldLc !== newLc && readPositions[oldLc] !== undefined) {
          readPositions[newLc] = readPositions[oldLc]!
          delete readPositions[oldLc]

          if (import.meta.client)
            localStorage.setItem(STORAGE_READ_POSITIONS, JSON.stringify(readPositions))
        }
      }

      // Migrate the channel metadata cache to the new key (covers unjoined parents too).
      if (oldLc !== newLc) {
        const metaEntry = channelMetaCache.value.get(oldLc)

        if (metaEntry) {
          const next = new Map(channelMetaCache.value)

          next.delete(oldLc)
          next.set(newLc, metaEntry)
          channelMetaCache.value = next
        }
      }

      // Keep the active/previous buffer pointers and persisted auto-join in sync.
      if (activeName.value.toLowerCase() === oldLc)
        activeName.value = newChannel
      if (previousActiveName.value.toLowerCase() === oldLc)
        previousActiveName.value = newChannel
      if (inputChannel.value.toLowerCase() === oldLc) {
        inputChannel.value = newChannel
        persistChannel(newChannel)
      }
      if (channelSettingsOpen.value?.toLowerCase() === oldLc)
        channelSettingsOpen.value = newChannel
      const renamer = nickFrom === nick.value ? 'You' : (nickFrom || 'Someone')
      const reasonSuffix = renameReason ? ` (${renameReason})` : ''
      addToBuffer(newChannel, 'channel', { type: 'system', channel: newChannel, text: `${renamer} renamed ${oldChannel} to ${newChannel}${reasonSuffix}` }, { ts })
      break
    }

    case 'PRIVMSG': {
      const target = params[0] ?? ''
      const text = params[1] ?? ''
      const isAction = text.startsWith('\x01ACTION ') && text.endsWith('\x01')
      const body = isAction ? text.slice(8, -1) : text
      const from = nickFrom

      // Part of an in-flight draft/multiline batch: accumulate the raw line and
      // defer materialising the message until the batch closes (BATCH -). The
      // draft/multiline-concat tag means "join to the previous line with no
      // separator" (a logical line the sender split to fit max-bytes).
      const mlBatch = batchTag != null ? multilineBatches.get(batchTag) : undefined

      if (mlBatch) {
        if (tags['draft/multiline-concat'] != null && mlBatch.lines.length > 0)
          mlBatch.lines[mlBatch.lines.length - 1] += text
        else
          mlBatch.lines.push(text)

        break
      }

      // Channel targets are prefixed; anything else is a DM. DM buffers are
      // keyed by the other party: sender for incoming, target for our own
      // outgoing messages (which appear in replayed DM history).
      const isChannel = target.startsWith('#') || target.startsWith('&')
      const isSelf = nickFrom === nick.value
      const bufferName = isChannel ? target : (isSelf ? target : nickFrom)
      const kind: BufferKind = isChannel ? 'channel' : 'pm'

      const msgid = tags.msgid ?? undefined
      const replyTo = tags['+reply'] ?? undefined
      const relayedBy = tags['draft/relaymsg'] ?? undefined

      // Service bots stay in the internal log unless the user has an open query
      // with them. Our own probe/SET traffic and replayed history never surface.
      if (kind === 'pm' && SERVICE_NICKS.has(bufferName.toLowerCase())) {
        const hasOpenQuery = findBuffer(bufferName)?.kind === 'pm'

        if (!hasOpenQuery || backlog || probingNickServInfo || suppressingNickServOp) {
          addServiceLog({ type: 'system', from, text: isAction ? `* ${body}` : body }, { ts })
          break
        }

        // Otherwise fall through to normal PM handling for the open conversation.
      }

      // Suppress HistServ's human-readable TAGMSG relay notices (e.g. "Jokler
      // sent a TAGMSG"). The TAGMSG command itself carries the full tag context.
      if (nickFrom.toLowerCase() === 'histserv' && /\bsent a TAGMSG\b/i.test(body))
        break

      // Our own message coming back (echo-message, or a replay of one we sent):
      // fold it into the optimistic line already on screen. Skipped for prepend
      // batches, where the line would land above the loaded window anyway.
      if (isSelf && !isPrependBatch && relayedBy == null
        && reconcileOwnEcho(bufferName, body, isAction, msgid, replyTo, ts)) {
        break
      }

      // A BEFORE batch prepends, so older messages land at the top of the buffer.
      addToBuffer(bufferName, kind, { type: 'chat', from, channel: target, text: body, msgid, replyTo, relayedBy, ...(isAction && { action: true }) }, { ts, backlog, prepend: isPrependBatch, batchTag: batchTag ?? undefined })

      // Receiving a message clears the sender's typing indicator.
      if (!backlog)
        clearTyping(bufferName, from)

      break
    }

    case 'QUIT':
      // Replayed QUIT history would evict currently-present users and clutter the
      // server log; ignore it entirely. Live quits update presence as normal.
      if (backlog)
        break

      removeUserEverywhere(nickFrom)
      clearTypingEverywhere(stripPrefix(nickFrom))
      addServer({ type: 'part', text: `${nickFrom} quit: ${params[0] ?? ''}` }, { ts })
      break

    case 'AWAY':
      // away-notify: a trailing reason param means the user just went away;
      // no param means they returned. Replayed history carries no AWAY lines.
      if (!backlog)
        setAwayEverywhere(nickFrom, params.length > 0)
      break

    case 'BATCH': {
      const ref = params[0] ?? ''
      const id = ref.slice(1)

      // Open of a CHATHISTORY replay: record how its lines should land.
      if (ref.startsWith('+') && params[1] === 'chathistory') {
        const batchTarget = params[2] ?? ''
        const isPrepend = pendingBeforeTargets.delete(batchTarget.toLowerCase())
        const hasSinceBound = pendingTimeBoundTargets.delete(batchTarget.toLowerCase())

        backlogBatches.set(id, { target: batchTarget, count: 0, isPrepend, hasSinceBound, staging: isPrepend ? [] : undefined })
      }
      else if (ref.startsWith('+') && params[1] === 'draft/multiline') {
        // Opening line carries the whole message's tags (msgid/time/+reply/etc).
        // tags.batch is set only when this multiline batch is nested inside a
        // CHATHISTORY replay batch.
        multilineBatches.set(id, {
          target: params[2] ?? '',
          from: nickFrom,
          msgid: tags.msgid ?? undefined,
          replyTo: tags['+reply'] ?? undefined,
          relayedBy: tags['draft/relaymsg'] ?? undefined,
          ts,
          lines: [],
          parentBatch: tags.batch ?? undefined,
        })
      }
      else if (ref.startsWith('-')) {
        // Close of a draft/multiline batch: join the accumulated lines into one
        // ChatMessage. Nested inside a CHATHISTORY batch -> inherit its backlog /
        // prepend handling so the message lands at the right position.
        const ml = multilineBatches.get(id)

        if (ml) {
          multilineBatches.delete(id)

          const joined = ml.lines.join('\n')
          const isChannel = ml.target.startsWith('#') || ml.target.startsWith('&')
          const isSelf = ml.from === nick.value
          const bufferName = isChannel ? ml.target : (isSelf ? ml.target : ml.from ?? ml.target)
          const kind: BufferKind = isChannel ? 'channel' : 'pm'
          const parent = ml.parentBatch != null ? backlogBatches.get(ml.parentBatch) : undefined
          const isBacklog = parent != null

          if (bufferName) {
            // Same echo reconciliation as the single-line case above.
            if (isSelf && !(parent?.isPrepend ?? false) && ml.relayedBy == null
              && reconcileOwnEcho(bufferName, joined, false, ml.msgid, ml.replyTo, ml.ts)) {
              break
            }

            addToBuffer(bufferName, kind, { type: 'chat', from: ml.from, channel: ml.target, text: joined, msgid: ml.msgid, replyTo: ml.replyTo, relayedBy: ml.relayedBy }, { ts: ml.ts, backlog: isBacklog, prepend: parent?.isPrepend ?? false, batchTag: ml.parentBatch ?? undefined })

            if (!isBacklog && ml.from)
              clearTyping(bufferName, ml.from)
          }

          break
        }

        const info = backlogBatches.get(id)

        if (info) {
          // Free the scheduler slot first so the next queued target goes out
          // while we're still merging this batch, and so the sparse-batch
          // backfill below has somewhere to land.
          releaseHistorySlot(info.target)

          const batchBuf = findBuffer(info.target)

          if (batchBuf) {
            batchBuf.loadingOlderHistory = false

            // Mark ready after the first batch (LATEST) completes so lazy-load
            // won't fire before initial history has settled.
            batchBuf.historyReady = true

            // Fewer than the limit means no more history, except for a
            // time-bounded LATEST where it only means a quiet window.
            if (info.count < HISTORY_LIMIT && !info.hasSinceBound) {
              if (batchBuf.cacheBridgeTs != null && info.isPrepend) {
                // Bridging a reconnect gap (see below) and the server ran out of
                // history before reaching the cached block. Stop bridging and let
                // cache-first scroll-back serve the older cached messages.
                batchBuf.cacheBridgeTs = undefined
                batchBuf.cacheExhausted = false
              }
              else if (batchBuf.pendingBridgeFromTs == null) {
                // Only truly exhausted when there's no cached history below the
                // live front to fall back to. A sparse LATEST that overlaps the
                // cache still has older cached messages to scroll into.
                batchBuf.historyExhausted = true
              }
            }

            // --- reconnect gap detection (plain LATEST on JOIN) ---
            // If the oldest line in this LATEST sits above the newest cached line
            // with no overlap, more than HISTORY_LIMIT arrived while away. Drop the
            // disconnected cached block from the live view (IDB keeps it) and record
            // the boundary so scroll-back bridges the gap from the server first.
            if (!info.isPrepend && batchBuf.pendingBridgeFromTs != null) {
              const bridgeFrom = batchBuf.pendingBridgeFromTs

              batchBuf.pendingBridgeFromTs = undefined

              if (info.count >= HISTORY_LIMIT && info.oldestTs != null
                && info.oldestTs > bridgeFrom + HISTORY_FUZZ_MS) {
                const oldest = info.oldestTs
                const seam = batchBuf.messages.findIndex(m => m.ts.getTime() >= oldest)

                if (seam > 0)
                  batchBuf.messages.splice(0, seam)

                batchBuf.cacheBridgeTs = bridgeFrom
                batchBuf.historyAnchorMsgid = info.oldestMsgid
                batchBuf.historyAnchorTs = new Date(oldest).toISOString()
              }
            }

            // One splice so the reactive array updates once. Staging keeps the
            // server's oldest-first order.
            if (info.isPrepend && info.staging != null && info.staging.length > 0) {
              batchBuf.messages.splice(0, 0, ...info.staging)

              // Apply reactions replayed in a newer batch whose parents only just
              // arrived in this older page.
              for (const staged of info.staging) {
                if (staged.msgid != null)
                  drainPendingReactions(batchBuf, staged.msgid)
              }
            }

            // Trim the live buffer if loading older pages pushed it over the
            // cap. Gated on rendered height and capped to one page per batch,
            // same as the cache-first path.
            if (batchBuf.messages.length > MAX_LIVE_MESSAGES && windowTrimAllowed()) {
              batchBuf.messages.splice(Math.max(MAX_LIVE_MESSAGES, batchBuf.messages.length - CACHE_PAGE_SIZE))
              batchBuf.tailTrimmed = true
            }

            // Write CHATHISTORY-sourced pages to IDB so cache-first scroll-back
            // can serve them on the next session.
            if (info.isPrepend && info.staging != null) {
              for (const m of info.staging)
                scheduleMsgWrite(batchBuf.name, m)
            }

            // Advance the anchor to the oldest line delivered, even one that never
            // entered the buffer (reactions, suppressed relays). Otherwise a batch
            // of reactions re-requests the same window forever. Only ever move it
            // backwards so LATEST can't reset it.
            if (info.oldestTs != null) {
              const currentAnchorTs = batchBuf.historyAnchorTs != null ? Date.parse(batchBuf.historyAnchorTs) : Number.POSITIVE_INFINITY

              if (info.oldestTs < currentAnchorTs) {
                batchBuf.historyAnchorMsgid = info.oldestMsgid
                batchBuf.historyAnchorTs = new Date(info.oldestTs).toISOString()
              }
            }

            // Once a BEFORE page reaches cached territory the live front is
            // contiguous with the cache again, so cache-first scroll-back resumes.
            if (batchBuf.cacheBridgeTs != null && info.isPrepend && info.oldestTs != null
              && info.oldestTs <= batchBuf.cacheBridgeTs + HISTORY_FUZZ_MS) {
              batchBuf.cacheBridgeTs = undefined
              batchBuf.cacheExhausted = false
            }

            // A batch dominated by reactions/relays may add almost nothing visible.
            // Keep fetching until there's a screen's worth or history runs out,
            // with a retry cap against pathological histories.
            if (!batchBuf.historyExhausted && (batchBuf.autoFetchRetries ?? 0) < 20) {
              const visibleCount = batchBuf.messages.filter(m => m.type !== 'tagmsg').length

              if (visibleCount < HISTORY_LIMIT) {
                batchBuf.autoFetchRetries = (batchBuf.autoFetchRetries ?? 0) + 1
                void fetchOlderHistory(info.target)
              }
              else {
                batchBuf.autoFetchRetries = 0
              }
            }
          }

          // Emit the deferred "You joined" marker now that replayed history has
          // been appended, so the marker lands at the bottom (newest).
          if (pendingJoinMarkers.delete(info.target.toLowerCase())) {
            addToBuffer(info.target, 'channel', { type: 'join', channel: info.target, text: `You joined ${info.target}` })
          }

          backlogBatches.delete(id)
        }
      }
      break
    }

    case 'CHATHISTORY': {
      // Reply to `CHATHISTORY TARGETS`, one line per conversation. Only DMs matter
      // here since channels replay on JOIN. A closed DM is skipped unless the
      // server reports newer activity than when it was closed.
      if (params[0] === 'TARGETS') {
        const target = params[1] ?? ''

        // Skip service bots. Replaying our NickServ/ChanServ commands is noise and
        // would create a hidden service DM buffer.
        if (target && !target.startsWith('#') && !target.startsWith('&') && !SERVICE_NICKS.has(target.toLowerCase())) {
          const closedAt = closedDms[target.toLowerCase()]
          const latestTs = Date.parse(params[2] ?? '')
          if (closedAt != null && !(Number.isFinite(latestTs) && latestTs > closedAt))
            break

          if (closedAt != null)
            forgetClosedDm(target)
          if (readMarkerActive) {
            // Defer buffer creation until the MARKREAD reply arrives so we can
            // skip opening DMs that have no new activity since last read.
            pendingDmTargets.set(target.toLowerCase(), latestTs)
            send(`MARKREAD ${target}`)
          }
          else {
            // No read-marker cap: fall back to eager buffer creation.
            const dmBuf = getBuffer(target, 'pm')

            // A `since` LATEST drops messages beyond HISTORY_LIMIT, same as
            // channels, so mark the cached tail for the batch-end bridge.
            markPendingBridge(dmBuf)
            requestHistory(target, historyLowerBound())
          }
        }
      }
      break
    }

    case 'MARKREAD': {
      const mrTarget = params[0] ?? ''
      const mrTs = params[1] ?? ''
      const mrParsed = mrTs && mrTs !== '*'
        ? Date.parse(mrTs.startsWith('timestamp=') ? mrTs.slice('timestamp='.length) : mrTs)
        : Number.NaN

      // Seed readPositions before any history replays. This is also how a read on
      // another device reaches us. sync: false so we don't echo it back.
      if (mrTarget && Number.isFinite(mrParsed))
        saveReadPosition(mrTarget, mrParsed, { sync: false })

      // Resolve a deferred DM target from CHATHISTORY TARGETS. Only open it if
      // there's activity past the read marker, so stale DMs don't clutter the
      // sidebar on connect.
      const pendingLatestTs = pendingDmTargets.get(mrTarget.toLowerCase())
      if (pendingLatestTs != null) {
        pendingDmTargets.delete(mrTarget.toLowerCase())
        const readTs = Number.isFinite(mrParsed) ? mrParsed : (readPositions[mrTarget.toLowerCase()] ?? 0)
        if (pendingLatestTs > readTs) {
          const dmBuf = getBuffer(mrTarget, 'pm')

          // Bridge a reconnect gap when more than HISTORY_LIMIT messages were
          // missed in this DM (see the no-read-marker path above).
          markPendingBridge(dmBuf)
          requestHistory(mrTarget, historyLowerBound())
        }
      }
      break
    }

    case 'ERROR':
      addServer({ type: 'error', text: `Server error: ${params[0] ?? raw}` })
      break

    case '353': { // RPL_NAMREPLY
      const channel = params[2] ?? params[1] ?? ''
      const buf = getBuffer(channel, 'channel')
      ;(params[params.length - 1] ?? '').split(' ').filter(Boolean).forEach(n => addUser(buf, n))
      break
    }

    case '366': { // RPL_ENDOFNAMES
      // Send WHO to discover bot flags for all channel members.
      const whoChannel = params[1] ?? params[0] ?? ''
      if (whoChannel && (whoChannel.startsWith('#') || whoChannel.startsWith('&'))) {
        internalWhoChannels.add(whoChannel.toLowerCase())
        send(`WHO ${whoChannel}`)
      }
      break
    }

    case '315': { // RPL_ENDOFWHO
      const whoMask = params[1] ?? ''
      if (internalWhoChannels.delete(whoMask.toLowerCase()))
        break // internal bot-detection WHO

      addToActive({ type: 'system', text: params[params.length - 1] ?? '' }, { ts })
      break
    }

    case '352': { // RPL_WHOREPLY: <client> <channel> <user> <host> <server> <nick> <flags> :<hop> <realname>
      const whoReplyChannel = params[1] ?? ''
      const whoNick = params[5] ?? ''
      const whoFlags = params[6] ?? ''
      if (whoReplyChannel && whoNick) {
        const buf = findBuffer(whoReplyChannel)
        const user = buf?.users.find(u => u.name === whoNick)
        if (user) {
          if (whoFlags.includes('B'))
            user.bot = true

          // WHO flags: 'G' = gone (away), 'H' = here. Seed presence so the user
          // list reflects away state before any live away-notify update arrives.
          user.away = whoFlags.includes('G')
        }
      }
      break
    }

    case '375': // RPL_MOTDSTART
    case '372': // RPL_MOTD
    case '376': // RPL_ENDOFMOTD
      addServer({ type: 'system', text: params[params.length - 1] ?? '' }, { ts })
      break

    case '322': { // RPL_LIST
      const name = params[1] ?? ''
      const userCount = Number.parseInt(params[2] ?? '0', 10)
      const topic = params[3] ?? ''
      if (name)
        channelList.value.push({ name, userCount, topic })
      break
    }

    case '323': { // RPL_LISTEND
      channelListLoading.value = false

      // Request modes for channels not already in a joined buffer so the browser
      // can show indicators (e.g. registration-required warning) for unjoined channels.
      for (const entry of channelList.value) {
        if (!findBuffer(entry.name))
          send(`MODE ${entry.name}`)
      }
      break
    }

    case '324': { // RPL_CHANNELMODEIS
      const modeChannel = params[1] ?? ''
      const modeBuf = findBuffer(modeChannel)
      if (modeBuf)
        applyModeChanges(modeBuf, params.slice(2))

      // Also store modes on the channelList entry for the browser (unjoined channels).
      const modeStr = params[2] ?? ''
      const modeLetters = new Set([...modeStr].filter(c => c !== '+' && c !== '-'))
      if (modeLetters.size) {
        const listEntry = channelList.value.find(e => e.name.toLowerCase() === modeChannel.toLowerCase())
        if (listEntry)
          listEntry.modes = modeLetters
      }
      break
    }

    case '329': { // RPL_CREATIONTIME
      const ch329 = params[1] ?? ''
      const ts329 = Number(params[2] ?? '')
      if (ch329 && Number.isFinite(ts329) && ts329 > 0) {
        const b329 = findBuffer(ch329)
        if (b329)
          b329.createdAt = ts329 * 1000
      }
      break
    }

    case '346': { // RPL_INVITELIST
      const ch346 = params[1] ?? ''
      const buf346 = findBuffer(ch346)
      if (buf346) {
        buf346.inviteList ??= []
        buf346.inviteList.push({ mask: params[2] ?? '', setBy: params[3] ?? '', ts: Number(params[4] ?? '0') * 1000 })
      }
      break
    }

    case '347': { // RPL_ENDOFINVITELIST
      const buf347 = findBuffer(params[1] ?? '')
      if (buf347)
        buf347.inviteListReady = true
      break
    }

    case '348': { // RPL_EXCEPTLIST
      const ch348 = params[1] ?? ''
      const buf348 = findBuffer(ch348)
      if (buf348) {
        buf348.exceptList ??= []
        buf348.exceptList.push({ mask: params[2] ?? '', setBy: params[3] ?? '', ts: Number(params[4] ?? '0') * 1000 })
      }
      break
    }

    case '349': { // RPL_ENDOFEXCEPTLIST
      const buf349 = findBuffer(params[1] ?? '')
      if (buf349)
        buf349.exceptListReady = true
      break
    }

    case '367': { // RPL_BANLIST
      const ch367 = params[1] ?? ''
      const buf367 = findBuffer(ch367)
      if (buf367) {
        buf367.banList ??= []
        buf367.banList.push({ mask: params[2] ?? '', setBy: params[3] ?? '', ts: Number(params[4] ?? '0') * 1000 })
      }
      break
    }

    case '368': { // RPL_ENDOFBANLIST
      const buf368 = findBuffer(params[1] ?? '')
      if (buf368)
        buf368.banListReady = true
      break
    }

    case '332': { // RPL_TOPIC
      const channel = params[1] ?? SERVER_BUFFER
      getBuffer(channel, 'channel').topic = params[2] ?? ''
      break
    }

    case '333': // RPL_TOPICWHOTIME: ignored
      break

    case 'TOPIC': { // live topic change
      const channel = params[0] ?? SERVER_BUFFER
      const buf = findBuffer(channel)
      if (buf)
        buf.topic = params[1] ?? ''
      break
    }

    case 'NOTICE': {
      const noticeTgt = params[0] ?? ''
      const noticeText = params[params.length - 1] ?? ''
      const isAddressedToUs = noticeTgt.toLowerCase() === nick.value.toLowerCase()
      const fromNickServ = nickFrom.toLowerCase() === 'nickserv'
      const fromChanServ = nickFrom.toLowerCase() === 'chanserv'

      // Parse ChanServ registration status from background INFO probes or live responses.
      if (fromChanServ && isAddressedToUs) {
        // "Information on #channel:" opens a successful INFO response.
        const infoMatch = /^Information on (#\S+):/i.exec(noticeText)

        if (infoMatch) {
          const b = findBuffer(infoMatch[1] ?? '')
          if (b)
            b.registered = true
        }

        // "No channel registration found for #channel."
        const noRegMatch = /no channel registration found for (#\S+)/i.exec(noticeText)

        if (noRegMatch) {
          const b = findBuffer(noRegMatch[1] ?? '')
          if (b)
            b.registered = false
        }

        // "Channel #channel is registered" / "Channel #channel is now registered"
        const regMatch = /channel (#\S+) is (?:now )?registered/i.exec(noticeText)

        if (regMatch) {
          const b = findBuffer(regMatch[1] ?? '')
          if (b)
            b.registered = true
        }

        // "Channel #channel has been dropped" / "Channel #channel is now unregistered"
        const dropMatch = /channel (#\S+) (?:has been dropped|is now unregistered)/i.exec(noticeText)

        if (dropMatch) {
          const b = findBuffer(dropMatch[1] ?? '')
          if (b)
            b.registered = false
          _pendingDropChannels.delete((dropMatch[1] ?? '').toLowerCase())
        }

        // "Founder         : nick" from ChanServ INFO
        const founderMatch = /^Founder[ \t]*:[ \t]*(\S+)/i.exec(noticeText)

        if (founderMatch) {
          // The channel name isn't in this line; find whichever channel is being probed
          for (const probedCh of _probingChanServChannels) {
            const b = findBuffer(probedCh)
            if (b) {
              b.founder = founderMatch[1]
              break
            }
          }
        }

        // "Registered      : Sep 21 00:00:00 2019 UTC" from ChanServ INFO (fallback if 329 wasn't sent)
        const registeredMatch = /^Registered[ \t]*:\s*(\S.*)/i.exec(noticeText)

        if (registeredMatch) {
          const parsedTs = Date.parse(registeredMatch[1]?.trim() ?? '')
          if (Number.isFinite(parsedTs) && parsedTs > 0) {
            for (const probedCh of _probingChanServChannels) {
              const b = findBuffer(probedCh)
              if (b && !b.createdAt) {
                b.createdAt = parsedTs
                break
              }
            }
          }
        }

        // Auto-confirm two-step DROP: "To confirm, run this command: /CS UNREGISTER #ch code"
        const dropConfirmMatch = /\/CS UNREGISTER (#\S+) (\S+)/i.exec(noticeText)

        if (dropConfirmMatch) {
          const chKey = (dropConfirmMatch[1] ?? '').toLowerCase()
          if (_pendingDropChannels.has(chKey)) {
            _pendingDropChannels.delete(chKey)
            suppressChanServResponse(dropConfirmMatch[1] ?? '')
            send(`PRIVMSG ChanServ :UNREGISTER ${dropConfirmMatch[1]} ${dropConfirmMatch[2]}`)
            break
          }
        }

        // Suppress all ChanServ output while any probe is in flight. Only the probe
        // timer ends it, so multi-line responses aren't half suppressed.
        if (_probingChanServChannels.size > 0)
          break
      }

      // Always extract the email claim and always-on flag regardless of whether we show the message.
      if (fromNickServ && isAddressedToUs) {
        const emailMatch = /^Email address:(.+)$/.exec(noticeText)

        if (emailMatch) {
          accountEmail.value = emailMatch[1]?.trim() ?? ''
          if (import.meta.client)
            localStorage.setItem(STORAGE_IDENTITY_EMAIL, accountEmail.value)
        }

        // Parse always-on from the explicit GET response or INFO flags.
        const alwaysOnMatch = /stored always-on setting is:\s*(\w+)/i.exec(noticeText)

        if (alwaysOnMatch) {
          accountAlwaysOn.value = alwaysOnMatch[1]?.toLowerCase() === 'enabled'
          if (import.meta.client)
            localStorage.setItem(STORAGE_IDENTITY_ALWAYS_ON, String(accountAlwaysOn.value))
          accountInfoFetched.value = true
        }
        else if (/^Flags:.*\balways-on\b/i.test(noticeText)) {
          accountAlwaysOn.value = true
          if (import.meta.client)
            localStorage.setItem(STORAGE_IDENTITY_ALWAYS_ON, 'true')
          accountInfoFetched.value = true
        }

        // Parse dm-history from the explicit GET response. The "stored" line is
        // the preference; the "Given current server settings" follow-up is what
        // it resolves to (e.g. what 'default' actually means on this server).
        const dmHistoryMatch = /stored direct message history setting is:\s*(\w+)/i.exec(noticeText)

        if (dmHistoryMatch) {
          const value = dmHistoryMatch[1]?.toLowerCase() ?? ''
          if (DM_HISTORY_VALUES.has(value)) {
            accountDmHistory.value = value as DmHistorySetting
            if (import.meta.client)
              localStorage.setItem(STORAGE_IDENTITY_DM_HISTORY, value)
          }
        }

        const dmHistoryEffectiveMatch = /current server settings.*direct message history setting is:\s*(\w+)/i.exec(noticeText)

        if (dmHistoryEffectiveMatch) {
          const value = dmHistoryEffectiveMatch[1]?.toLowerCase() ?? ''
          if (DM_HISTORY_VALUES.has(value)) {
            accountDmHistoryEffective.value = value as DmHistorySetting
            if (import.meta.client)
              localStorage.setItem(STORAGE_IDENTITY_DM_HISTORY_EFFECTIVE, value)
          }
        }
      }

      // Swallow NickServ output during the silent background probe or a suppressed SET op.
      if (fromNickServ && isAddressedToUs && (probingNickServInfo || suppressingNickServOp))
        break

      // Surface NickServ replies only inside an open conversation with it.
      // Everything else goes to the internal service log.
      if (fromNickServ && isAddressedToUs) {
        if (findBuffer(nickFrom)?.kind === 'pm')
          addToBuffer(nickFrom, 'pm', { type: 'system', from: nickFrom, text: noticeText }, { ts })
        else
          addServiceLog({ type: 'system', from: nickFrom, text: noticeText }, { ts })
        break
      }

      if (isAddressedToUs && nickFrom) {
        addToBuffer(nickFrom, 'pm', { type: 'system', from: nickFrom, text: noticeText }, { ts })
      }
      else if (noticeTgt.startsWith('#') || noticeTgt.startsWith('&')) {
        // Server-generated TAGMSG relay notices. The TAGMSG case has the full context.
        if (/\bsent a TAGMSG\b/i.test(noticeText))
          break

        addToBuffer(noticeTgt, 'channel', { type: 'system', from: nickFrom, text: noticeText }, { ts })
      }
      else {
        addServer({ type: 'system', from: nickFrom.length > 0 ? nickFrom : undefined, text: noticeText }, { ts })
      }
      break
    }

    // WHOIS numerics fill the structured store when tracked, else show in the buffer.
    case '301': { // RPL_AWAY
      const [, awayNick, awayMsg] = params
      if (awayNick) {
        const key = awayNick.toLowerCase()
        if (_whoisStore.value.has(key)) {
          const next = new Map(_whoisStore.value)
          next.set(key, { ...next.get(key)!, away: awayMsg ?? '' })
          _whoisStore.value = next
        }
        else {
          addToActive({ type: 'system', text: `[${awayNick}] is away: ${awayMsg ?? ''}` }, { ts })
        }
      }
      break
    }

    case '311': { // RPL_WHOISUSER: nick user host * :realname
      const [, wNick, wUser, wHost,, wReal] = params
      if (wNick) {
        const key = wNick.toLowerCase()
        if (_whoisStore.value.has(key)) {
          const next = new Map(_whoisStore.value)
          next.set(key, { ...next.get(key)!, user: wUser ?? '', host: wHost ?? '', realname: wReal ?? '', loading: true })
          _whoisStore.value = next
        }
        else {
          addToActive({ type: 'system', text: `[${wNick}] (${wUser ?? ''}@${wHost ?? ''}): ${wReal ?? ''}` }, { ts })
        }
      }
      break
    }

    case '312': { // RPL_WHOISSERVER: nick server :serverinfo
      const [, wNick, wServer, wInfo] = params
      if (wNick) {
        const key = wNick.toLowerCase()
        if (_whoisStore.value.has(key)) {
          const next = new Map(_whoisStore.value)
          next.set(key, { ...next.get(key)!, server: wServer ?? '', serverInfo: wInfo ?? '' })
          _whoisStore.value = next
        }
        else {
          addToActive({ type: 'system', text: `[${wNick}] ${wServer ?? ''} (${wInfo ?? ''})` }, { ts })
        }
      }
      break
    }

    case '313': { // RPL_WHOISOPERATOR
      const [, wNick, wMsg] = params
      if (wNick) {
        const key = wNick.toLowerCase()
        if (_whoisStore.value.has(key)) {
          const next = new Map(_whoisStore.value)
          next.set(key, { ...next.get(key)!, isOper: true })
          _whoisStore.value = next
        }
        else {
          addToActive({ type: 'system', text: `[${wNick}] ${wMsg ?? ''}` }, { ts })
        }
      }
      break
    }

    case '317': { // RPL_WHOISIDLE: nick idlesecs signonts :message
      const [, wNick, wIdle, wSignon] = params
      if (wNick) {
        const idleSecs = Number.parseInt(wIdle ?? '0', 10)
        const h = Math.floor(idleSecs / 3600)
        const m = Math.floor((idleSecs % 3600) / 60)
        const s = idleSecs % 60
        const idleFmt = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
        const signonTs = wSignon ? new Date(Number.parseInt(wSignon, 10) * 1000).toLocaleString() : ''
        const key = wNick.toLowerCase()
        if (_whoisStore.value.has(key)) {
          const next = new Map(_whoisStore.value)
          next.set(key, { ...next.get(key)!, idleFmt, signonTs })
          _whoisStore.value = next
        }
        else {
          addToActive({ type: 'system', text: `[${wNick}] idle ${idleFmt}${signonTs ? `, signon: ${signonTs}` : ''}` }, { ts })
        }
      }
      break
    }

    case '318': { // RPL_ENDOFWHOIS
      const [, wNick] = params
      if (wNick) {
        const key = wNick.toLowerCase()
        if (_whoisStore.value.has(key)) {
          const next = new Map(_whoisStore.value)
          next.set(key, { ...next.get(key)!, loading: false })
          _whoisStore.value = next
        }
        else {
          addToActive({ type: 'system', text: `[${wNick}] End of /WHOIS list` }, { ts })
        }
      }
      break
    }

    case '319': { // RPL_WHOISCHANNELS
      const [, wNick, wChans] = params
      if (wNick) {
        const key = wNick.toLowerCase()
        if (_whoisStore.value.has(key)) {
          const next = new Map(_whoisStore.value)
          next.set(key, { ...next.get(key)!, channels: wChans ?? '' })
          _whoisStore.value = next
        }
        else {
          addToActive({ type: 'system', text: `[${wNick}] ${wChans ?? ''}` }, { ts })
        }
      }
      break
    }

    case '330': { // RPL_WHOISACCOUNT: nick account :message
      const [, wNick, wAccount] = params
      if (wNick) {
        const key = wNick.toLowerCase()
        if (_whoisStore.value.has(key)) {
          const next = new Map(_whoisStore.value)
          next.set(key, { ...next.get(key)!, account: wAccount ?? '' })
          _whoisStore.value = next
        }
        else {
          addToActive({ type: 'system', text: `[${wNick}] is logged in as ${wAccount ?? ''}` }, { ts })
        }
      }
      break
    }

    case '338': { // RPL_WHOISACTUALLY (UnrealIRCd actual host)
      const [, wNick,, wMsg] = params
      if (wNick) {
        const key = wNick.toLowerCase()
        if (!_whoisStore.value.has(key))
          addToActive({ type: 'system', text: `[${wNick}] ${wMsg ?? params[params.length - 1] ?? ''}` }, { ts })
      }
      break
    }

    case '671': { // RPL_WHOISSECURE (UnrealIRCd TLS)
      const [, wNick] = params
      if (wNick) {
        const key = wNick.toLowerCase()
        if (_whoisStore.value.has(key)) {
          const next = new Map(_whoisStore.value)
          next.set(key, { ...next.get(key)!, secure: true })
          _whoisStore.value = next
        }
        else {
          addToActive({ type: 'system', text: `[${wNick}] is using a secure connection` }, { ts })
        }
      }
      break
    }

    case '379': { // RPL_WHOISMODES (UnrealIRCd user modes)
      const [, wNick] = params
      if (wNick) {
        const key = wNick.toLowerCase()

        // A tracked WHOIS drops this, since the modal doesn't show modes.
        if (!_whoisStore.value.has(key))
          addToActive({ type: 'system', text: `[${wNick}] ${params[params.length - 1] ?? ''}` }, { ts })
      }
      break
    }

    case 'TAGMSG': {
      if (!nickFrom)
        break

      const tagTarget = params[0] ?? ''

      // IRCv3 react/unreact client tags (https://ircv3.net/specs/client-tags/react).
      // Always paired with +reply pointing at the parent message's msgid. We accept
      // both the work-in-progress `+draft/` names and the eventual unprefixed names.
      const reactValue = tags['+draft/react'] ?? tags['+react']
      const unreactValue = tags['+draft/unreact'] ?? tags['+unreact']
      const reactReplyTo = tags['+reply']
      const reactEmote = reactValue ?? unreactValue
      if (reactReplyTo && reactEmote) {
        const isReactChannel = tagTarget.startsWith('#') || tagTarget.startsWith('&')
        const isSelf = nickFrom === nick.value
        const reactBufName = isReactChannel ? tagTarget : (isSelf ? tagTarget : nickFrom)
        const reactBuf = findBuffer(reactBufName)
        if (reactBuf && EMOJI_RE.test(reactEmote)) {
          const staged = batchTag != null ? backlogBatches.get(batchTag)?.staging : undefined
          applyReaction(reactBuf, reactReplyTo, reactEmote, nickFrom, unreactValue != null, staged)
        }
        break
      }

      // IRCv3 typing notification (https://ircv3.net/specs/client-tags/typing)
      const typingState = tags['+typing'] ?? tags['draft/typing']
      if (typingState) {
        if (!backlog && nickFrom !== nick.value) {
          const isTypingChannel = tagTarget.startsWith('#') || tagTarget.startsWith('&')
          const typingBufName = isTypingChannel ? tagTarget : nickFrom
          if (typingState === 'active')
            setTyping(typingBufName, nickFrom, 6000)
          else if (typingState === 'paused')
            setTyping(typingBufName, nickFrom, 30000)
          else if (typingState === 'done')
            clearTyping(typingBufName, nickFrom)
        }
        break
      }

      // Unknown tags: nothing user-meaningful to display.
      break
    }

    case 'REDACT': {
      // IRCv3 draft/message-redaction: :redactor REDACT <target> <msgid> [:reason]
      // Arrives live and inside CHATHISTORY batches. The redactor may be the
      // author or a channel op.
      if (!nickFrom)
        break

      const redactTarget = params[0] ?? ''
      const redactMsgid = params[1] ?? ''
      const redactReason = params.length > 2 ? (params[params.length - 1] ?? '') : ''
      const isRedactChannel = redactTarget.startsWith('#') || redactTarget.startsWith('&')
      const isSelfRedact = nickFrom === nick.value
      const redactBufName = isRedactChannel ? redactTarget : (isSelfRedact ? redactTarget : nickFrom)
      const redactBuf = findBuffer(redactBufName)
      if (redactBuf && redactMsgid)
        applyRedaction(redactBuf, redactMsgid, nickFrom, redactReason)
      break
    }

    case '473': { // ERR_INVITEONLYCHAN
      const invChannel = params[1] ?? ''
      if (invChannel) {
        closeBuffer(invChannel)
        channelJoinBlocked.value = { channel: invChannel, reason: 'This channel is invite-only. You need to be invited by a channel operator.' }
      }
      break
    }

    case '477': { // ERR_NEEDREGGEDNICK
      const regChannel = params[1] ?? ''
      if (regChannel) {
        closeBuffer(regChannel)
        channelJoinBlocked.value = { channel: regChannel, reason: 'This channel requires a registered account. Sign in to join.' }
      }
      break
    }

    case '475': { // ERR_BADCHANNELKEY
      const keyChannel = params[1] ?? ''
      if (keyChannel) {
        closeBuffer(keyChannel)
        channelKeyError.value = channelKeyPrompt.value !== null
        channelKeyPrompt.value = keyChannel
      }
      break
    }

    case '761': { // RPL_KEYVALUE (draft/metadata-2)
      const metaTarget = params[1] ?? ''
      const metaKey = params[2] ?? ''
      const metaValue = params[params.length - 1] ?? ''
      const metaBuf = findBuffer(metaTarget)
      if (metaBuf && metaKey) {
        metaBuf.metadata ??= new Map()
        metaBuf.metadata.set(metaKey, metaValue)
        metaBuf.metadata = new Map(metaBuf.metadata)
      }

      // Mirror channel metadata into the cache so unjoined parents are covered.
      if (metaKey && (metaTarget.startsWith('#') || metaTarget.startsWith('&')))
        cacheChannelMeta(metaTarget, metaKey, metaValue)

      // Per-user metadata: store in userMetaStore for nick targets.
      else if (metaKey && metaTarget && metaTarget !== '*')
        setUserMeta(metaTarget, metaKey, metaValue || null)
      break
    }

    case '762': { // RPL_METADATAEND
      const endTarget = params[1]?.toLowerCase()
      if (endTarget && endTarget !== '*' && !channelMetaResolved.value.has(endTarget)) {
        channelMetaResolved.value = new Set(channelMetaResolved.value).add(endTarget)
      }
      break
    }

    case '770': // RPL_METADATASUBOK
      break

    case '766': // RPL_NOMATCHINGKEY
      break

    case '401': { // ERR_NOSUCHNICK
      const [, badNick] = params
      if (badNick) {
        const key = badNick.toLowerCase()
        if (_whoisStore.value.has(key)) {
          const next = new Map(_whoisStore.value)
          next.set(key, { ...next.get(key)!, loading: false, notFound: true })
          _whoisStore.value = next
          break
        }
      }
      addToActive({ type: 'system', text: params[params.length - 1] ?? raw }, { ts })
      break
    }

    case '400': // ERR_UNKNOWNERROR
      // Ergo sends this when it can't assemble an outgoing message (e.g. bad
      // stored history). Keep it out of the active channel.
      addServer({ type: 'error', text: params[params.length - 1] ?? raw }, { ts })
      break

    case 'METADATA': {
      // Server-pushed metadata change notification
      // :server METADATA <target> <key> <visibility> :<value>
      const metaTarget = params[0] ?? ''
      const metaKey = params[1] ?? ''

      // Value is the trailing (last) param; empty string means key was deleted
      const metaValue = params.length >= 4 ? (params[3] ?? '') : ''
      const metaBuf = findBuffer(metaTarget)
      if (metaBuf && metaKey) {
        metaBuf.metadata ??= new Map()
        if (metaValue)
          metaBuf.metadata.set(metaKey, metaValue)
        else
          metaBuf.metadata.delete(metaKey)
        metaBuf.metadata = new Map(metaBuf.metadata)
      }

      // Mirror channel metadata into the cache (empty value = key deleted).
      if (metaKey && (metaTarget.startsWith('#') || metaTarget.startsWith('&')))
        cacheChannelMeta(metaTarget, metaKey, metaValue || null)

      // Per-user metadata: live push for nick targets.
      else if (metaKey && metaTarget)
        setUserMeta(metaTarget, metaKey, metaValue || null)
      break
    }

    case 'FAIL': {
      const failCmd = params[0]?.toUpperCase() ?? ''

      if (failCmd === 'METADATA') {
        // Background parent-metadata probes legitimately fail (channel missing
        // or permission denied), so swallow those rather than surfacing a
        // server error the user didn't ask for.
        const isBackgroundProbe = params.some(p => _backgroundMetaTargets.has(p.toLowerCase()))

        if (isBackgroundProbe) {
          // Mark probed targets as resolved so pending-state logic can unblock.
          const probed = params.filter(p => _backgroundMetaTargets.has(p.toLowerCase()))

          if (probed.length) {
            const next = new Set(channelMetaResolved.value)

            for (const t of probed) next.add(t.toLowerCase())

            channelMetaResolved.value = next
          }
        }
        else {
          const desc = params[params.length - 1] ?? 'Metadata error'
          addServer({ type: 'error', text: `Metadata: ${desc}` }, { ts })
        }
      }
      else if (failCmd === 'RENAME') {
        // draft/channel-rename failures (CHANNEL_NAME_IN_USE, CANNOT_RENAME, ...).
        const desc = params[params.length - 1] ?? 'The channel could not be renamed'
        addServer({ type: 'error', text: `Rename failed: ${desc}` }, { ts })
      }
      else if (failCmd === 'REDACT') {
        // draft/message-redaction failures (REDACT_FORBIDDEN, UNKNOWN_MSGID, ...).
        const desc = params[params.length - 1] ?? 'The message could not be deleted'
        addToActive({ type: 'error', text: `Delete failed: ${desc}` }, { ts })
      }
      else if (failCmd === 'CHATHISTORY') {
        // No batch will arrive for this request, so nothing else frees its
        // scheduler slot. The target sits in a middle param when Ergo names it;
        // releasing by every param is harmless since unknown ones no-op.
        for (const p of params.slice(1)) releaseHistorySlot(p)
      }
      else if (failCmd === 'WEBPUSH') {
        // draft/webpush failures (INVALID_PARAMS, INTERNAL_ERROR).
        const desc = params[params.length - 1] ?? 'Push subscription failed'
        addServer({ type: 'error', text: `Push notifications: ${desc}` }, { ts })
      }
      break
    }

    default:
      if (/^\d+$/.test(command)) {
        // Unhandled numerics go to the server buffer so handshake numerics don't
        // bleed into whichever channel is open.
        const numText = params[params.length - 1] ?? ''
        if (numText)
          addServer({ type: 'system', text: numText }, { ts })
      }
      else {
        addServer({ type: 'system', text: raw }, { ts })
      }
  }
}

// --- Connection lifecycle ----------------------------------------------------
function _scheduleReconnect() {
  if (_fatalError) {
    // Leave connState as 'error' so the failure reason stays on screen.
    return
  }
  if (_intentionalDisconnect) {
    connState.value = 'disconnected'
    return
  }
  if (_reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    connState.value = 'offline'
    return
  }
  _reconnectAttempts++
  const delay = _reconnectAttempts * 2000
  connState.value = 'connecting'
  addServer({ type: 'system', text: `Reconnecting in ${delay / 1000}s (attempt ${_reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})...` })
  _reconnectTimer = setTimeout(() => {
    _reconnectTimer = null
    openSocket()
  }, delay)
}

function openSocket() {
  if (!import.meta.client)
    return

  if (ws) {
    ws.close()
    ws = null
  }

  capLs = []
  relaySeparator.value = null
  saslMech = null
  saslFailed = false
  _fatalError = false
  probingNickServInfo = false
  if (probeTimer !== null) {
    clearTimeout(probeTimer)
    probeTimer = null
  }

  // Cancel any in-flight settle timer from a previous connection, but keep the
  // pending value: connect() sets it right before calling openSocket(), and 001
  // re-arms the timer. On a bare reconnect the value is already null.
  if (_defaultChannelFallbackTimer !== null) {
    clearTimeout(_defaultChannelFallbackTimer)
    _defaultChannelFallbackTimer = null
  }
  backlogBatches.clear()
  pendingReactions.clear()
  pendingJoinMarkers.clear()
  explicitJoinIntents.clear()
  pendingBeforeTargets.clear()
  pendingTimeBoundTargets.clear()
  resetHistoryQueue()
  pendingDmTargets.clear()
  serviceLog.value = []
  chatHistorySupported.value = false
  vapidKey.value = null
  echoMessageActive = false
  messageTagsActive = false
  multilineActive = false
  multilineMaxBytes = 0
  multilineMaxLines = 0
  multilineBatches.clear()
  readMarkerActive = false
  resetBuffers()

  // With a persisted target channel, pre-create a stub buffer and switch to it so
  // the user stays in that channel throughout instead of seeing the server tab.
  if (activeName.value === SERVER_BUFFER && inputChannel.value) {
    getBuffer(inputChannel.value, 'channel')
    activeName.value = inputChannel.value
  }
  account.value = ''
  accountEmail.value = import.meta.client ? localStorage.getItem(STORAGE_IDENTITY_EMAIL) : null
  const _cachedAlwaysOn = import.meta.client ? localStorage.getItem(STORAGE_IDENTITY_ALWAYS_ON) : null
  accountAlwaysOn.value = _cachedAlwaysOn === null ? null : _cachedAlwaysOn === 'true'
  const _cachedDmHistory = import.meta.client ? localStorage.getItem(STORAGE_IDENTITY_DM_HISTORY) : null
  accountDmHistory.value = _cachedDmHistory !== null && DM_HISTORY_VALUES.has(_cachedDmHistory) ? _cachedDmHistory as DmHistorySetting : null
  const _cachedDmHistoryEffective = import.meta.client ? localStorage.getItem(STORAGE_IDENTITY_DM_HISTORY_EFFECTIVE) : null
  accountDmHistoryEffective.value = _cachedDmHistoryEffective !== null && DM_HISTORY_VALUES.has(_cachedDmHistoryEffective) ? _cachedDmHistoryEffective as DmHistorySetting : null
  accountInfoFetched.value = false
  connState.value = 'connecting'
  addServer({ type: 'system', text: `Connecting to ${WS_URL}...` })

  persistNick(inputNick.value)
  persistChannel(inputChannel.value)

  // Tag the persisted identity so a later signed-out load can discard it.
  markIdentityAuthed(authCreds != null)
  if (authCreds != null)
    markHadAccount()

  try {
    // Chrome fails the handshake when it requests a subprotocol and the server
    // echoes none (Firefox/Safari don't). Ergo only echoes the IRCv3 names, so
    // request `text.ircv3.net`, which also gets UTF-8 text frames.
    ws = new WebSocket(WS_URL, ['text.ircv3.net'])
  }
  catch (e) {
    addServer({ type: 'error', text: `Failed to open WebSocket: ${String(e)}` })
    _scheduleReconnect()
    return
  }

  ws.onopen = () => {
    const n = inputNick.value !== '' ? inputNick.value : `anon-${Math.random().toString(36).slice(2, 7)}`
    send('CAP LS 302')
    send(`NICK ${n}`)
    send(`USER ${n} 0 * :Hivecom Web Client`)
  }

  ws.onmessage = (evt) => {
    if (typeof evt.data !== 'string')
      return

    // Ergo's WebSocket gateway delivers one IRC message per frame, but a frame
    // may carry several messages and may or may not include the trailing CRLF.
    // Split tolerantly on \n (dropping any \r) so no line is lost or merged.
    evt.data.split('\n').forEach((line) => {
      const trimmed = line.endsWith('\r') ? line.slice(0, -1) : line
      if (trimmed)
        handleMessage(trimmed)
    })
  }

  ws.onerror = () => {
    _stopPinging()
    addServer({ type: 'error', text: 'WebSocket error - check console for details.' })
  }

  ws.onclose = (evt) => {
    _stopPinging()
    addServer({ type: 'system', text: `Disconnected (code ${evt.code})` })
    failInFlightSends()
    for (const timer of typingTimers.values())
      clearTimeout(timer)
    typingTimers.clear()
    for (const buf of buffers.value) {
      buf.users = []
      buf.joined = false
      buf.typing = []
    }
    ws = null
    _scheduleReconnect()
  }
}

function cancelDefaultChannelFallback() {
  _defaultChannelFallback = null
  if (_defaultChannelFallbackTimer !== null) {
    clearTimeout(_defaultChannelFallbackTimer)
    _defaultChannelFallbackTimer = null
  }
}

// (Re)arm the settle timer. Called on 001 and refreshed on each restored JOIN, so
// the default channel is only joined once the restore burst is quiet and nothing
// was restored. No-op when nothing is pending.
function scheduleDefaultChannelFallback() {
  if (_defaultChannelFallback == null)
    return

  if (_defaultChannelFallbackTimer !== null)
    clearTimeout(_defaultChannelFallbackTimer)
  _defaultChannelFallbackTimer = setTimeout(() => {
    _defaultChannelFallbackTimer = null
    const target = _defaultChannelFallback
    _defaultChannelFallback = null
    if (target == null || connState.value !== 'connected')
      return

    // The server already gave us a channel (always-on restore); don't force the
    // default on top of it.
    if (buffers.value.some(b => b.kind === 'channel'))
      return

    // Silent landing join, not an explicit intent. setActive persists it as the
    // configured channel for next time.
    send(`JOIN ${target}`)
    getBuffer(target, 'channel')
    setActive(target)
  }, DEFAULT_CHANNEL_SETTLE_MS)
}

/**
 * Connect as the signed-in user when an identity provider is registered, else as
 * the nickname in the form. A failed SASL continues without a verified account.
 */
async function connect(skipAutoJoin = false) {
  _skipAutoJoin = skipAutoJoin
  _intentionalDisconnect = false
  _reconnectAttempts = 0

  if (_reconnectTimer !== null) {
    clearTimeout(_reconnectTimer)
    _reconnectTimer = null
  }

  authCreds = null
  useAnonymous = false

  if (identityProvider) {
    let creds: ChatIdentity | null = null

    try {
      creds = await identityProvider()
    }
    catch {
      creds = null
    }

    if (creds != null && creds.token !== '' && creds.username !== '') {
      authCreds = creds
      inputNick.value = creds.username
    }
    else {
      // A provider is registered but resolved no valid session (e.g. an expired
      // token). Don't fall through to a guest registration, which would silently
      // downgrade the user to anon. Stay disconnected so the sign-in prompt shows.
      connState.value = 'disconnected'
      return
    }
  }

  // Only fall back to the default channel when the user never configured one (key
  // absent). Defer it: an always-on account usually gets channels restored on
  // connect, and forcing the default on top of those is wrong. An empty-string
  // value means they left all channels on purpose.
  if (!inputChannel.value && (import.meta.client ? localStorage.getItem(STORAGE_CHANNEL) === null : true))
    _defaultChannelFallback = defaultChannel(false)
  else
    _defaultChannelFallback = null
  openSocket()
}

/** Connect as an anonymous guest via SASL ANONYMOUS (no account, no JWT). */
function connectAsAnon() {
  _intentionalDisconnect = false
  _skipAutoJoin = false

  // Anon guests have no always-on restore, so keep the eager default below and
  // drop any deferred fallback left over from a prior signed-in attempt.
  cancelDefaultChannelFallback()
  _reconnectAttempts = 0
  if (_reconnectTimer !== null) {
    clearTimeout(_reconnectTimer)
    _reconnectTimer = null
  }
  authCreds = null
  useAnonymous = true
  if (!inputChannel.value && localStorage.getItem(STORAGE_CHANNEL) === null)
    inputChannel.value = defaultChannel(true)
  openSocket()
}

function disconnect() {
  _intentionalDisconnect = true
  everConnected.value = false
  cancelDefaultChannelFallback()
  _reconnectAttempts = 0
  if (_reconnectTimer !== null) {
    clearTimeout(_reconnectTimer)
    _reconnectTimer = null
  }
  if (ws) {
    send('QUIT :Leaving')
    ws.close()
  }
  resetBuffers()
  connState.value = 'disconnected'
}

// --- User actions ------------------------------------------------------------
function setActive(name: string) {
  // Leaving a channel is one of the moments the "new messages" line resolves
  // (along with sending a message or clicking the line): catch the buffer up so
  // the line and badge clear and the marker sits at the last message you saw.
  const prev = activeName.value
  if (prev && prev.toLowerCase() !== name.toLowerCase()) {
    const prevBuf = findBuffer(prev)
    if (prevBuf && prevBuf.kind !== 'server')
      markBufferRead(prevBuf.name)
    previousActiveName.value = prev
  }

  activeName.value = name

  // This buffer just became the one on screen, so any history still sitting in
  // the scheduler queue for it goes out now instead of waiting its turn.
  promoteHistoryRequests(name)
  const buf = findBuffer(name)

  // Entering a channel clears its badge but keeps the read line, so you can see
  // where you left off. Order matters: zero the counts first, because
  // saveReadPosition only drops the line (reconcileUnread) while a count is set.
  // The line resolves when you act: send, leave, or click it.
  if (buf && buf.kind !== 'server') {
    buf.unread = 0
    buf.mentions = 0
    const last = buf.messages[buf.messages.length - 1]
    if (last)
      saveReadPosition(buf.name, last.ts.getTime())
  }

  // Persist the last active channel so the next connect auto-joins and lands here.
  if (buf?.kind === 'channel') {
    inputChannel.value = name
    persistChannel(name)
  }
}

function activateServerLog() {
  serverLogPinned.value = true
  setActive(SERVER_BUFFER)
}

function closeServerLog() {
  serverLogPinned.value = false
  const first = buffers.value.find(b => b.kind === 'channel' || b.kind === 'pm')
  if (first)
    setActive(first.name)
}

function joinChannel(name: string, key?: string) {
  const channel = name.startsWith('#') ? name : `#${name}`

  // Mark this as a deliberate, user-initiated join so the self-JOIN handler
  // renders the "You joined" marker (server auto-joins never set this).
  explicitJoinIntents.add(channel.toLowerCase())
  send(key ? `JOIN ${channel} ${key}` : `JOIN ${channel}`)
  getBuffer(channel, 'channel')
  setActive(channel)
}

/**
 * Rename a channel via IRCv3 draft/channel-rename. The new name keeps the old
 * prefix type (#/&) so the server doesn't reject a prefix change. The buffer
 * migrates when the server echoes the RENAME.
 */
function renameChannel(oldName: string, newName: string, reason?: string) {
  const prefix = oldName[0] ?? '#'
  const slug = newName.trim().replace(/^[#&]+/, '')
  if (!slug)
    return

  const target = `${prefix}${slug}`
  if (target === oldName)
    return

  const trimmedReason = reason?.trim()
  send(trimmedReason ? `RENAME ${oldName} ${target} :${trimmedReason}` : `RENAME ${oldName} ${target}`)
}

function openPm(target: string) {
  const buf = getBuffer(target, 'pm')
  const _pmUserKey = cacheNickKey()
  if (_pmUserKey) {
    void upsertBufferMeta({
      key: makeBufferKey(_pmUserKey, target),
      name: target,
      kind: 'pm',
    } satisfies StoredBufferMeta)
  }
  forgetClosedDm(target)
  setActive(target)

  // Load history the first time this DM opens, unless CHATHISTORY TARGETS already
  // did on connect.
  if (chatHistorySupported.value && !buf.historyReady) {
    markPendingBridge(buf)
    requestHistory(target)
  }
}

/** True when `name` is your own nick, i.e. the "your space" DM. */
function isSelfBuffer(name: string) {
  const me = nick.value
  return !!me && name.toLowerCase() === me.toLowerCase()
}

/**
 * Open the DM with yourself. The server stores and replays it via CHATHISTORY
 * like any other DM, so it works for notes and moving things between devices.
 */
function openSelfSpace() {
  const me = nick.value
  if (me)
    openPm(me)
}

function sendPm(target: string, text: string) {
  const trimmed = text.trim()
  if (!trimmed)
    return

  openPm(target)
  deliverWire(target, 'pm', trimmed)
}

function closeBuffer(name: string) {
  const buf = findBuffer(name)
  if (!buf || buf.kind === 'server')
    return

  if (buf.kind === 'channel' && buf.joined) {
    send(`PART ${buf.name}`)

    // Clear the persisted auto-join channel so the next connect() doesn't re-JOIN
    // a channel the user explicitly left.
    if (inputChannel.value.toLowerCase() === buf.name.toLowerCase()) {
      inputChannel.value = ''

      // Use an empty string sentinel rather than removing the key entirely.
      // removeItem() would make connect() treat the next load as a first-time
      // visitor and auto-join the default channel, undoing the deliberate leave.
      if (import.meta.client)
        localStorage.setItem(STORAGE_CHANNEL, '')
    }
  }
  else if (buf.kind === 'pm') {
    rememberClosedDm(name, buf)
  }
  buffers.value = buffers.value.filter(b => b !== buf)

  // Remove this buffer's cache entries so it isn't resurrected on next load.
  const _closeUserKey = cacheNickKey()
  if (_closeUserKey) {
    const _bk = makeBufferKey(_closeUserKey, name)
    void deleteBufferMessages(_bk)
    void deleteBufferMeta(_bk)
  }
  if (activeName.value.toLowerCase() === name.toLowerCase()) {
    // Navigate to previous buffer if it still exists, else fall back to server.
    const prev = previousActiveName.value
    const prevStillOpen = prev.toLowerCase() !== name.toLowerCase() && buffers.value.some(b => b.name.toLowerCase() === prev.toLowerCase())
    setActive(prevStillOpen ? prev : (buffers.value[0]?.name ?? SERVER_BUFFER))
  }
}

// /op, /deop, /voice and /devoice differ only in the mode they apply.
const MEMBER_MODE_COMMANDS: Record<string, string> = {
  op: '+o',
  deop: '-o',
  voice: '+v',
  devoice: '-v',
}

/**
 * The active buffer's name, but only when it's a channel. Channel-only slash
 * commands (/topic, /op, /kick, ...) bail out when this is null.
 */
function activeChannelName(): string | null {
  const channel = activeName.value
  return channel && findBuffer(channel)?.kind === 'channel' ? channel : null
}

function handleCommand(line: string) {
  const [cmd, ...rest] = line.slice(1).split(' ')
  const arg = rest.join(' ').trim()

  switch ((cmd ?? '').toLowerCase()) {
    case 'join':
    case 'j': {
      if (!arg)
        break

      const parts = arg.split(' ')
      const channelArg = parts[0] ?? ''

      joinChannel(channelArg, parts[1])

      // A slash-joined subchannel isn't on the parent's list yet. Register it
      // there so it shows up in the tree for everyone. Only works if we hold OP
      // on the parent, since the metadata write is rejected otherwise.
      const fullName = channelArg.startsWith('#') || channelArg.startsWith('&') ? channelArg : `#${channelArg}`
      const pfx = fullName[0]!
      const rawSegs = fullName.slice(1).split('/').filter(Boolean)

      if (rawSegs.length <= 1)
        break

      const parentName = `${pfx}${rawSegs.slice(0, -1).join('/')}`
      const subSlug = rawSegs[rawSegs.length - 1]!
      const role = myChannelRole(parentName)

      if (!role || !['~', '&', '@'].includes(role.symbol))
        break

      const parentBuf = findBuffer(parentName)
      const existing = parentBuf?.metadata?.get('subchannels')
        ?? channelMetaCache.value.get(parentName.toLowerCase())?.get('subchannels')
        ?? ''
      const list = existing ? existing.split(',').map(s => s.trim()).filter(Boolean) : []

      if (!list.map(s => s.toLowerCase()).includes(subSlug.toLowerCase())) {
        list.push(subSlug)
        setChannelMetadata(parentName, 'subchannels', list.join(','))
      }

      break
    }

    case 'part':
    case 'leave':
      closeBuffer(arg || activeName.value)
      break

    case 'query':
    case 'msg': {
      const to = rest[0] ?? ''
      const body = rest.slice(1).join(' ').trim()

      if (!to)
        break

      openPm(to)

      // No body is fine, /query just opens the PM buffer.
      if (body)
        deliverWire(to, 'pm', markdownToIrc(body))
      break
    }

    case 'me': {
      const target = activeName.value

      if (arg && target !== SERVER_BUFFER)
        deliverWire(target, findBuffer(target)?.kind ?? 'channel', markdownToIrc(arg), { action: true })
      break
    }

    case 'nick':
      if (arg)
        send(`NICK ${arg.split(' ')[0]}`)
      break

    case 'topic': {
      const channel = activeChannelName()

      if (!channel)
        break

      // Bare /topic asks for the current topic, /topic <text> sets it.
      send(arg ? `TOPIC ${channel} :${arg}` : `TOPIC ${channel}`)
      break
    }

    case 'op':
    case 'deop':
    case 'voice':
    case 'devoice': {
      const channel = activeChannelName()

      if (!channel)
        break

      // No target means the command applies to yourself.
      sendMemberMode(channel, MEMBER_MODE_COMMANDS[(cmd ?? '').toLowerCase()]!, rest[0] ?? nick.value)
      break
    }

    case 'kick': {
      const channel = activeChannelName()
      const target = rest[0]

      if (!channel || !target)
        break

      const reason = rest.slice(1).join(' ')

      send(reason ? `KICK ${channel} ${target} :${reason}` : `KICK ${channel} ${target}`)
      break
    }

    case 'invite': {
      const channel = activeChannelName()
      const target = rest[0]

      if (!channel || !target)
        break

      send(`INVITE ${target} ${channel}`)
      break
    }

    case 'mode': {
      const firstArg = rest[0] ?? ''

      // A leading channel target (or nothing at all) is forwarded as typed.
      if (firstArg.startsWith('#') || firstArg.startsWith('&') || !firstArg) {
        if (arg)
          send(`MODE ${arg}`)

        break
      }

      // Otherwise inject the active channel so `/mode +m` works in-context.
      const channel = activeChannelName()

      if (channel)
        send(`MODE ${channel} ${arg}`)
      break
    }

    default:
      // Forward unknown commands directly to the server (e.g. /whois, /oper).
      if (cmd)
        send(`${cmd.toUpperCase()} ${arg}`.trim())
  }
}

function setReply(msg: ChatMessage) {
  replyTarget.value = msg
  focusComposerFn?.()
}

function registerComposerFocus(fn: () => void) {
  focusComposerFn = fn
}

function clearReply() {
  replyTarget.value = null
}

/**
 * Toggle an emoji reaction on `parent` in the active buffer (IRCv3 react). Sends
 * the TAGMSG and applies it optimistically. applyReaction is idempotent, so the
 * echo reconciles to the same state.
 */
function toggleReaction(parent: ChatMessage, reaction: string) {
  if (!parent.msgid || !reaction || !EMOJI_RE.test(reaction))
    return

  const target = activeName.value
  const buf = findBuffer(target)

  if (!buf || buf.kind === 'server')
    return

  const mine = (parent.reactions?.[reaction] ?? []).includes(nick.value)
  const tag = mine ? '+draft/unreact' : '+draft/react'

  send(`@+reply=${escapeTagValue(parent.msgid)};${tag}=${escapeTagValue(reaction)} TAGMSG ${target}`)
  applyReaction(buf, parent.msgid, reaction, nick.value, mine)
}

/**
 * Whether to offer deleting `message`: own messages, or anyone's for halfop and
 * above. The server is the final authority and may still FAIL REDACT.
 */
function canRedact(message: ChatMessage): boolean {
  if (!redactionSupported.value || !message.msgid || message.redacted)
    return false

  if (message.type !== 'chat')
    return false

  const buf = findBuffer(activeName.value)

  if (!buf || buf.kind === 'server')
    return false

  // Own messages are always offered (server confirms permission).
  if (message.from && message.from.toLowerCase() === nick.value.toLowerCase())
    return true

  // Channel operators (halfop+) may redact other members' messages.
  if (buf.kind === 'channel') {
    const role = myChannelRole(buf.name)

    if (role && ['~', '&', '@', '%'].includes(role.symbol))
      return true
  }

  return false
}

/**
 * Send an IRCv3 REDACT for `message` in the active buffer. The redaction is applied
 * locally only when the server relays the REDACT back (live or in history), so a
 * server-side rejection (FAIL REDACT) leaves the message untouched.
 */
function redactMessage(message: ChatMessage, reason?: string) {
  if (!message.msgid)
    return

  const target = activeName.value
  const buf = findBuffer(target)

  if (!buf || buf.kind === 'server')
    return

  const trimmed = reason?.trim()

  send(`REDACT ${target} ${message.msgid}${trimmed ? ` :${trimmed}` : ''}`)
}

/** Byte length of a string. The draft/multiline caps are byte budgets. */
function utf8Len(s: string): number {
  return new TextEncoder().encode(s).length
}

/**
 * Send a multi-line message as one or more draft/multiline batches within the
 * server's max-lines / max-bytes caps. +reply rides the first line. Empty lines go
 * out as a single space so the server doesn't drop an empty-trailing PRIVMSG.
 */
function sendMultiline(target: string, lines: string[], replyMsgid?: string): boolean {
  const maxLines = multilineMaxLines > 0 ? multilineMaxLines : Number.POSITIVE_INFINITY
  const maxBytes = multilineMaxBytes > 0 ? multilineMaxBytes : Number.POSITIVE_INFINITY
  let pending: string[] = []
  let pendingBytes = 0
  let firstBatch = true
  let sent = true

  const flush = () => {
    if (!pending.length)
      return

    const ref = `ml${multilineRef++}`

    sent = send(`BATCH +${ref} draft/multiline ${target}`) && sent

    pending.forEach((line, idx) => {
      const tagParts: string[] = []

      if (firstBatch && idx === 0 && replyMsgid)
        tagParts.push(`+reply=${escapeTagValue(replyMsgid)}`)

      tagParts.push(`batch=${ref}`)
      sent = send(`@${tagParts.join(';')} PRIVMSG ${target} :${line === '' ? ' ' : line}`) && sent
    })

    sent = send(`BATCH -${ref}`) && sent
    firstBatch = false
    pending = []
    pendingBytes = 0
  }

  for (const line of lines) {
    const lb = utf8Len(line)

    // Start a new batch when this line would exceed a cap. Never flush an empty
    // one: a single over-cap line still goes out on its own.
    if (pending.length && (pending.length >= maxLines || pendingBytes + lb > maxBytes))
      flush()

    pending.push(line)
    pendingBytes += lb
  }

  flush()

  return sent
}

/**
 * Put an outgoing message on the wire and show it locally. `wire` is already
 * markdown-converted. With echo-message, reconcileOwnEcho folds the server's echo
 * (a reassembled batch for multiline) into the line already on screen.
 */
function deliverWire(target: string, kind: BufferKind, wire: string, opts: { replyTo?: string, action?: boolean } = {}) {
  const { replyTo, action = false } = opts

  // escapeTagValue is required: msgid is stored unescaped (via unescapeTag) and
  // must be re-encoded before embedding in the wire tag string.
  const tagPrefix = replyTo != null ? `@+reply=${escapeTagValue(replyTo)} ` : ''
  const own = (text: string, msgReplyTo?: string): Omit<ChatMessage, 'id' | 'ts'> => ({
    type: 'chat',
    from: nick.value,
    channel: target,
    text,
    replyTo: msgReplyTo,
    ...(action && { action: true }),
  })

  if (action) {
    // CTCP ACTION is one line by definition. A newline would truncate it at the
    // server, so fold it onto one.
    const oneLine = wire.replace(/\n/g, ' ')
    const sent = send(`${tagPrefix}PRIVMSG ${target} :\x01ACTION ${oneLine}\x01`)

    addOwnMessage(target, kind, own(oneLine, replyTo), sent)
  }
  else {
    const lines = wire.split('\n')

    if (lines.length > 1 && multilineActive) {
      const sent = sendMultiline(target, lines, replyTo)
      addOwnMessage(target, kind, own(wire, replyTo), sent)
    }
    else if (lines.length > 1) {
      // No draft/multiline: one PRIVMSG per line, +reply on the first, empty lines
      // as a space. One visible line per PRIVMSG, since that's how echoes return.
      lines.forEach((line, idx) => {
        const pfx = idx === 0 ? tagPrefix : ''
        const sent = send(`${pfx}PRIVMSG ${target} :${line === '' ? ' ' : line}`)
        addOwnMessage(target, kind, own(line, idx === 0 ? replyTo : undefined), sent)
      })
    }
    else {
      const sent = send(`${tagPrefix}PRIVMSG ${target} :${wire}`)
      addOwnMessage(target, kind, own(wire, replyTo), sent)
    }
  }

  // Nothing left the socket, so no echo is coming. Flag the lines now instead of
  // leaving them dim until the timeout.
  if (!socketOpen())
    failInFlightSends()
}

function sendMessage() {
  // Strip characters that are illegal in IRC lines and cannot be escaped.
  const text = inputMessage.value.trim().replace(/\0/g, '')

  if (!text)
    return

  if (text.startsWith('/')) {
    handleCommand(text)
    inputMessage.value = ''
    return
  }

  const target = activeName.value
  const buf = findBuffer(target)

  if (!buf || buf.kind === 'server') {
    addServer({ type: 'error', text: 'Use /join #channel to join a channel, or /msg <nick> to open a private message.' })
    inputMessage.value = ''
    return
  }

  const replyMsgid = replyTarget.value?.msgid

  // markdownToIrc converts line by line, so deliverWire's line split still lines
  // up. The local copy keeps the wire string, which the log renders back.
  const wire = markdownToIrc(text)

  deliverWire(target, buf.kind, wire, { replyTo: replyMsgid })

  // Sending resolves the channel's "new messages" line.
  markBufferRead(target)

  clearReply()
  inputMessage.value = ''
}

/**
 * Send an IRCv3 typing notification to the active buffer.
 * - `active`: typing (throttled to once per 3 s per target).
 * - `paused`: stopped typing but the input isn't cleared.
 * - `done`: input cleared without sending (bypasses the throttle).
 */
function sendTyping(state: 'active' | 'paused' | 'done') {
  if (!messageTagsActive || connState.value !== 'connected')
    return

  const target = activeName.value

  if (!target || target === SERVER_BUFFER)
    return

  const buf = findBuffer(target)

  if (!buf || buf.kind === 'server')
    return

  // Per spec: no typing notification within 3 s of the previous for this target.
  // 'done' is a one-shot terminal event and bypasses the throttle.
  if (state !== 'done') {
    const last = lastTypingSent.get(target) ?? 0
    if (Date.now() - last < 3000)
      return
  }
  lastTypingSent.set(target, Date.now())
  send(`@+typing=${state} TAGMSG ${target}`)
}

function clearMessages() {
  const buf = findBuffer(activeName.value)
  if (buf)
    buf.messages = []
}

// --- Presentation helper -----------------------------------------------------
/** Deterministic per-nick colour for the "colored nicknames" setting. */
export function nickColor(name: string) {
  let h = 0
  for (let i = 0; i < name.length; i++)
    h = (h * 31 + name.charCodeAt(i)) >>> 0
  return `hsl(${h % 360} 60% 62%)`
}

export interface ChannelRole {
  /** Single prefix character, e.g. "@". */
  symbol: string

  /** Human-readable role name, e.g. "Operator". */
  label: string

  /** VUI text colour token used for the role indicator. */
  color: string
}

const ROLE_BY_PREFIX: Record<string, ChannelRole> = {
  '~': { symbol: '~', label: 'Owner', color: 'var(--color-text-red)' },
  '&': { symbol: '&', label: 'Admin', color: 'var(--color-text-red)' },
  '@': { symbol: '@', label: 'Operator', color: 'var(--color-text-blue)' },
  '%': { symbol: '%', label: 'Half-operator', color: 'var(--color-text-purple)' },
  '+': { symbol: '+', label: 'Voiced', color: 'var(--color-text-yellow)' },
}

/** Resolve the highest-privilege role a member's prefix string represents. */
export function channelRole(prefix: string): ChannelRole | null {
  return ROLE_BY_PREFIX[prefix[0] ?? ''] ?? null
}

/**
 * Start a ChanServ DROP. The pending-drop entry lets the NOTICE handler
 * auto-confirm when ChanServ replies with the verification code.
 */
function initiateDrop(channel: string) {
  _pendingDropChannels.add(channel.toLowerCase())
  send(`PRIVMSG ChanServ :DROP ${channel}`)
}

/**
 * Add a channel to the ChanServ probe suppression set without sending an INFO query.
 * Use this when sending REGISTER/DROP so the response notice is swallowed.
 */
function suppressChanServResponse(channel: string) {
  const key = channel.toLowerCase()
  _probingChanServChannels.add(key)
  const existing = _chanServProbeTimers.get(key)
  if (existing != null)
    clearTimeout(existing)
  const t = setTimeout(() => {
    _probingChanServChannels.delete(key)
    _chanServProbeTimers.delete(key)
  }, 6000)
  _chanServProbeTimers.set(key, t)
}

/** Query ChanServ for a channel's registration status. Suppresses the response from visible buffers. */
function queryChanServInfo(channel: string) {
  const key = channel.toLowerCase()
  _probingChanServChannels.add(key)
  const existing = _chanServProbeTimers.get(key)
  if (existing != null)
    clearTimeout(existing)
  const t = setTimeout(() => {
    _probingChanServChannels.delete(key)
    _chanServProbeTimers.delete(key)

    // Fallback: if no answer arrived, mark as unknown-but-not-spinning
    const b = findBuffer(channel)
    if (b && b.registered === undefined)
      b.registered = false
  }, 6000)
  _chanServProbeTimers.set(key, t)
  send(`PRIVMSG ChanServ :INFO ${channel}`)
}

/** Fetch the ban (+b), exception (+e), and invite (+I) lists for a channel. */
function fetchListModes(channel: string) {
  const buf = findBuffer(channel)
  if (!buf)
    return

  buf.banList = []
  buf.exceptList = []
  buf.inviteList = []
  buf.banListReady = false
  buf.exceptListReady = false
  buf.inviteListReady = false
  send(`MODE ${channel} b`)
  send(`MODE ${channel} e`)
  send(`MODE ${channel} I`)
}

/**
 * True when a slash-notation channel isn't authorized by its parent chain's
 * `subchannels` metadata.
 */
function isUnauthorizedSubchannel(channelName: string): boolean {
  if (!channelName.startsWith('#') && !channelName.startsWith('&'))
    return false

  const prefix = channelName[0]!
  const raw = channelName.slice(1)
  const segments = raw.split('/').filter(Boolean)
  if (segments.length <= 1)
    return false

  for (let i = 1; i < segments.length; i++) {
    const parentName = `${prefix}${segments.slice(0, i).join('/')}`
    const lc = parentName.toLowerCase()
    const meta = findBuffer(parentName)?.metadata ?? channelMetaCache.value.get(lc)

    // Parent metadata not received yet: assume authorized while pending.
    if (!meta && !channelMetaResolved.value.has(lc))
      continue

    const allowlist = meta?.get('subchannels')
    if (!allowlist)
      return true

    const allowed = allowlist.split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
    if (!allowed.includes(segments[i]!.toLowerCase()))
      return true
  }
  return false
}

/** Write a channel metadata key into the cache (reassigns maps for reactivity). */
function cacheChannelMeta(target: string, key: string, value: string | null) {
  const lc = target.toLowerCase()
  const next = new Map(channelMetaCache.value)
  const entry = new Map(next.get(lc) ?? [])
  if (value == null || value === '')
    entry.delete(key)
  else
    entry.set(key, value)
  next.set(lc, entry)
  channelMetaCache.value = next

  // Mark as resolved on first data receipt.
  if (!channelMetaResolved.value.has(lc))
    channelMetaResolved.value = new Set(channelMetaResolved.value).add(lc)

  // Persist appearance keys so they survive page reload.
  if (APPEARANCE_KEYS.has(key))
    persistChannelMetaToStorage()
}

/** Mirror a channel buffer's modes/params into the persistent cache. */
function cacheChannelModes(buf: ChatBuffer) {
  if (buf.kind !== 'channel')
    return

  const lc = buf.name.toLowerCase()
  const next = new Map(channelModesCache.value)
  next.set(lc, { modes: new Set(buf.modes), params: new Map(buf.modeParams ?? []) })
  channelModesCache.value = next
  persistChannelModesToStorage()
}

/** Seed a fresh channel buffer's modes/params from the persistent cache. */
function seedBufferModes(buf: ChatBuffer) {
  const cached = channelModesCache.value.get(buf.name.toLowerCase())
  if (!cached)
    return

  buf.modes = new Set(cached.modes)
  if (cached.params.size)
    buf.modeParams = new Map(cached.params)
}

/**
 * Fetch a channel's metadata without joining it, for slash-nesting verification
 * and display of unjoined parents. Deduped; skips channels we already have a
 * buffer for (their metadata arrives via the join burst).
 */
function requestChannelMetadata(channel: string) {
  const lc = channel.toLowerCase()
  if (_backgroundMetaTargets.has(lc) || findBuffer(channel))
    return

  // Only mark as probed once the request actually leaves; otherwise a pre-connect
  // call would dedupe forever without ever sending (send no-ops while closed).
  if (!ws || ws.readyState !== WebSocket.OPEN)
    return

  _backgroundMetaTargets.add(lc)
  send(`METADATA ${channel} LIST`)
}

function setChannelMetadata(channel: string, key: string, value: string) {
  send(`METADATA ${channel} SET ${key} :${value}`)
}

/** Remove a metadata key from a channel (METADATA SET with no value = delete). */
function deleteChannelMetadata(channel: string, key: string) {
  send(`METADATA ${channel} SET ${key}`)
}

/**
 * Send a membership mode change (+o/-o/+v/-v) for a channel member.
 * Uses ChanServ AMODE when the channel is registered so the change persists
 * across reconnects; falls back to a plain MODE for unregistered channels.
 */
function sendMemberMode(channel: string, modeStr: string, targetNick: string) {
  const buf = findBuffer(channel)
  if (buf?.registered)
    send(`PRIVMSG ChanServ :AMODE ${channel} ${modeStr} ${targetNick}`)
  else
    send(`MODE ${channel} ${modeStr} ${targetNick}`)
}

/**
 * Run a confirmed moderation action against a channel member. Kick removes them
 * from the channel; kickban also sets a +b mask so they can't rejoin. The server
 * echoes the KICK/MODE back, which the message handler applies to the user list.
 */
function executeModeration(req: { action: 'kick' | 'kickban', nick: string, channel: string }) {
  const { action, nick: target, channel } = req
  if (!channel || !target)
    return

  // Set the ban before kicking so the mask is in place before they leave.
  if (action === 'kickban')
    send(`MODE ${channel} +b ${target}!*@*`)
  send(`KICK ${channel} ${target}`)
}

/** Return the calling user's role in a channel, or null if not a member / no privilege. */
function myChannelRole(channelName: string): ChannelRole | null {
  const buf = findBuffer(channelName)
  if (!buf)
    return null

  const self = buf.users.find(u => u.name.toLowerCase() === nick.value.toLowerCase())
  if (!self)
    return null

  return channelRole(self.prefix)
}

/**
 * Re-seed a buffer from its IDB cache and re-request CHATHISTORY LATEST so the
 * user can scroll back to the present after loading older pages trimmed the tail.
 */
async function seekToPresent(target: string) {
  const buf = findBuffer(target)
  if (!buf)
    return

  const userKey = cacheNickKey()
  if (userKey) {
    const rawMsgs = await loadRecentMessages(userKey, target, CACHE_SEED_COUNT)
    buf.messages = rawMsgs.map(storedToMessage)
    buf.cacheExhausted = rawMsgs.length < CACHE_SEED_COUNT
  }
  else {
    buf.messages = []
  }
  buf.tailTrimmed = false
  buf.historyReady = false
  buf.historyExhausted = false
  buf.historyAnchorMsgid = undefined
  buf.historyAnchorTs = undefined
  buf.autoFetchRetries = undefined
  buf.loadingOlderHistory = undefined

  // Catch up with a delta after the newest cached line. A bare LATEST * re-replays
  // the server's whole event-playback window every time.
  requestHistory(target, buf.messages[buf.messages.length - 1]?.ts.getTime())
}

/**
 * Append the next page of newer cached messages as the user scrolls down a
 * tail-trimmed buffer, trimming the front to stay within MAX_LIVE_MESSAGES. Once
 * IDB runs out, clears tailTrimmed and catches up from the server.
 */
async function fetchNewerFromCache(target: string) {
  const buf = findBuffer(target)
  if (!buf || !buf.tailTrimmed || buf.loadingNewerHistory)
    return

  const userKey = cacheNickKey()
  if (!userKey)
    return

  buf.loadingNewerHistory = true
  try {
    const newestTs = buf.messages[buf.messages.length - 1]?.ts.getTime() ?? 0
    const newer = await loadNewerMessages(userKey, target, newestTs, CACHE_PAGE_SIZE)
    if (newer.length > 0) {
      const newMsgs: ChatMessage[] = newer
        .map(storedToMessage)
        .filter(m => !messageExists(buf.messages, m))
      if (newMsgs.length) {
        buf.messages.push(...newMsgs)

        // Slide window: trim from the front so DOM count stays bounded. Gated
        // on rendered height and capped to one page, same as the tail trims.
        if (buf.messages.length > MAX_LIVE_MESSAGES && windowTrimAllowed()) {
          buf.messages.splice(0, Math.min(buf.messages.length - MAX_LIVE_MESSAGES, CACHE_PAGE_SIZE))

          // The front is no longer the oldest line, so clear both exhausted flags.
          // A stuck historyExhausted would block scrolling back up.
          buf.cacheExhausted = false
          buf.historyExhausted = false
        }
      }
    }
    if (newer.length < CACHE_PAGE_SIZE) {
      // Reached the live edge of the cache, so catch up with a delta from the
      // server. A bare LATEST * re-runs the whole event-playback window (a day of
      // JOIN/PART spam) on every scroll-down.
      buf.tailTrimmed = false
      requestHistory(target, buf.messages[buf.messages.length - 1]?.ts.getTime())
    }
  }
  finally {
    buf.loadingNewerHistory = false
  }
}

/** Clear unread/mention counters and save the read position for a buffer. */
function markBufferRead(name: string) {
  const buf = findBuffer(name)
  if (!buf)
    return

  const last = buf.messages[buf.messages.length - 1]
  if (last)
    saveReadPosition(buf.name, last.ts.getTime())
  buf.unread = 0
  buf.mentions = 0

  // Resolve the "new messages" line explicitly. saveReadPosition only drops it
  // while a count is set, and the buffer may already be at zero (e.g. clicking
  // the line while viewing).
  buf.readLineTs = undefined
}

export function setCacheCap(cap: number) {
  _cacheCap = cap
}

export function useIrcChat() {
  if (!initialised && import.meta.client) {
    initialised = true
    loadPersisted()
    resetBuffers()
    void hydrateBufferCache()
  }

  /** Seed the nickname field with a default (e.g. the signed-in username) when empty. */
  function ensureNick(defaultNick: string) {
    if (!inputNick.value && defaultNick)
      inputNick.value = defaultNick
  }

  const isConnected = computed(() => connState.value === 'connected')

  // A dropped connection we can ride out in place: connected earlier this session
  // and still holding buffers, so show them with a reconnect banner instead of
  // the full-screen overlay. False on a cold first connect and after disconnect().
  const reconnecting = computed(() =>
    everConnected.value
    && connState.value !== 'connected'
    && connState.value !== 'disconnected'
    && buffers.value.some(b => b.kind === 'channel' || b.kind === 'pm'),
  )
  const activeBuffer = computed(() => findBuffer(activeName.value) ?? buffers.value[0])
  const messages = computed(() => activeBuffer.value?.messages ?? [])
  const users = computed(() => activeBuffer.value?.users ?? [])
  const canChat = computed(() => isConnected.value && activeBuffer.value != null)

  // The buffer on screen is read by definition, so pin its marker to the newest
  // message and clear its counts. This also heals the reconnect race where
  // activeName flips as channels auto-join. readLineTs is left alone so the
  // "new messages" line stays while reading.
  if (import.meta.client && !_readWatcherRegistered) {
    _readWatcherRegistered = true
    watch(
      () => {
        const b = activeBuffer.value
        const last = b?.messages[b.messages.length - 1]
        return `${activeName.value}|${b?.messages.length ?? 0}|${last?.ts.getTime() ?? 0}`
      },
      () => {
        if (!isChatVisible.value || document.hidden)
          return

        const b = activeBuffer.value
        if (!b || b.kind === 'server')
          return

        // Zero the counts before advancing the marker so the read line stays
        // (see setActive).
        b.unread = 0
        b.mentions = 0
        const last = b.messages[b.messages.length - 1]
        if (last)
          saveReadPosition(b.name, last.ts.getTime())
      },
      { flush: 'post' },
    )

    // Returning to the tab clears the badge but not the read line. Zero the
    // counts before advancing the marker so the line survives (see setActive).
    document.addEventListener('visibilitychange', () => {
      if (document.hidden || !isChatVisible.value)
        return

      const b = activeBuffer.value
      if (!b || b.kind === 'server')
        return

      b.unread = 0
      b.mentions = 0
      const last = b.messages[b.messages.length - 1]
      if (last)
        saveReadPosition(b.name, last.ts.getTime())
    })
  }

  const hasUnread = computed(() => buffers.value.some(b => b.unread > 0))
  const mentionCount = computed(() => buffers.value.reduce((sum, b) => sum + b.mentions, 0))
  const hasMention = computed(() => mentionCount.value > 0)

  function setChatVisible(visible: boolean) {
    isChatVisible.value = visible
    const buf = activeBuffer.value
    if (!buf || buf.kind === 'server')
      return

    if (!visible) {
      // Closing the surface counts as leaving the channel: catch it up fully so a
      // later open shows a fresh "new messages" line only for what arrived while
      // it was closed, not what you already read.
      markBufferRead(buf.name)
    }
    else {
      // Opening the chat clears the badge but keeps the read line. Zero the counts
      // before advancing the marker so the line survives (see setActive).
      buf.unread = 0
      buf.mentions = 0
      const last = buf.messages[buf.messages.length - 1]
      if (last)
        saveReadPosition(buf.name, last.ts.getTime())
    }
  }

  function toggleSidebar() {
    sidebarHidden.value = !sidebarHidden.value
    if (import.meta.client)
      localStorage.setItem(SIDEBAR_HIDDEN_KEY, String(sidebarHidden.value))
  }

  function toggleFullWidth() {
    chatFullWidth.value = !chatFullWidth.value
    if (import.meta.client)
      localStorage.setItem(FULL_WIDTH_KEY, String(chatFullWidth.value))
  }

  /** Pre-seed the channel to connect to and persist it so connect() won't override it. */
  function seedChannel(channel: string) {
    inputChannel.value = channel
    persistChannel(channel)
  }

  return {
    // config
    WS_URL,
    // raw send
    send,
    // reply
    replyTarget,
    setReply,
    clearReply,
    registerComposerFocus,
    // reactions
    toggleReaction,
    // redaction (draft/message-redaction)
    redactionSupported,
    canRedact,
    redactMessage,
    // typing
    sendTyping,
    // connection
    connState,
    isConnected,
    reconnecting,
    canChat,
    latencyMs,
    nick,
    account,
    // draft/webpush: server VAPID key for browser push subscriptions
    vapidKey,
    // buffers
    chatHistorySupported,
    buffers,
    activeName,
    activeBuffer,
    messages,
    users,
    hasUnread,
    hasMention,
    mentionCount,
    // form/draft
    inputNick,
    inputChannel,
    inputMessage,
    // sidebar
    sidebarHidden,
    toggleSidebar,
    // layout
    chatFullWidth,
    toggleFullWidth,
    // actions
    connect,
    connectAsAnon,
    disconnect,
    sendMessage,
    canResend,
    resendMessage,
    discardMessage,
    clearMessages,
    setActive,
    joinChannel,
    renameChannel,
    openPm,
    openSelfSpace,
    isSelfBuffer,
    sendPm,
    closeBuffer,
    ensureNick,
    // channel browser
    channelList,
    channelListLoading,
    channelBrowserOpen,
    channelKeyPrompt,
    channelKeyError,
    listChannels,
    // account claim state
    accountEmail,
    accountAlwaysOn,
    accountDmHistory,
    accountDmHistoryEffective,
    accountInfoFetched,
    queryNickServInfo,
    enableAlwaysOn,
    disableAlwaysOn,
    setDmHistory,
    claimEmail,
    verifyClaimCode,
    // identity seam
    registerIdentityProvider,
    setMentionKeywords,
    clearInputNick,
    clearAuthedIdentity,
    hadAccount,
    defaultChannel,
    isChatVisible,
    setChatVisible,
    serverLogPinned,
    activateServerLog,
    closeServerLog,
    chatSheetOpen,
    seedChannel,
    fetchOlderHistory,
    seekToPresent,
    fetchNewerFromCache,
    setLiveLogEl,
    releaseLiveLogEl,
    // metadata
    setChannelMetadata,
    deleteChannelMetadata,
    channelMetaCache,
    channelMetaResolved,
    requestChannelMetadata,
    userMetaStore,
    isUnauthorizedSubchannel,
    sendMemberMode,
    myChannelRole,
    fetchListModes,
    queryChanServInfo,
    suppressChanServResponse,
    initiateDrop,
    markBufferRead,
    channelSettingsOpen,
    channelJoinBlocked,
    moderationPrompt,
    executeModeration,
    requestWhois,
    // cache
    setCacheCap,
    cacheNickKey,
    // draft/relaymsg
    relaySeparator,
  }
}
