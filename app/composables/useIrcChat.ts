// ─────────────────────────────────────────────────────────────────────────────
// Singleton IRC-over-WebSocket client.
//
// All connection state lives at module scope so the socket survives route
// changes and stays in sync between the navbar chat sheet and the full `/chat`
// page. The WebSocket is only ever created in the browser.
//
// ## Hot-swap boundary
// This composable is the entire integration surface for chat. When Orbit ships
// as an embeddable webapp it replaces this module wholesale, so the rest of the
// site must only ever touch the public API returned by `useIrcChat()` - never
// internal IRC details. Keep that API small and presentation-agnostic.
//
// ## Identity (OIDC)
// Authentication follows the Orbit identity model: the client sends a provider
// (Supabase) JWT as the SASL PLAIN password, and an Ergo `auth-script` bridge
// verifies it against the provider's JWKS. The website already holds a Supabase
// session, so instead of running a separate OIDC browser flow we reuse that
// session token via the `registerIdentityProvider` seam. When Orbit becomes a
// cross-origin iframe, only that seam changes (token arrives via postMessage);
// everything downstream is identical.
//
// Until the bridge is configured server-side, SASL is attempted and gracefully
// falls back to plain registration so the client keeps working today.
// ─────────────────────────────────────────────────────────────────────────────

import type { StoredBufferMeta, StoredMessage } from '@/lib/chat/bufferCache'
import type { SoundDesign } from '@/types/sound'
import { clearChatCache, deleteBufferMessages, deleteBufferMeta, loadAllBufferMeta, loadNewerMessages, loadOlderMessages, loadRecentMessages, makeBufferKey, pruneBuffer, upsertBufferMeta, upsertMessages } from '@/lib/chat/bufferCache'
import { NONE_SOUND_ID, playNotificationSound } from '@/lib/notificationSound'

const WS_URL = 'wss://irc.hivecom.net:8097'
const DEFAULT_CHANNEL_DEV = '#playground'
const DEFAULT_CHANNEL_ANON = '#public'
const DEFAULT_CHANNEL_AUTH = '#lounge'

function defaultChannel(anon: boolean): string {
  if (import.meta.dev)
    return DEFAULT_CHANNEL_DEV
  return anon ? DEFAULT_CHANNEL_ANON : DEFAULT_CHANNEL_AUTH
}
const STORAGE_NICK = 'hivecom.chat.nick'
const STORAGE_CHANNEL = 'hivecom.chat.channel'
// '1' when the persisted nick/channel belong to a signed-in (authenticated)
// session. Used to drop that identity when the app is loaded signed-out, so the
// connect form doesn't pre-populate a registered nick that would fail to auth.
const STORAGE_IDENTITY_AUTHED = 'hivecom.chat.identity-authed'
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
// Cached channel appearance metadata (display-name, avatar, color, homepage) for
// instant display before the IRC connection delivers METADATA responses.
const STORAGE_CHANNEL_META = 'hivecom.chat.channel-meta'
const APPEARANCE_KEYS: ReadonlySet<string> = new Set(['display-name', 'avatar', 'color', 'homepage'])
// How far back to look for missed DMs when there is no stored cursor.
const DEFAULT_HISTORY_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000
// Clock-skew fuzz applied to history bound timestamps.
const HISTORY_FUZZ_MS = 5000
// Max messages / targets per CHATHISTORY request.
const HISTORY_LIMIT = 50

// Synthetic buffer that holds connection-level/system output before any channel
// is joined. Never sent to the server.
const SERVER_BUFFER = '*'

// IRCv3 capabilities we request when the server advertises them.
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
  // Required for Ergo to replay stored TAGMSGs (reactions) as real TAGMSG lines
  // with their client tags intact. Without it, Ergo degrades reaction history to
  // a data-less HistServ "<nick> sent a TAGMSG" PRIVMSG placeholder (see #1676),
  // which we can't turn back into a reaction. It also makes JOIN/PART/QUIT/NICK/
  // MODE replayable as real events inside history batches - those handlers below
  // guard against `backlog` so replayed events never mutate live state.
  'draft/event-playback',
  'draft/metadata-2',
  // draft/channel-rename: rename a channel in place, preserving membership,
  // modes, topic and lists, instead of part+join to a fresh channel.
  'draft/channel-rename',
  // draft/message-redaction: delete messages (own messages, or others' as op).
  'draft/message-redaction',
  // draft/webpush: lets the server deliver Web Push notifications for messages of
  // interest while we're disconnected. Enabling the cap makes Ergo advertise its
  // VAPID public key in the `VAPID` ISUPPORT token (parsed below into `vapidKey`).
  'draft/webpush',
  // draft/relaymsg: lets relay bots send messages with spoofed nicks; the tag
  // tells us which bot actually sent the message so we can show a relay indicator.
  'draft/relaymsg',
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
  /** When set, this message was relayed by a bridge bot; value is the real bot nick. */
  relayedBy?: string
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
}

export interface ChannelListEntry {
  name: string
  userCount: number
  topic: string
  modes?: Set<string>
}

/** A channel member together with their current IRC mode prefixes. */
export interface ChatUser {
  name: string
  /** Mode prefix chars, highest privilege first (e.g. "@", "+", "~@"). Empty when none. */
  prefix: string
  /** True when the server reports this user as a bot (WHO flag B / user mode +B). */
  bot?: boolean
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

// IRC channel-membership prefixes ordered from highest to lowest privilege.
const PREFIX_ORDER = '~&@%+'
// Channel mode chars that map onto a membership prefix.
const MODE_TO_PREFIX: Record<string, string> = { q: '~', a: '&', o: '@', h: '%', v: '+' }
// Non-prefix channel modes that consume a parameter, so we can keep MODE parsing aligned.
const PARAM_MODES_ALWAYS = new Set(['b', 'e', 'I', 'k'])
const PARAM_MODES_ON_SET = new Set(['l', 'f', 'j'])

// --- Shared reactive state ---------------------------------------------------
const connState = ref<ConnState>('disconnected')
const nick = ref('')
const account = ref('')
const buffers = ref<ChatBuffer[]>([])
// Internal sink for service-bot (NickServ/ChanServ/HistServ) chatter. Reactive so
// it's inspectable while debugging, but deliberately kept out of the buffer/tab
// system so it is never rendered to the user.
const serviceLog = ref<ChatMessage[]>([])
const activeName = ref<string>(SERVER_BUFFER)
const previousActiveName = ref<string>(SERVER_BUFFER)
const msgCounter = ref(0)
const SIDEBAR_HIDDEN_KEY = 'hivecom.chat.sidebar-hidden'
const sidebarHidden = ref(
  import.meta.client && localStorage.getItem(SIDEBAR_HIDDEN_KEY) === 'true',
)
// null = not yet checked; '' = confirmed absent (unclaimed); string = email present (claimed)
const accountEmail = ref<string | null>(null)
// null = not yet determined; true/false parsed from NickServ INFO Flags line
const accountAlwaysOn = ref<boolean | null>(null)

// Per-nick metadata store populated from draft/metadata-2 METADATA notifications.
// Keyed by lowercased nick. Used to surface avatar, display-name, and orbit.status
// in the user list and message log without requiring an open PM buffer per user.
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
// Channel metadata cache keyed by lowercase channel name. Unlike buffer
// metadata, this also holds metadata for channels we are NOT joined to (e.g.
// parent channels in the slash-nesting tree). draft/metadata-2 permits GET/LIST
// on any channel target, so a parent can be verified/displayed without joining.
const channelMetaCache = ref<Map<string, Map<string, string>>>(new Map())
// Channels we've issued a background METADATA LIST for: dedupes probes and lets
// us swallow the resulting FAILs (a missing or permission-denied parent is normal).
const _backgroundMetaTargets = new Set<string>()
// Channels for which a background METADATA LIST response has been received
// (either data or FAIL). Lets consumers distinguish "pending" from "no data".
const channelMetaResolved = ref<Set<string>>(new Set())
const channelListLoading = ref(false)
const channelBrowserOpen = ref(false)
// When non-null, a password-protected channel denied our JOIN and we need a key.
const channelKeyPrompt = ref<string | null>(null)
// True when the most recent key attempt was rejected (475).
const channelKeyError = ref(false)
const channelSettingsOpen = ref<string | null>(null)
// When non-null, a join was blocked by the server (e.g. registration required). Holds channel name + reason.
const channelJoinBlocked = ref<{ channel: string, reason: string } | null>(null)

// Form / draft state, shared so both surfaces edit the same values.
const inputNick = ref('')
const inputChannel = ref('')
const inputMessage = ref('')
const replyTarget = ref<ChatMessage | null>(null)
let focusComposerFn: (() => void) | null = null

// Extra words (besides the current nick) that count as a mention. Sourced from
// user settings and pushed in via `setMentionKeywords` so this module-level
// store stays decoupled from the settings composable.
const mentionKeywords = ref<string[]>([])

/** Replace the list of extra keywords that highlight a message as a mention. */
export function setMentionKeywords(words: string[]) {
  mentionKeywords.value = words.map(w => w.trim()).filter(w => w.length > 0)
}

// Whether to fire browser Notifications on mentions. Sourced from user settings.
const browserNotificationsEnabled = ref(false)

/** Sync the browser-notification preference from user settings. */
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

/** Sync the notification-sound preferences from user settings. */
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

function saveReadPosition(name: string, ts: number) {
  const key = name.toLowerCase()
  // Monotonic - the read marker only ever advances. Replayed history can land in
  // the buffer after a newer system line (e.g. "You joined"), so guard against
  // regressing the cursor backwards.
  if ((readPositions[key] ?? 0) >= ts)
    return
  readPositions[key] = ts
  if (import.meta.client)
    localStorage.setItem(STORAGE_READ_POSITIONS, JSON.stringify(readPositions))
  // Sync to server so other clients (and fresh loads) get the correct marker.
  if (readMarkerActive)
    send(`MARKREAD ${name} timestamp=${new Date(ts).toISOString()}`)
}

let ws: WebSocket | null = null
let initialised = false
let _readWatcherRegistered = false
// --- Local buffer cache (IndexedDB) ---
// Messages seeded into the live buffer on startup from the per-message IDB store.
const CACHE_SEED_COUNT = 150
// Page size for cache-first scroll-back loads.
const CACHE_PAGE_SIZE = 25
// Maximum messages kept in the live reactive buffer. Older messages are trimmed
// from the tail (newest end) when older pages are prepended via scroll-back, so
// the DOM node count stays bounded while IDB holds the full history.
const MAX_LIVE_MESSAGES = 200
// Per-buffer IDB message cap. Updated reactively from user settings via setCacheCap().
let _cacheCap = 10000

let _cacheHydrating = false
// Pending per-message IDB writes, keyed by `${bufferKey}|${msgid}` so that
// mutations (reactions, redactions) overwrite the previous version in the queue.
const _pendingMsgWrites = new Map<string, StoredMessage>()
let _msgFlushTimer: ReturnType<typeof setTimeout> | null = null
let _intentionalDisconnect = false
let _skipAutoJoin = false
// Set when a connection attempt fails fatally (e.g. nickname in use) and must
// NOT auto-reconnect. Unlike _intentionalDisconnect, this preserves the 'error'
// state so the UI keeps showing why the connection failed. Cleared on each
// fresh openSocket().
let _fatalError = false
let _reconnectAttempts = 0
const MAX_RECONNECT_ATTEMPTS = 3
let _reconnectTimer: ReturnType<typeof setTimeout> | null = null
// Whether any chat UI surface (sheet or full page) is currently visible to the
// user. The read watcher only clears unread/mentions when this is true.
const isChatVisible = ref(false)
// Programmatic open signal for the chat sheet. Components that want to open the
// chat sheet (e.g. channel mention links) set this to true.
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
 * Register the host's identity provider. Called once from the chat shell with a
 * function that resolves the current Supabase session into `{ username, token }`
 * (or null when signed out). This is the only place that knows where the JWT
 * comes from, which is what keeps the Orbit swap cheap.
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
// Per-target timestamp (ms) of the last typing notification we sent, for throttling.
const lastTypingSent = new Map<string, number>()
// Expiry timers keyed by `${bufName.toLowerCase()}|${nick.toLowerCase()}`.
const typingTimers = new Map<string, ReturnType<typeof setTimeout>>()
interface BacklogBatchInfo {
  /** IRC target this batch belongs to (channel or nick). */
  target: string
  /** Number of raw IRC lines counted so far in this batch. */
  count: number
  /** True when this is a CHATHISTORY BEFORE response - messages should be prepended. */
  isPrepend: boolean
  /** Staged messages for BEFORE batches; spliced into the buffer in one shot at BATCH end. */
  staging?: ChatMessage[]
  /** Oldest msgid delivered in this batch (any type, including applied reactions). */
  oldestMsgid?: string
  /** Oldest timestamp (ms) delivered in this batch. */
  oldestTs?: number
  /**
   * True when this is a CHATHISTORY LATEST with a `since` timestamp selector.
   * A sparse result (count < HISTORY_LIMIT) does NOT mean all history is exhausted
   * in this case - there may be older messages before the bound.
   */
  hasSinceBound?: boolean
}
// Active CHATHISTORY batch ids mapped to metadata, so replayed lines are flagged as backlog.
const backlogBatches = new Map<string, BacklogBatchInfo>()
// Reactions (react/unreact) that arrived before their parent message existed in
// the buffer. Keyed by buffer name (lowercased) -> parent msgid -> queued ops.
// The common case is reacting to (or receiving reactions on) our own message
// before its echo delivers the server-assigned msgid; without this, the parent
// lookup in applyReaction fails and the reaction is silently dropped until a
// reload re-fetches the message and its reactions together via CHATHISTORY.
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
// Channels the user actively asked to join this session via joinChannel() (the
// channel browser, /join box, channel links, etc.), lowercased. Only these get a
// "You joined" marker - the entry is consumed when the matching self-JOIN lands.
// Connect-time landing joins and server-pushed auto-joins (always-on accounts the
// server keeps joined) never populate this set, so they stay silent.
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

function resetBuffers() {
  for (const timer of typingTimers.values())
    clearTimeout(timer)
  typingTimers.clear()
  lastTypingSent.clear()
  // Preserve channel/pm buffers across reconnects so the user never sees a blank
  // screen. Only connection-volatile state is cleared: presence, join status,
  // history cursor, and in-flight loading flags. Messages stay so cached content
  // is visible immediately while the socket reconnects and CHATHISTORY replays.
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
  // Pre-populate from stored appearance cache so channels display correctly while
  // the IRC connection re-establishes and delivers METADATA responses.
  channelMetaCache.value = loadChannelMetaFromStorage()
  _backgroundMetaTargets.clear()
  channelMetaResolved.value = new Set(channelMetaCache.value.keys())
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
    // For BEFORE batches, push to the staging array instead of directly into
    // buf.messages. All staged messages are spliced in as one bulk operation at
    // BATCH end, producing a single DOM update instead of 50 individual ones.
    const bi = opts.batchTag != null ? backlogBatches.get(opts.batchTag) : undefined
    if (bi?.staging != null) {
      // Dedup within the staging array.
      if (newMsg.msgid == null || !bi.staging.some(m => m.msgid === newMsg.msgid))
        bi.staging.push(newMsg)
      // Don't add to buf.messages yet - fall through so badge/read logic still runs.
    }
    else {
      // Fallback for prepend calls outside a staged batch.
      if (newMsg.msgid != null && buf.messages.some(m => m.msgid === newMsg.msgid))
        return
      buf.messages.unshift(newMsg)
    }
  }
  else {
    // Dedup live/replayed messages against ones already present - notably lines
    // hydrated from the local cache that overlap a CHATHISTORY LATEST replay.
    // msgid is the stable IRCv3 identifier; optimistic local sends carry no
    // msgid so they're never wrongly suppressed here.
    if (newMsg.msgid != null && buf.messages.some(m => m.msgid === newMsg.msgid))
      return
    buf.messages.push(newMsg)
    scheduleMsgWrite(name, newMsg)
  }

  // A message just landed in buf.messages - apply any reactions that arrived
  // before it (e.g. reactions on our own message that preceded its echo). The
  // staged-prepend path above doesn't splice yet, so skip it there; the BATCH
  // end handler drains staged msgids after the bulk splice.
  if (!opts.prepend && newMsg.msgid != null)
    drainPendingReactions(buf, newMsg.msgid)

  // Track the newest chat message so DM history fetches know where we left off.
  // Backlog messages count too - without this, sessions with no live messages never
  // advance the cursor and replay the same history on every fresh load.
  if (msg.type === 'chat')
    noteSeen(ts.getTime())

  // Only chat messages from other people affect unread/mention/notification state.
  // Service bots (HistServ, NickServ, ChanServ) are metadata - never badge.
  if (msg.type !== 'chat' || msg.from == null || msg.from === nick.value || SERVICE_NICKS.has(msg.from.toLowerCase()))
    return

  const isPing = kind === 'pm'
    ? !SERVICE_NICKS.has(msg.from.toLowerCase())
    : !SERVICE_NICKS.has(msg.from.toLowerCase()) && mentionsSelf(msg.text)

  const isActive = buf.name.toLowerCase() === activeName.value.toLowerCase()
  // Capture the marker BEFORE pinning so notification/already-read logic compares
  // against the previously-read position, not this very message.
  const readTs = readPositions[name.toLowerCase()]
  // The read marker is the single source of truth. A message is already read when
  // it's no newer than the marker - this holds for both live and replayed lines, so
  // it does NOT matter whether the server flagged the history as a backlog batch (an
  // unreliable signal). This is the core guard against re-counting seen messages.
  const alreadyRead = readTs != null && ts.getTime() <= readTs
  // Pin the active buffer's marker forward as each message arrives (monotonic), so
  // the channel you're viewing is robustly recorded as read without depending on the
  // watcher's flush timing.
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

  // Notification sound: same "genuinely new, not already read, not actively
  // viewing this channel" gating as browser notifications. A mention chime takes
  // priority over the general blip so a ping never fires both.
  if (!opts.backlog && !alreadyRead && (!isActive || document.hidden)) {
    if (isPing && soundMentionChoice.value !== NONE_SOUND_ID)
      playNotificationSound(soundMentionChoice.value, soundMentionUrl.value, soundVolume.value, soundMentionDesign.value)
    else if (soundMessageChoice.value !== NONE_SOUND_ID)
      playNotificationSound(soundMessageChoice.value, soundMessageUrl.value, soundVolume.value, soundMessageDesign.value)
  }

  // Don't badge what you're looking at or have already read.
  // isActive only suppresses the badge when the chat UI is actually visible AND the tab is in the foreground.
  if ((isActive && isChatVisible.value && !document.hidden) || alreadyRead)
    return
  // First-ever visit to a channel (no marker): don't badge its replayed history;
  // only genuine live activity. DMs are exempt - a replayed DM is a real new message.
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
 * Apply an IRCv3 react/unreact to the parent message identified by `parentMsgid`
 * within `buf`. Idempotent: adding a reactor that's already present (or removing
 * an absent one) is a no-op, so optimistic updates and echoed TAGMSGs converge.
 * Reassigns `reactions` to a fresh object so Vue tracks the change.
 */
function applyReaction(buf: ChatBuffer, parentMsgid: string, reaction: string, who: string, remove: boolean, extra?: ChatMessage[]) {
  if (!parentMsgid || !reaction)
    return
  // In a BEFORE (prepend) pagination batch the parent message is still staged and
  // not yet spliced into buf.messages, so fall back to searching the staging array.
  const parent = buf.messages.find(m => m.msgid === parentMsgid)
    ?? extra?.find(m => m.msgid === parentMsgid)
  if (!parent) {
    // The parent message isn't in the buffer (nor the current batch's staging)
    // yet. Two cases, both handled by stashing and replaying when it appears:
    //  - Live: our own just-sent message awaiting its echo with the server msgid.
    //  - Backlog: CHATHISTORY replays a reaction at its own (newer) timestamp,
    //    but the parent it targets was sent earlier and lands in an OLDER batch
    //    that is fetched in a later page. Without queueing, only reactions whose
    //    parent shares the same batch survive pagination.
    queuePendingReaction(buf.name, parentMsgid, reaction, who, remove)
    return
  }
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
 * Apply an IRCv3 draft/message-redaction to the message identified by `msgid`
 * within `buf`. Per spec, a REDACT referencing an unknown msgid MUST be ignored,
 * so a missing target is a silent no-op. We keep the message in place (preserving
 * authorship and ordering) and mark it redacted; the UI renders a placeholder and
 * drops any embeds/reactions. Original content is discarded - redaction is
 * cosmetic and we offer no "reveal" affordance.
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

// List modes that have a param but represent a list entry (ban, exception, invite-exception).
// These are tracked per-entry elsewhere and should not be stored as a boolean channel flag.
const LIST_MODES = new Set(['b', 'e', 'I'])

/** Apply a MODE change's prefix mutations to the matching channel members. */
function applyModeChanges(buf: ChatBuffer, args: string[]) {
  const modeStr = args[0]
  if (modeStr == null || modeStr.length === 0)
    return
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
    else if (LIST_MODES.has(ch)) {
      paramIdx++
    }
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
  if (changed)
    buf.users = [...buf.users].sort(sortUsers)
  if (modesChanged)
    buf.modes = new Set(buf.modes)
}

function removeUserEverywhere(name: string) {
  const clean = stripPrefix(name)
  for (const buf of buffers.value)
    buf.users = buf.users.filter(u => u.name !== clean)
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
  const cachedEmail = localStorage.getItem(STORAGE_IDENTITY_EMAIL)
  accountEmail.value = cachedEmail
  const cachedAlwaysOn = localStorage.getItem(STORAGE_IDENTITY_ALWAYS_ON)
  accountAlwaysOn.value = cachedAlwaysOn === null ? null : cachedAlwaysOn === 'true'
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

/**
 * Drop a persisted nick/channel that belonged to a signed-in session. Called
 * when the app loads (or transitions to) a signed-out state so the connect form
 * doesn't pre-fill a registered nick/channel that would fail to authenticate.
 * No-op when the persisted identity was anonymous, preserving a returning anon
 * user's chosen nick.
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
}

function persistChannel(value: string) {
  if (import.meta.client && value)
    localStorage.setItem(STORAGE_CHANNEL, value)
}

// --- Local buffer cache (IndexedDB) ------------------------------------------
// Per-message keyed store (DB v2). Every chat/tagmsg with a server-assigned msgid
// is written incrementally; reactions/redactions mutate the stored row in-place.
// On startup, the most recent CACHE_SEED_COUNT messages per buffer are loaded into
// the live reactive array so the user sees content before the WebSocket connects.
// Scroll-back (fetchOlderHistory) reads from IDB first; CHATHISTORY BEFORE is only
// sent when the local cache is exhausted.

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

/** Build a StoredMessage from a live ChatMessage for the given buffer name. Returns null when the message has no msgid (not worth caching). */
function buildStoredMessage(bufferName: string, msg: ChatMessage): StoredMessage | null {
  if (!msg.msgid || (msg.type !== 'chat' && msg.type !== 'tagmsg'))
    return null
  const userKey = cacheNickKey()
  if (!userKey)
    return null
  return {
    bufferKey: makeBufferKey(userKey, bufferName),
    msgid: msg.msgid,
    ts: msg.ts.getTime(),
    type: msg.type,
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
    relayedBy: msg.relayedBy,
  }
}

/**
 * Queue a message for the next debounced IDB batch flush.
 * Later writes with the same (bufferKey, msgid) key overwrite earlier ones,
 * so mutation chains (reactions, redactions) naturally converge.
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
    const seeded: ChatBuffer[] = []
    for (const meta of metas) {
      // Skip buffers that are already in the live list (e.g. on reconnect).
      if (findBuffer(meta.name))
        continue
      // Respect a closed DM: don't resurrect it unless the cache holds
      // activity newer than when the user closed it.
      if (meta.kind === 'pm') {
        const closedAt = closedDms[meta.name.toLowerCase()]
        if (closedAt != null) {
          // We need to peek at the newest message ts to decide.
          const peek = await loadRecentMessages(userKey, meta.name, 1)
          if (!peek.length || peek[peek.length - 1]!.ts <= closedAt)
            continue
        }
      }
      const rawMsgs = await loadRecentMessages(userKey, meta.name, CACHE_SEED_COUNT)
      if (!rawMsgs.length)
        continue
      const messages: ChatMessage[] = rawMsgs.map(m => ({
        id: msgCounter.value++,
        ts: new Date(m.ts),
        type: m.type,
        from: m.from,
        channel: m.channel,
        text: m.text,
        msgid: m.msgid,
        replyTo: m.replyTo,
        action: m.action,
        tag: m.tag,
        reactions: m.reactions ? { ...m.reactions } : undefined,
        backlog: true,
        redacted: m.redacted,
        relayedBy: m.relayedBy,
      }))
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
      }
      seeded.push(buf)
    }
    if (seeded.length)
      buffers.value = [...buffers.value, ...seeded]
  }
  catch {
    // Cache is a best-effort UX optimisation; ignore failures.
  }
  finally {
    _cacheHydrating = false
  }
}

// --- IRC wire ----------------------------------------------------------------
function send(line: string) {
  if (ws && ws.readyState === WebSocket.OPEN)
    ws.send(`${line}\r\n`)
}

function requestWhois(targetNick: string) {
  const key = targetNick.toLowerCase()
  const next = new Map(_whoisStore.value)
  next.set(key, { nick: targetNick, loading: true })
  _whoisStore.value = next
  send(`WHOIS ${targetNick} ${targetNick}`)
}

/**
 * Send a silent background NS INFO probe. NickServ's reply is parsed for
 * the email line but suppressed from visible buffers so no tab opens.
 * Safe to call any time we are connected and authenticated.
 */
function queryNickServInfo() {
  if (!account.value)
    return
  probingNickServInfo = true
  if (probeTimer !== null)
    clearTimeout(probeTimer)
  send('PRIVMSG NickServ :INFO')
  send('PRIVMSG NickServ :GET always-on')
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

/** Inverse of unescapeTag - encode a value for the IRCv3 message-tags wire format. */
function escapeTagValue(value: string) {
  return value
    .replace(/\0/g, '') // null bytes cannot be encoded in IRC tag values - strip them
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
 * Fetch older messages for a buffer by sending CHATHISTORY BEFORE anchored on
 * the oldest message currently in the buffer. Marks the buffer as loading so
 * the UI can show a spinner and avoid duplicate requests.
 */
/**
 * Load older messages for a buffer. Checks the local IDB cache first so the user
 * sees history without a server round-trip. Falls back to CHATHISTORY BEFORE once
 * the cache is exhausted. Sets loadingOlderHistory throughout so the UI shows the
 * correct spinner state regardless of source.
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
  const userKey = cacheNickKey()
  if (userKey && !buf.cacheExhausted) {
    const oldestTs = buf.messages[0]?.ts.getTime() ?? Date.now()
    const cached = await loadOlderMessages(userKey, target, oldestTs, CACHE_PAGE_SIZE)
    if (cached.length > 0) {
      const existingMsgids = new Set(buf.messages.filter(m => m.msgid).map(m => m.msgid))
      const newMsgs: ChatMessage[] = cached
        .filter(m => !existingMsgids.has(m.msgid))
        .map(m => ({
          id: msgCounter.value++,
          ts: new Date(m.ts),
          type: m.type,
          from: m.from,
          channel: m.channel,
          text: m.text,
          msgid: m.msgid,
          replyTo: m.replyTo,
          action: m.action,
          tag: m.tag,
          reactions: m.reactions ? { ...m.reactions } : undefined,
          backlog: true,
          redacted: m.redacted,
          relayedBy: m.relayedBy,
        }))
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
        // Keep the live DOM node count bounded: trim newest messages from the
        // tail. The user is scrolled to the top (trigger condition), so content
        // below the viewport disappears silently.
        if (buf.messages.length > MAX_LIVE_MESSAGES) {
          buf.messages.splice(MAX_LIVE_MESSAGES)
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
  pendingBeforeTargets.add(target.toLowerCase())
  send(`CHATHISTORY BEFORE ${target} ${anchor} ${HISTORY_LIMIT}`)
}

/**
 * Request the latest history for a target. When `since` (ms epoch) is given
 * only messages after that point are returned; otherwise the most recent
 * HISTORY_LIMIT messages are fetched for context.
 */
function requestHistory(target: string, since?: number) {
  if (!chatHistorySupported.value)
    return
  if (since != null && since > 0) {
    pendingTimeBoundTargets.add(target.toLowerCase())
    send(`CHATHISTORY LATEST ${target} timestamp=${new Date(since).toISOString()} ${HISTORY_LIMIT}`)
  }
  else {
    send(`CHATHISTORY LATEST ${target} * ${HISTORY_LIMIT}`)
  }
}

/**
 * Lower bound (ms) shared by TARGETS discovery and per-DM LATEST fetches.
 * Uses the last-seen cursor so we only pull what arrived while away, minus fuzz
 * to absorb clock skew. Falls back to a 7-day window on the first connect.
 */
function historyLowerBound() {
  const base = lastSeenTs > 0 ? lastSeenTs : Date.now() - DEFAULT_HISTORY_LOOKBACK_MS
  return base - HISTORY_FUZZ_MS
}

/**
 * Ask the server for all conversations (DMs) with activity since we last saw a
 * message. Ergo replies with a `draft/chathistory-targets` batch whose lines
 * are parsed in the CHATHISTORY case below.
 */
function requestHistoryTargets() {
  if (!chatHistorySupported.value)
    return
  const lower = historyLowerBound()
  const upper = Date.now() + HISTORY_FUZZ_MS
  // IRCv3 draft/chathistory TARGETS takes <after_timestamp> <before_timestamp> <limit>:
  // the first timestamp is the older lower bound (after which we want results)
  // and the second is the newer upper bound (before which we want results).
  // Swapping them would produce an inverted range, causing Ergo to return all targets.
  send(`CHATHISTORY TARGETS timestamp=${new Date(lower).toISOString()} timestamp=${new Date(upper).toISOString()} ${HISTORY_LIMIT}`)
}

function handleMessage(raw: string) {
  const { tags, command, params, nickFrom } = parseIrc(raw)
  const timeTag = tags.time
  const ts = timeTag != null && timeTag !== '' ? new Date(timeTag) : undefined
  const batchTag = tags.batch
  const backlog = batchTag != null && backlogBatches.has(batchTag)
  // Whether replayed lines in this batch should be prepended (CHATHISTORY BEFORE)
  // rather than appended. Every handler that stores a backlog line (PRIVMSG, JOIN,
  // PART) must honour this, otherwise BEFORE-batch lines land at the bottom of the
  // buffer (newest) instead of their correct chronological position at the top.
  const isPrependBatch = (batchTag != null ? backlogBatches.get(batchTag)?.isPrepend : false) ?? false
  // Count every replayed line against its batch budget, regardless of type.
  // Ergo counts all message types (JOIN, PART, PRIVMSG, etc.) toward the limit.
  // Also track the oldest line delivered (by ts) so BEFORE pagination can
  // advance past lines that never enter the buffer (e.g. reaction TAGMSGs,
  // suppressed HistServ relays); otherwise the anchor never moves and we
  // re-request the same window forever.
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
      const rawEntries = listRaw.split(' ').filter(Boolean)
      const list = rawEntries.map(c => (c.split('=')[0] ?? c))
      if (sub === 'LS') {
        // Capture the relaymsg separator character from the cap value (e.g. "draft/relaymsg=/" -> "/").
        const relayEntry = rawEntries.find(c => c.startsWith('draft/relaymsg='))
        if (relayEntry) {
          const sep = relayEntry.slice('draft/relaymsg='.length)
          if (sep)
            relaySeparator.value = sep
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
        if (list.includes('draft/read-marker'))
          readMarkerActive = true
        if (list.includes('draft/message-redaction'))
          redactionSupported.value = true
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
      nick.value = params[0] ?? inputNick.value
      addServer({ type: 'system', text: `Connected as ${nick.value}` })
      if (!_skipAutoJoin && inputChannel.value)
        send(`JOIN ${inputChannel.value}`)
      _skipAutoJoin = false
      _startPinging()
      // Subscribe to Orbit baseline metadata keys (draft/metadata-2).
      // Ergo pushes live METADATA notifications for subscribed keys whenever
      // any user visible to this client updates them. Without this subscription
      // the server only delivers metadata in response to explicit METADATA GET/LIST
      // requests; the per-channel METADATA LIST on JOIN is a fallback, not a
      // substitute for the live subscription feed.
      if (capLs.includes('draft/metadata-2'))
        send('METADATA * SUB avatar display-name orbit.status')
      // Discover DMs with activity since we were last online.
      requestHistoryTargets()
      break

    case '005': { // RPL_ISUPPORT
      // Tokens sit between the leading nick (params[0]) and the trailing
      // "are supported by this server" text. Capture the VAPID push key; this is
      // the one we must use as the browser subscription's applicationServerKey so
      // Ergo's push notifications validate against the subscription.
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
      // During pre-registration, SASL auth may still resolve the nick - Ergo
      // will ghost the occupant once the authenticated account claims ownership.
      // Only skip the error if SASL hasn't already failed; a failed SASL means
      // we have no account claim and the nick collision is genuinely fatal.
      if (connState.value === 'connecting' && authCreds && !saslFailed)
        break
      addServer({ type: 'error', text: `Nickname ${params[1]} is already in use. Try a different one.` })
      // Fatal: don't auto-reconnect with the same (taken) nick - that just loops.
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
      if (nickFrom === nick.value) {
        buf.joined = true
        if (channelKeyPrompt.value?.toLowerCase() === channel.toLowerCase()) {
          channelKeyPrompt.value = null
          channelKeyError.value = false
        }
        // Only steal focus for the channel we actually intend to land on. The server
        // can auto-join several channels on reconnect; flipping the active buffer
        // through each one would let the read watcher mark them all as read. When no
        // channel is persisted, land on the first one we join.
        const want = inputChannel.value.toLowerCase()
        const shouldFocus = want
          ? channel.toLowerCase() === want
          : activeName.value === SERVER_BUFFER
        if (shouldFocus)
          setActive(channel)
        // Defer the "You joined" marker until the channel's CHATHISTORY LATEST
        // batch has been appended, so replayed history sits above the marker
        // (newest) instead of below it. Without history support, add it now.
        // Request current channel modes so mode badges are always accurate,
        // regardless of whether a live MODE event was sent during the join burst.
        send(`MODE ${channel}`)
        send(`METADATA ${channel} LIST`)
        // Only render "You joined" when the user actively asked to join this
        // channel this session (joinChannel). Connect-time landing joins and
        // server-pushed auto-joins (always-on accounts the server keeps joined)
        // aren't in the intent set, so they stay silent. Consume the intent so a
        // later JOIN echo for the same channel doesn't re-trigger the marker.
        const isExplicitJoin = explicitJoinIntents.delete(channel.toLowerCase())
        // Persist buffer metadata so the next load can hydrate this channel
        // from cache without waiting for a new JOIN.
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
          if (isExplicitJoin)
            pendingJoinMarkers.add(channel.toLowerCase())
          // If we seeded this buffer from cache, only fetch messages newer than
          // the newest cached line so a quick reload shows nothing visibly loading.
          const newestCachedTs = buf.messages.length > 0 && buf.messages[buf.messages.length - 1]?.backlog
            ? buf.messages[buf.messages.length - 1]!.ts.getTime()
            : 0
          requestHistory(channel, newestCachedTs > 0 ? newestCachedTs : undefined)
        }
        else if (isExplicitJoin) {
          addToBuffer(channel, 'channel', { type: 'join', channel, text: `You joined ${channel}` }, { ts })
        }
      }
      else {
        addUser(buf, nickFrom)
        addToBuffer(channel, 'channel', { type: 'join', channel, text: `${nickFrom} joined` }, { ts, backlog })
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
        // User mode change - track bot flag (+B/-B)
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
        if (oldLc !== newLc) {
          // Migrate the persisted read position to the new key.
          if (readPositions[oldLc] !== undefined) {
            readPositions[newLc] = readPositions[oldLc]!
            delete readPositions[oldLc]
            if (import.meta.client)
              localStorage.setItem(STORAGE_READ_POSITIONS, JSON.stringify(readPositions))
          }
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
      // Service bots (NickServ/ChanServ/HistServ) are identity plumbing unless the
      // user has explicitly opened a conversation with them. Surface traffic only
      // inside such an open query; our own probe/SET commands (and their echoes)
      // and replayed history have no open query and stay in the internal log.
      if (kind === 'pm' && SERVICE_NICKS.has(bufferName.toLowerCase())) {
        const hasOpenQuery = findBuffer(bufferName)?.kind === 'pm'
        if (!hasOpenQuery || backlog || probingNickServInfo || suppressingNickServOp) {
          addServiceLog({ type: 'system', from, text: isAction ? `* ${body}` : body }, { ts })
          break
        }
        // Otherwise fall through to normal PM handling for the open conversation.
      }
      // If this PRIVMSG belongs to a BEFORE batch, prepend it so older messages
      // appear at the top of the buffer.
      // Suppress HistServ's human-readable TAGMSG relay notices (e.g. "Jokler sent a TAGMSG").
      // The TAGMSG command itself provides full tag context via the TAGMSG handler.
      if (nickFrom.toLowerCase() === 'histserv' && /\bsent a TAGMSG\b/i.test(body))
        break
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

    case 'BATCH': {
      const ref = params[0] ?? ''
      const id = ref.slice(1)
      if (ref.startsWith('+') && params[1] === 'chathistory') {
        const batchTarget = params[2] ?? ''
        const isPrepend = pendingBeforeTargets.delete(batchTarget.toLowerCase())
        const hasSinceBound = pendingTimeBoundTargets.delete(batchTarget.toLowerCase())
        backlogBatches.set(id, { target: batchTarget, count: 0, isPrepend, hasSinceBound, staging: isPrepend ? [] : undefined })
      }
      else if (ref.startsWith('-')) {
        const info = backlogBatches.get(id)
        if (info) {
          const batchBuf = findBuffer(info.target)
          if (batchBuf) {
            // Always clear loading state - covers both LATEST and BEFORE completions.
            batchBuf.loadingOlderHistory = false
            // Mark ready after the first batch (LATEST) completes so lazy-load
            // won't fire before initial history has settled.
            batchBuf.historyReady = true
            // Fewer messages than the limit means no more history - unless this was
            // a time-bounded LATEST fetch (hasSinceBound), in which case a sparse
            // result only means no activity in that window, not that all history is gone.
            if (info.count < HISTORY_LIMIT && !info.hasSinceBound)
              batchBuf.historyExhausted = true
            // Bulk-insert staged BEFORE messages in one splice so the Vue
            // reactive array only updates once (no per-message layout shift).
            // Server delivers messages oldest-first, staging preserves that
            // order, so splice(0,0,...) inserts them chronologically.
            if (info.isPrepend && info.staging != null && info.staging.length > 0) {
              batchBuf.messages.splice(0, 0, ...info.staging)
              // Now that these older messages exist in the buffer, apply any
              // reactions that were replayed in a newer batch but targeted them
              // (their parent only just arrived in this older page).
              for (const staged of info.staging) {
                if (staged.msgid != null)
                  drainPendingReactions(batchBuf, staged.msgid)
              }
            }
            // Trim the live buffer if loading older pages pushed it over the cap.
            if (batchBuf.messages.length > MAX_LIVE_MESSAGES) {
              batchBuf.messages.splice(MAX_LIVE_MESSAGES)
              batchBuf.tailTrimmed = true
            }
            // Write CHATHISTORY-sourced pages to IDB so cache-first scroll-back
            // can serve them on the next session.
            if (info.isPrepend && info.staging != null) {
              for (const m of info.staging)
                scheduleMsgWrite(batchBuf.name, m)
            }

            // Advance the pagination anchor to the oldest line delivered in this
            // batch, even if that line never entered the buffer (reaction
            // TAGMSGs and suppressed HistServ relays aren't stored). Without
            // this, batches full of reactions leave the buffer's oldest stored
            // message unchanged, so the next BEFORE re-requests the same window
            // forever and pagination can never reach older real messages. Only
            // move the anchor backwards in time so re-fetches/LATEST can't reset
            // it to a newer position.
            if (info.oldestTs != null) {
              const currentAnchorTs = batchBuf.historyAnchorTs != null ? Date.parse(batchBuf.historyAnchorTs) : Number.POSITIVE_INFINITY
              if (info.oldestTs < currentAnchorTs) {
                batchBuf.historyAnchorMsgid = info.oldestMsgid
                batchBuf.historyAnchorTs = new Date(info.oldestTs).toISOString()
              }
            }

            // A batch may add few (or zero) visible messages when it's dominated
            // by reactions/suppressed relays. Since the anchor now advances
            // regardless, keep fetching until we have a screen's worth of
            // visible content or history is exhausted. Cap retries as a safety
            // valve against pathological histories.
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
      // Reply to `CHATHISTORY TARGETS`: one line per conversation as
      // `CHATHISTORY TARGETS <target> <timestamp>`. Only act on DM targets -
      // channels are replayed on JOIN. If the user previously closed this DM,
      // skip unless the server reports newer activity than when it was closed.
      if (params[0] === 'TARGETS') {
        const target = params[1] ?? ''
        // Skip service bots - replaying our NickServ/ChanServ command history is
        // noise and would otherwise materialise a hidden service DM buffer.
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
            getBuffer(target, 'pm')
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

      // Seed readPositions from the server marker before any history replay runs.
      if (mrTarget && Number.isFinite(mrParsed))
        saveReadPosition(mrTarget, mrParsed)

      // Resolve a deferred DM target from CHATHISTORY TARGETS. Only open the
      // buffer and fetch history if the conversation has activity newer than the
      // read marker - otherwise skip it entirely so stale DMs don't clutter the
      // sidebar on fresh connects.
      const pendingLatestTs = pendingDmTargets.get(mrTarget.toLowerCase())
      if (pendingLatestTs != null) {
        pendingDmTargets.delete(mrTarget.toLowerCase())
        const readTs = Number.isFinite(mrParsed) ? mrParsed : (readPositions[mrTarget.toLowerCase()] ?? 0)
        if (pendingLatestTs > readTs) {
          getBuffer(mrTarget, 'pm')
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
        break // silently consumed - internal bot-detection WHO
      addToActive({ type: 'system', text: params[params.length - 1] ?? '' }, { ts })
      break
    }

    case '352': { // RPL_WHOREPLY - <client> <channel> <user> <host> <server> <nick> <flags> :<hop> <realname>
      const whoReplyChannel = params[1] ?? ''
      const whoNick = params[5] ?? ''
      const whoFlags = params[6] ?? ''
      if (whoReplyChannel && whoNick && whoFlags.includes('B')) {
        const buf = findBuffer(whoReplyChannel)
        if (buf) {
          const user = buf.users.find(u => u.name === whoNick)
          if (user)
            user.bot = true
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

    case '324': { // RPL_CHANNELMODEIS - response to MODE #channel query
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

    case '329': { // RPL_CREATIONTIME - channel creation timestamp
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

    case '333': // RPL_TOPICWHOTIME - topic setter + timestamp; silently consumed
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
        // "Information on #channel:" - first line of a successful INFO response
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
        // Suppress all ChanServ output while any probe is in flight.
        // The probe timer is the only cleanup path - this avoids partial suppression
        // on multi-line responses (e.g. Founder/Registered-at lines after the header).
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
      }

      // Swallow NickServ output during the silent background probe or a suppressed SET op.
      if (fromNickServ && isAddressedToUs && (probingNickServInfo || suppressingNickServOp))
        break

      // Surface NickServ replies only when the user has an open conversation with
      // it. Unsolicited notices (login banners, etc.) and background plumbing have
      // no open query and go to the internal service log instead of a visible tab.
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
        // Suppress server-generated TAGMSG relay notices - the TAGMSG command
        // itself provides full tag context via the TAGMSG case.
        if (/\bsent a TAGMSG\b/i.test(noticeText))
          break
        addToBuffer(noticeTgt, 'channel', { type: 'system', from: nickFrom, text: noticeText }, { ts })
      }
      else {
        addServer({ type: 'system', from: nickFrom.length > 0 ? nickFrom : undefined, text: noticeText }, { ts })
      }
      break
    }

    // WHOIS numerics - populate structured store when tracked, else show in buffer.
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

    case '318': { // RPL_ENDOFWHOIS - mark loading done
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
        // Silently consume if this is a tracked WHOIS response; the modes
        // text is informational and not surfaced in the modal UI yet.
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

      // Tags that are protocol metadata - never user-meaningful.
      const _META_TAGS = new Set(['time', 'batch', 'msgid', 'label', 'account'])
      // Tags we recognise and silently handle (or intentionally ignore).
      const _KNOWN_TAGS = new Set(['+typing', 'draft/typing', '+react', '+draft/react', '+unreact', '+draft/unreact', 'draft/react', '+icon', '+reply', 'draft/reply', '+draft/reply'])
      // Unknown tags - silently discard. Nothing user-meaningful to display.
      break
    }

    case 'REDACT': {
      // IRCv3 draft/message-redaction: :redactor REDACT <target> <msgid> [:reason]
      // Relayed both live and inside CHATHISTORY batches (backlog). The redactor
      // may be the author or a channel op. We mark the target message redacted
      // wherever it lives; an unknown msgid is ignored per spec.
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

    case '473': { // ERR_INVITEONLYCHAN - channel is invite-only
      const invChannel = params[1] ?? ''
      if (invChannel) {
        closeBuffer(invChannel)
        channelJoinBlocked.value = { channel: invChannel, reason: 'This channel is invite-only. You need to be invited by a channel operator.' }
      }
      break
    }

    case '477': { // ERR_NEEDREGGEDNICK - channel requires a registered account
      const regChannel = params[1] ?? ''
      if (regChannel) {
        closeBuffer(regChannel)
        channelJoinBlocked.value = { channel: regChannel, reason: 'This channel requires a registered account. Sign in to join.' }
      }
      break
    }

    case '475': { // ERR_BADCHANNELKEY - channel requires a key
      const keyChannel = params[1] ?? ''
      if (keyChannel) {
        closeBuffer(keyChannel)
        channelKeyError.value = channelKeyPrompt.value !== null
        channelKeyPrompt.value = keyChannel
      }
      break
    }

    case '761': { // RPL_KEYVALUE - metadata key/value (draft/metadata-2)
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
    case '762': { // RPL_METADATAEND - metadata list complete for target
      const endTarget = params[1]?.toLowerCase()
      if (endTarget && endTarget !== '*' && !channelMetaResolved.value.has(endTarget)) {
        channelMetaResolved.value = new Set(channelMetaResolved.value).add(endTarget)
      }
      break
    }
    case '770': // RPL_METADATASUBOK - subscription confirmed, no display needed
      break
    case '766': // RPL_NOMATCHINGKEY - silently consumed
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

    case '400': // ERR_UNKNOWNERROR - Ergo sends this when it can't assemble an outgoing
      // message (e.g. bad content in stored history). Route to the server buffer so it
      // doesn't clutter an active channel conversation.
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
        // Background parent-metadata probes legitimately fail (channel missing or
        // permission denied) - swallow those instead of surfacing a server error.
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
      else if (failCmd === 'WEBPUSH') {
        // draft/webpush failures (INVALID_PARAMS, INTERNAL_ERROR).
        const desc = params[params.length - 1] ?? 'Push subscription failed'
        addServer({ type: 'error', text: `Push notifications: ${desc}` }, { ts })
      }
      break
    }

    default:
      if (/^\d+$/.test(command)) {
        // Unhandled numeric reply - route to the server buffer so connection
        // handshake numerics (002, 003, 004, 251-266, 221, etc.) don't bleed
        // into whichever channel the user happens to be viewing.
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
  backlogBatches.clear()
  pendingReactions.clear()
  pendingJoinMarkers.clear()
  explicitJoinIntents.clear()
  pendingBeforeTargets.clear()
  pendingTimeBoundTargets.clear()
  pendingDmTargets.clear()
  serviceLog.value = []
  chatHistorySupported.value = false
  vapidKey.value = null
  echoMessageActive = false
  messageTagsActive = false
  readMarkerActive = false
  resetBuffers()
  account.value = ''
  accountEmail.value = import.meta.client ? localStorage.getItem(STORAGE_IDENTITY_EMAIL) : null
  const _cachedAlwaysOn = import.meta.client ? localStorage.getItem(STORAGE_IDENTITY_ALWAYS_ON) : null
  accountAlwaysOn.value = _cachedAlwaysOn === null ? null : _cachedAlwaysOn === 'true'
  accountInfoFetched.value = false
  connState.value = 'connecting'
  addServer({ type: 'system', text: `Connecting to ${WS_URL}...` })

  persistNick(inputNick.value)
  persistChannel(inputChannel.value)
  // Tag the persisted identity so a later signed-out load can discard it.
  markIdentityAuthed(authCreds != null)

  try {
    // IRCv3 defines the WebSocket subprotocols as `text.ircv3.net` / `binary.ircv3.net`.
    // Chrome strictly fails the handshake if we send a `Sec-WebSocket-Protocol` request
    // header and the server does not echo one back (Firefox/Safari are lenient). Ergo only
    // recognises the two IRCv3 names, so requesting the bare `binary` token meant no header
    // was echoed and Chrome aborted the connection. Request `text.ircv3.net` so Ergo echoes
    // it and sends UTF-8 text frames, which is what the `onmessage` handler below expects.
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

/**
 * Connect as the signed-in user when an identity provider is registered, else as
 * the nickname currently in the form. SASL auth is attempted and falls back to
 * plain registration if the server has no auth bridge yet.
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
  // Only fall back to the default channel when the user has never configured
  // one (key absent). An empty-string value means they explicitly left all
  // channels and should not be auto-joined anywhere.
  if (!inputChannel.value && (import.meta.client ? localStorage.getItem(STORAGE_CHANNEL) === null : true))
    inputChannel.value = defaultChannel(false)
  if (identityProvider) {
    try {
      const creds = await identityProvider()
      if (creds != null && creds.token !== '' && creds.username !== '') {
        authCreds = creds
        inputNick.value = creds.username
      }
    }
    catch {
      // Fall through to unauthenticated connect.
    }
  }
  openSocket()
}

/** Connect as an anonymous guest via SASL ANONYMOUS (no account, no JWT). */
function connectAsAnon() {
  _intentionalDisconnect = false
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
  // Clear the read line on the buffer we're leaving so it's recomputed fresh on
  // return.
  const prev = activeName.value
  if (prev && prev.toLowerCase() !== name.toLowerCase()) {
    const prevBuf = findBuffer(prev)
    if (prevBuf)
      prevBuf.readLineTs = undefined
    previousActiveName.value = prev
  }

  activeName.value = name
  const buf = findBuffer(name)

  // Eagerly mark the incoming buffer as read. The read watcher handles ongoing
  // monitoring, but it guards behind isChatVisible - which may not be true yet
  // (e.g. setActive fires during the initial connect before onMounted sets it,
  // or during the brief transition from the compact sheet to the full page).
  // Clearing here makes channel-switching reliable regardless of timing.
  if (buf && buf.kind !== 'server') {
    const last = buf.messages[buf.messages.length - 1]
    if (last)
      saveReadPosition(buf.name, last.ts.getTime())
    buf.unread = 0
    buf.mentions = 0
  }

  // Persist the last active channel so the next connect auto-joins and lands here.
  if (buf?.kind === 'channel') {
    inputChannel.value = name
    persistChannel(name)
  }
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
 * Rename a channel in place via the IRCv3 draft/channel-rename RENAME command.
 * The new name inherits the existing channel's prefix type (#/&) so the server
 * doesn't reject a prefix-type change. The buffer is migrated when the server
 * echoes the RENAME back (see the handler in handleMessage).
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
  // Load history the first time this DM is opened. Skipped if the buffer was
  // already populated via CHATHISTORY TARGETS on connect (historyReady is set
  // when the first chathistory batch closes).
  if (chatHistorySupported.value && !buf.historyReady)
    requestHistory(target)
}

function sendPm(target: string, text: string) {
  const trimmed = text.trim()
  if (!trimmed)
    return
  openPm(target)
  send(`PRIVMSG ${target} :${trimmed}`)
  addToBuffer(target, 'pm', { type: 'chat', from: nick.value, channel: target, text: trimmed })
}

function closeBuffer(name: string) {
  const buf = findBuffer(name)
  if (!buf || buf.kind === 'server')
    return
  if (buf.kind === 'channel' && buf.joined) {
    send(`PART ${buf.name}`)
    // Clear the persisted auto-join channel so the next connect() doesn't
    // immediately re-JOIN a channel the user explicitly left. setActive() below
    // will repopulate inputChannel if another channel becomes active.
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

function handleCommand(line: string) {
  const [cmd, ...rest] = line.slice(1).split(' ')
  const arg = rest.join(' ').trim()
  switch ((cmd ?? '').toLowerCase()) {
    case 'join':
    case 'j':
      if (arg) {
        const parts = arg.split(' ')
        const channelArg = parts[0] ?? ''
        joinChannel(channelArg, parts[1])
        // Auto-register as subchannel if user is OP on the parent.
        const fullName = channelArg.startsWith('#') || channelArg.startsWith('&') ? channelArg : `#${channelArg}`
        const pfx = fullName[0]!
        const rawSegs = fullName.slice(1).split('/').filter(Boolean)
        if (rawSegs.length > 1) {
          const parentName = `${pfx}${rawSegs.slice(0, -1).join('/')}`
          const subSlug = rawSegs[rawSegs.length - 1]!
          const role = myChannelRole(parentName)
          if (role && ['~', '&', '@'].includes(role.symbol)) {
            const parentBuf = findBuffer(parentName)
            const existing = parentBuf?.metadata?.get('subchannels') ?? channelMetaCache.value.get(parentName.toLowerCase())?.get('subchannels') ?? ''
            const list = existing ? existing.split(',').map(s => s.trim()).filter(Boolean) : []
            if (!list.map(s => s.toLowerCase()).includes(subSlug.toLowerCase())) {
              list.push(subSlug)
              setChannelMetadata(parentName, 'subchannels', list.join(','))
            }
          }
        }
      }
      break
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
      if (body) {
        send(`PRIVMSG ${to} :${body}`)
        addToBuffer(to, 'pm', { type: 'chat', from: nick.value, channel: to, text: body })
      }
      break
    }
    case 'me': {
      const target = activeName.value
      if (arg && target !== SERVER_BUFFER) {
        send(`PRIVMSG ${target} :\x01ACTION ${arg}\x01`)
        if (!echoMessageActive)
          addToBuffer(target, findBuffer(target)?.kind ?? 'channel', { type: 'chat', from: nick.value, channel: target, text: arg, action: true })
      }
      break
    }
    case 'nick':
      if (arg)
        send(`NICK ${arg.split(' ')[0]}`)
      break
    case 'topic': {
      const channel = activeName.value
      if (!channel || findBuffer(channel)?.kind !== 'channel')
        break
      if (arg)
        send(`TOPIC ${channel} :${arg}`)
      else
        send(`TOPIC ${channel}`)
      break
    }
    case 'op': {
      const channel = activeName.value
      if (!channel || findBuffer(channel)?.kind !== 'channel')
        break
      const target = rest[0] ?? nick.value
      sendMemberMode(channel, '+o', target)
      break
    }
    case 'deop': {
      const channel = activeName.value
      if (!channel || findBuffer(channel)?.kind !== 'channel')
        break
      const target = rest[0] ?? nick.value
      sendMemberMode(channel, '-o', target)
      break
    }
    case 'voice': {
      const channel = activeName.value
      if (!channel || findBuffer(channel)?.kind !== 'channel')
        break
      const target = rest[0] ?? nick.value
      sendMemberMode(channel, '+v', target)
      break
    }
    case 'devoice': {
      const channel = activeName.value
      if (!channel || findBuffer(channel)?.kind !== 'channel')
        break
      const target = rest[0] ?? nick.value
      sendMemberMode(channel, '-v', target)
      break
    }
    case 'kick': {
      const channel = activeName.value
      if (!channel || findBuffer(channel)?.kind !== 'channel')
        break
      const target = rest[0]
      if (!target)
        break
      const reason = rest.slice(1).join(' ')
      send(reason ? `KICK ${channel} ${target} :${reason}` : `KICK ${channel} ${target}`)
      break
    }
    case 'invite': {
      const channel = activeName.value
      if (!channel || findBuffer(channel)?.kind !== 'channel')
        break
      const target = rest[0]
      if (!target)
        break
      send(`INVITE ${target} ${channel}`)
      break
    }
    case 'mode': {
      // If the first arg is already a channel or nick target, forward as-is.
      // Otherwise inject the active channel so `/mode +m` works in-context.
      const firstArg = rest[0] ?? ''
      if (firstArg.startsWith('#') || firstArg.startsWith('&') || !firstArg) {
        if (arg)
          send(`MODE ${arg}`)
      }
      else {
        const channel = activeName.value
        if (channel && findBuffer(channel)?.kind === 'channel')
          send(`MODE ${channel} ${arg}`)
      }
      break
    }
    default:
      // Forward unknown commands directly to the server (e.g. /whois, /mode, /oper, etc.)
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
 * Toggle an emoji reaction on `parent` within the active buffer (IRCv3 react).
 * Sends a +reply-tagged +draft/react or +draft/unreact TAGMSG, then applies the
 * change optimistically. The optimistic write is idempotent, so an echoed TAGMSG
 * (when echo-message is active) reconciles to the same state.
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
 * Whether the current user may delete `message` in the active buffer. Allowed for
 * the user's own messages, or for any message when the user holds an operator-tier
 * role (halfop and above) in the channel. The server is the final authority and
 * may still reject with FAIL REDACT; this only governs whether we offer the action.
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
  // escapeTagValue is required: msgid is stored unescaped (via unescapeTag) and
  // must be re-encoded before embedding in the wire tag string.
  const tagPrefix = replyMsgid ? `@+reply=${escapeTagValue(replyMsgid)} ` : ''
  send(`${tagPrefix}PRIVMSG ${target} :${text}`)

  // When echo-message is active the server echoes our message back with a
  // server-assigned msgid, so skip the local optimistic add to avoid duplicates.
  if (!echoMessageActive) {
    addToBuffer(target, buf.kind, { type: 'chat', from: nick.value, channel: target, text, replyTo: replyMsgid })
  }

  clearReply()
  inputMessage.value = ''
}

/**
 * Send an IRCv3 typing notification to the active buffer target.
 * - `active`: user is actively typing (throttled to once per 3 s per target).
 * - `paused`: user stopped typing but has not cleared the input.
 * - `done`:   user cleared the input without sending (bypasses throttle).
 * Requires the `message-tags` capability to be active.
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
 * Initiate a ChanServ DROP (UNREGISTER) for a channel.
 * Adds the channel to the pending-drop set so the auto-confirm handler fires
 * when ChanServ replies with the verification code.
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
 * Returns true when a channel uses slash notation but its parent chain has not
 * authorized it via `subchannels` metadata. Used to show an "unverified"
 * indicator in the channel list and header.
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
    // Parent metadata not yet received (joined or not) - assume authorized (pending).
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

/** Set a metadata key on a channel via METADATA SET. */
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
    buf.messages = rawMsgs.map(m => ({
      id: msgCounter.value++,
      ts: new Date(m.ts),
      type: m.type,
      from: m.from,
      channel: m.channel,
      text: m.text,
      msgid: m.msgid,
      replyTo: m.replyTo,
      action: m.action,
      tag: m.tag,
      reactions: m.reactions ? { ...m.reactions } : undefined,
      backlog: true,
      redacted: m.redacted,
      relayedBy: m.relayedBy,
    }))
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
  requestHistory(target)
}

/**
 * Append the next page of newer messages from IDB cache when the user scrolls
 * toward the bottom of a tail-trimmed buffer. Slides the live window forward:
 * appends CACHE_PAGE_SIZE newer lines, then trims the same count from the front
 * (oldest) to keep the buffer at MAX_LIVE_MESSAGES. Clears tailTrimmed and
 * top-ups from the server once IDB has no more newer lines.
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
      const existingMsgids = new Set(buf.messages.filter(m => m.msgid).map(m => m.msgid))
      const newMsgs: ChatMessage[] = newer
        .filter(m => !existingMsgids.has(m.msgid))
        .map(m => ({
          id: msgCounter.value++,
          ts: new Date(m.ts),
          type: m.type,
          from: m.from,
          channel: m.channel,
          text: m.text,
          msgid: m.msgid,
          replyTo: m.replyTo,
          action: m.action,
          tag: m.tag,
          reactions: m.reactions ? { ...m.reactions } : undefined,
          backlog: true,
          redacted: m.redacted,
          relayedBy: m.relayedBy,
        }))
      if (newMsgs.length) {
        buf.messages.push(...newMsgs)
        // Slide window: trim from the front so DOM count stays bounded.
        if (buf.messages.length > MAX_LIVE_MESSAGES) {
          buf.messages.splice(0, buf.messages.length - MAX_LIVE_MESSAGES)
          // Oldest messages were just removed - cache can serve them again on scroll-up.
          buf.cacheExhausted = false
        }
      }
    }
    if (newer.length < CACHE_PAGE_SIZE) {
      // Reached the live edge of the cache - catch up with the server.
      buf.tailTrimmed = false
      requestHistory(target)
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
  const activeBuffer = computed(() => findBuffer(activeName.value) ?? buffers.value[0])
  const messages = computed(() => activeBuffer.value?.messages ?? [])
  const users = computed(() => activeBuffer.value?.users ?? [])
  const canChat = computed(() => isConnected.value && activeBuffer.value != null)

  // Whichever buffer the user is actually viewing is, by definition, read. Keep its
  // persisted read marker pinned to the newest message and its unread/mention counts
  // cleared. This is the single authority for "this channel is read" - it self-heals
  // after the reconnect race (where activeName flips as channels auto-join) by simply
  // reconciling whatever channel the user lands on once its history has settled. It
  // intentionally leaves readLineTs alone so the "new messages" line stays visible
  // while reading and is only cleared on leave (setActive).
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
        const last = b.messages[b.messages.length - 1]
        if (last)
          saveReadPosition(b.name, last.ts.getTime())
        b.unread = 0
        b.mentions = 0
      },
      { flush: 'post' },
    )

    // When the user returns to the tab, immediately clear unread state for
    // whatever buffer is active so the badge and read watcher stay in sync.
    document.addEventListener('visibilitychange', () => {
      if (document.hidden || !isChatVisible.value)
        return
      const b = activeBuffer.value
      if (!b || b.kind === 'server')
        return
      const last = b.messages[b.messages.length - 1]
      if (last)
        saveReadPosition(b.name, last.ts.getTime())
      b.unread = 0
      b.mentions = 0
      b.readLineTs = undefined
    })
  }

  const hasUnread = computed(() => buffers.value.some(b => b.unread > 0))
  const mentionCount = computed(() => buffers.value.reduce((sum, b) => sum + b.mentions, 0))
  const hasMention = computed(() => mentionCount.value > 0)

  function setChatVisible(visible: boolean) {
    isChatVisible.value = visible
    if (!visible) {
      // Clear the read line on the active buffer so the next open correctly
      // shows a "new messages" line for anything that arrived while closed.
      const buf = activeBuffer.value
      if (buf)
        buf.readLineTs = undefined
    }
    else {
      // When the UI becomes visible, immediately mark the active buffer as read
      // so the channel tab badge clears.
      const b = activeBuffer.value
      if (b && b.kind !== 'server') {
        const last = b.messages[b.messages.length - 1]
        if (last)
          saveReadPosition(b.name, last.ts.getTime())
        b.unread = 0
        b.mentions = 0
      }
    }
  }

  function toggleSidebar() {
    sidebarHidden.value = !sidebarHidden.value
    if (import.meta.client)
      localStorage.setItem(SIDEBAR_HIDDEN_KEY, String(sidebarHidden.value))
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
    // actions
    connect,
    connectAsAnon,
    disconnect,
    sendMessage,
    clearMessages,
    setActive,
    joinChannel,
    renameChannel,
    openPm,
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
    accountInfoFetched,
    queryNickServInfo,
    enableAlwaysOn,
    disableAlwaysOn,
    claimEmail,
    verifyClaimCode,
    // identity seam
    registerIdentityProvider,
    setMentionKeywords,
    clearInputNick,
    clearAuthedIdentity,
    defaultChannel,
    isChatVisible,
    setChatVisible,
    chatSheetOpen,
    seedChannel,
    fetchOlderHistory,
    seekToPresent,
    fetchNewerFromCache,
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
    requestWhois,
    // cache
    setCacheCap,
    cacheNickKey,
    // draft/relaymsg
    relaySeparator,
  }
}
