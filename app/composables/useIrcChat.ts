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
// Timestamp (ms) of the most recent live message we've seen. Used as the lower
// bound for CHATHISTORY TARGETS / LATEST on reconnect so we only pull missed DMs.
const STORAGE_LASTSEEN = 'hivecom.chat.lastseen'
// Map of lowercased DM nick -> timestamp (ms) when the user closed that query.
// Suppresses auto-reopening closed DMs unless newer activity exists.
const STORAGE_CLOSED_DMS = 'hivecom.chat.closeddms'
// Map of lowercased channel/pm name -> timestamp (ms) when the user last read it.
const STORAGE_READ_POSITIONS = 'hivecom.chat.readpos'
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
  'echo-message',
  'server-time',
  'multi-prefix',
  'account-tag',
  'account-notify',
  'extended-join',
  'draft/chathistory',
  // Required for Ergo to replay stored TAGMSGs (reactions) as real TAGMSG lines
  // with their client tags intact. Without it, Ergo degrades reaction history to
  // a data-less HistServ "<nick> sent a TAGMSG" PRIVMSG placeholder (see #1676),
  // which we can't turn back into a reaction. It also makes JOIN/PART/QUIT/NICK/
  // MODE replayable as real events inside history batches - those handlers below
  // guard against `backlog` so replayed events never mutate live state.
  'draft/event-playback',
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
}

export interface ChannelListEntry {
  name: string
  userCount: number
  topic: string
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
const SERVICE_NICKS = new Set(['histserv', 'nickserv', 'chanserv'])

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
const msgCounter = ref(0)
const SIDEBAR_HIDDEN_KEY = 'hivecom.chat.sidebar-hidden'
const sidebarHidden = ref(
  import.meta.client && localStorage.getItem(SIDEBAR_HIDDEN_KEY) === 'true',
)
// null = not yet checked; '' = confirmed absent (unclaimed); string = email present (claimed)
const accountEmail = ref<string | null>(null)
// null = not yet determined; true/false parsed from NickServ INFO Flags line
const accountAlwaysOn = ref<boolean | null>(null)

// --- Channel list (populated by LIST/322/323) --------------------------------
const channelList = ref<ChannelListEntry[]>([])
const channelListLoading = ref(false)
const channelBrowserOpen = ref(false)
// When non-null, a password-protected channel denied our JOIN and we need a key.
const channelKeyPrompt = ref<string | null>(null)
// True when the most recent key attempt was rejected (475).
const channelKeyError = ref(false)

// Form / draft state, shared so both surfaces edit the same values.
const inputNick = ref('')
const inputChannel = ref('')
const inputMessage = ref('')
const replyTarget = ref<ChatMessage | null>(null)

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

// Per-channel last-read timestamps, keyed by lowercased channel/pm name.
let readPositions: Record<string, number> = {}

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
}

let ws: WebSocket | null = null
let initialised = false
let _readWatcherRegistered = false
let _intentionalDisconnect = false
let _reconnectAttempts = 0
const MAX_RECONNECT_ATTEMPTS = 3
let _reconnectTimer: ReturnType<typeof setTimeout> | null = null
// Whether any chat UI surface (sheet or full page) is currently visible to the
// user. The read watcher only clears unread/mentions when this is true.
const isChatVisible = ref(false)

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
let echoMessageActive = false
let probingNickServInfo = false
let probeTimer: ReturnType<typeof setTimeout> | null = null
let suppressingNickServOp = false
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

// --- Buffers helpers ---------------------------------------------------------
function listChannels() {
  channelList.value = []
  channelListLoading.value = true
  send('LIST')
}

function resetBuffers() {
  for (const timer of typingTimers.values())
    clearTimeout(timer)
  typingTimers.clear()
  lastTypingSent.clear()
  buffers.value = [{ name: SERVER_BUFFER, kind: 'server', messages: [], users: [], unread: 0, mentions: 0, joined: true }]
  activeName.value = SERVER_BUFFER
  channelList.value = []
  channelListLoading.value = false
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
    buf.messages.push(newMsg)
  }

  // A message just landed in buf.messages - apply any reactions that arrived
  // before it (e.g. reactions on our own message that preceded its echo). The
  // staged-prepend path above doesn't splice yet, so skip it there; the BATCH
  // end handler drains staged msgids after the bulk splice.
  if (!opts.prepend && newMsg.msgid != null)
    drainPendingReactions(buf, newMsg.msgid)

  // Track the newest live chat message so DM history fetches know where we left off.
  if (!opts.backlog && msg.type === 'chat')
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
  if (isActive && isChatVisible.value)
    saveReadPosition(name, ts.getTime())

  // Browser notification: genuinely-new pings only, never replayed history, and not
  // while the user is reading this exact channel live.
  if (!opts.backlog && isPing && !alreadyRead && browserNotificationsEnabled.value
    && typeof Notification !== 'undefined' && Notification.permission === 'granted'
    && (!isActive || document.hidden)) {
    // eslint-disable-next-line no-new
    new Notification(`${msg.from} mentioned you in ${buf.name}`, { body: msg.text, tag: `chat-mention-${buf.name}` })
  }

  // Don't badge what you're looking at or have already read.
  // isActive only suppresses the badge when the chat UI is actually visible.
  if ((isActive && isChatVisible.value) || alreadyRead)
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
      paramIdx++
      if (adding)
        buf.modes.add(ch)
      else
        buf.modes.delete(ch)
      modesChanged = true
    }
    else {
      if (adding)
        buf.modes.add(ch)
      else
        buf.modes.delete(ch)
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

function persistChannel(value: string) {
  if (import.meta.client && value)
    localStorage.setItem(STORAGE_CHANNEL, value)
}

// --- IRC wire ----------------------------------------------------------------
function send(line: string) {
  if (ws && ws.readyState === WebSocket.OPEN)
    ws.send(`${line}\r\n`)
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
    accountEmail.value ??= ''
    accountAlwaysOn.value ??= false
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
function fetchOlderHistory(target: string) {
  if (!chatHistorySupported.value)
    return
  const buf = findBuffer(target)
  if (!buf || buf.historyExhausted || buf.loadingOlderHistory)
    return
  // Only trigger once initial history has settled.
  if (!buf.historyReady)
    return
  // Anchor the BEFORE request on the oldest line we've *seen* in history, not
  // just the oldest line stored in the buffer. A prior batch may have delivered
  // older lines that were never stored (reaction TAGMSGs, suppressed HistServ
  // relays); anchoring on those lets pagination advance past them. Falls back
  // to the oldest stored message on the first fetch (before any anchor exists).
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
    if (anchorMsg == null)
      return
    anchor = anchorMsg.msgid != null
      ? `msgid=${anchorMsg.msgid}`
      : `timestamp=${anchorMsg.ts.toISOString()}`
  }
  buf.loadingOlderHistory = true
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
      const list = listRaw.split(' ').filter(Boolean).map(c => (c.split('=')[0] ?? c))
      if (sub === 'LS') {
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
      if (inputChannel.value)
        send(`JOIN ${inputChannel.value}`)
      _startPinging()
      // Discover DMs with activity since we were last online.
      requestHistoryTargets()
      break

    case '433': // ERR_NICKNAMEINUSE
      // During pre-registration, SASL auth may still resolve the nick - Ergo
      // will ghost the occupant once the authenticated account claims ownership.
      // Only skip the error if SASL hasn't already failed; a failed SASL means
      // we have no account claim and the nick collision is genuinely fatal.
      if (connState.value === 'connecting' && authCreds && !saslFailed)
        break
      addServer({ type: 'error', text: `Nickname ${params[1]} is already in use. Try a different one.` })
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
        // Only render "You joined" when the user actively asked to join this
        // channel this session (joinChannel). Connect-time landing joins and
        // server-pushed auto-joins (always-on accounts the server keeps joined)
        // aren't in the intent set, so they stay silent. Consume the intent so a
        // later JOIN echo for the same channel doesn't re-trigger the marker.
        const isExplicitJoin = explicitJoinIntents.delete(channel.toLowerCase())
        if (chatHistorySupported.value) {
          if (isExplicitJoin)
            pendingJoinMarkers.add(channel.toLowerCase())
          requestHistory(channel)
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
      addServer({ type: 'system', text: `${oldName} is now known as ${newNick}` }, { ts })
      if (isOwnNick && activeName.value !== SERVER_BUFFER)
        addToBuffer(activeName.value, findBuffer(activeName.value)?.kind ?? 'channel', { type: 'system', text: `You are now known as ${newNick}` }, { ts })
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
      addToBuffer(bufferName, kind, { type: 'chat', from, channel: target, text: body, msgid, replyTo, ...(isAction && { action: true }) }, { ts, backlog, prepend: isPrependBatch, batchTag: batchTag ?? undefined })
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
                fetchOlderHistory(info.target)
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
          // Eagerly create the buffer so the DM appears in the sidebar
          // immediately rather than popping in when the first replayed message
          // arrives mid-load.
          getBuffer(target, 'pm')
          requestHistory(target, historyLowerBound())
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

    case '323': // RPL_LISTEND
      channelListLoading.value = false
      break

    case '324': { // RPL_CHANNELMODEIS - response to MODE #channel query
      const modeChannel = params[1] ?? ''
      const modeBuf = findBuffer(modeChannel)
      if (modeBuf)
        applyModeChanges(modeBuf, params.slice(2))
      break
    }

    case '329': // RPL_CREATIONTIME - channel creation timestamp; silently consumed
      break

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

      // Always extract the email claim and always-on flag regardless of whether we show the message.
      if (fromNickServ && isAddressedToUs) {
        const emailMatch = /^Email address:(.+)$/.exec(noticeText)
        if (emailMatch)
          accountEmail.value = emailMatch[1]?.trim() ?? ''
        // Parse always-on from the explicit GET response or INFO flags.
        const alwaysOnMatch = /stored always-on setting is:\s*(\w+)/i.exec(noticeText)
        if (alwaysOnMatch)
          accountAlwaysOn.value = alwaysOnMatch[1]?.toLowerCase() === 'enabled'
        else if (/^Flags:.*\balways-on\b/i.test(noticeText))
          accountAlwaysOn.value = true
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

    // WHOIS numerics - formatted and shown in the active buffer.
    case '301': { // RPL_AWAY
      const [, awayNick, awayMsg] = params
      if (awayNick)
        addToActive({ type: 'system', text: `[${awayNick}] is away: ${awayMsg ?? ''}` }, { ts })
      break
    }

    case '311': { // RPL_WHOISUSER: nick user host * :realname
      const [, wNick, wUser, wHost,, wReal] = params
      if (wNick)
        addToActive({ type: 'system', text: `[${wNick}] (${wUser ?? ''}@${wHost ?? ''}): ${wReal ?? ''}` }, { ts })
      break
    }

    case '312': { // RPL_WHOISSERVER: nick server :serverinfo
      const [, wNick, wServer, wInfo] = params
      if (wNick)
        addToActive({ type: 'system', text: `[${wNick}] ${wServer ?? ''} (${wInfo ?? ''})` }, { ts })
      break
    }

    case '313': { // RPL_WHOISOPERATOR
      const [, wNick, wMsg] = params
      if (wNick)
        addToActive({ type: 'system', text: `[${wNick}] ${wMsg ?? ''}` }, { ts })
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
        addToActive({ type: 'system', text: `[${wNick}] idle ${idleFmt}${signonTs ? `, signon: ${signonTs}` : ''}` }, { ts })
      }
      break
    }

    case '318': { // RPL_ENDOFWHOIS
      const [, wNick, wMsg] = params
      if (wNick)
        addToActive({ type: 'system', text: `[${wNick}] ${wMsg ?? ''}` }, { ts })
      break
    }

    case '319': { // RPL_WHOISCHANNELS
      const [, wNick, wChans] = params
      if (wNick)
        addToActive({ type: 'system', text: `[${wNick}] ${wChans ?? ''}` }, { ts })
      break
    }

    case '330': { // RPL_WHOISACCOUNT: nick account :message
      const [, wNick, wAccount, wMsg] = params
      if (wNick)
        addToActive({ type: 'system', text: `[${wNick}] ${wMsg ?? 'is logged in as'} ${wAccount ?? ''}` }, { ts })
      break
    }

    case '338': { // RPL_WHOISACTUALLY (UnrealIRCd actual host)
      const [, wNick,, wMsg] = params
      if (wNick)
        addToActive({ type: 'system', text: `[${wNick}] ${wMsg ?? params[params.length - 1] ?? ''}` }, { ts })
      break
    }

    case '671': { // RPL_WHOISSECURE (UnrealIRCd TLS)
      const [, wNick, wMsg] = params
      if (wNick)
        addToActive({ type: 'system', text: `[${wNick}] ${wMsg ?? ''}` }, { ts })
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
      if (reactReplyTo && (reactValue || unreactValue)) {
        const isReactChannel = tagTarget.startsWith('#') || tagTarget.startsWith('&')
        const isSelf = nickFrom === nick.value
        const reactBufName = isReactChannel ? tagTarget : (isSelf ? tagTarget : nickFrom)
        const reactBuf = findBuffer(reactBufName)
        if (reactBuf) {
          const staged = batchTag != null ? backlogBatches.get(batchTag)?.staging : undefined
          applyReaction(reactBuf, reactReplyTo, (reactValue ?? unreactValue)!, nickFrom, unreactValue != null, staged)
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
      const META_TAGS = new Set(['time', 'batch', 'msgid', 'label', 'account'])
      // Tags we recognise and silently handle (or intentionally ignore).
      const KNOWN_TAGS = new Set(['+typing', 'draft/typing', '+react', '+draft/react', '+unreact', '+draft/unreact', 'draft/react', '+icon'])
      const unknownTags = Object.keys(tags).filter(k => !META_TAGS.has(k) && !KNOWN_TAGS.has(k))
      if (!unknownTags.length)
        break
      const isTagChannel = tagTarget.startsWith('#') || tagTarget.startsWith('&')
      const tagBufName = isTagChannel ? tagTarget : nickFrom
      const tagBufKind: BufferKind = isTagChannel ? 'channel' : 'pm'
      const tagStr = unknownTags.join(', ')
      addToBuffer(tagBufName, tagBufKind, {
        type: 'tagmsg',
        text: `${nickFrom} sent an unknown tag: ${tagStr}`,
        tag: tagStr,
      }, { ts })
      break
    }

    case '473': { // ERR_INVITEONLYCHAN - channel is invite-only
      const invChannel = params[1] ?? ''
      if (invChannel) {
        closeBuffer(invChannel)
        addServer({ type: 'error', text: `Cannot join ${invChannel} - invite only. You need to be invited by a channel operator.` })
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

    case '400': // ERR_UNKNOWNERROR - Ergo sends this when it can't assemble an outgoing
      // message (e.g. bad content in stored history). Route to the server buffer so it
      // doesn't clutter an active channel conversation.
      addServer({ type: 'error', text: params[params.length - 1] ?? raw }, { ts })
      break

    default:
      if (/^\d+$/.test(command)) {
        // Unhandled numeric reply - show the text portion in the active buffer.
        const numText = params[params.length - 1] ?? ''
        if (numText)
          addToActive({ type: 'system', text: numText }, { ts })
      }
      else {
        addServer({ type: 'system', text: raw }, { ts })
      }
  }
}

// --- Connection lifecycle ----------------------------------------------------
function _scheduleReconnect() {
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
  saslMech = null
  saslFailed = false
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
  serviceLog.value = []
  chatHistorySupported.value = false
  echoMessageActive = false
  messageTagsActive = false
  resetBuffers()
  account.value = ''
  accountEmail.value = null
  connState.value = 'connecting'
  addServer({ type: 'system', text: `Connecting to ${WS_URL}...` })

  persistNick(inputNick.value)
  persistChannel(inputChannel.value)

  try {
    ws = new WebSocket(WS_URL, ['binary'])
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
async function connect() {
  _intentionalDisconnect = false
  _reconnectAttempts = 0
  if (_reconnectTimer !== null) {
    clearTimeout(_reconnectTimer)
    _reconnectTimer = null
  }
  authCreds = null
  useAnonymous = false
  if (!inputChannel.value)
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
  if (!localStorage.getItem(STORAGE_CHANNEL))
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

function openPm(target: string) {
  const buf = getBuffer(target, 'pm')
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
      if (import.meta.client)
        localStorage.removeItem(STORAGE_CHANNEL)
    }
  }
  else if (buf.kind === 'pm') {
    rememberClosedDm(name, buf)
  }
  buffers.value = buffers.value.filter(b => b !== buf)
  if (activeName.value.toLowerCase() === name.toLowerCase())
    setActive(buffers.value[0]?.name ?? SERVER_BUFFER)
}

function handleCommand(line: string) {
  const [cmd, ...rest] = line.slice(1).split(' ')
  const arg = rest.join(' ').trim()
  switch ((cmd ?? '').toLowerCase()) {
    case 'join':
    case 'j':
      if (arg) {
        const parts = arg.split(' ')
        joinChannel(parts[0] ?? '', parts[1])
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
      send(`MODE ${channel} +o ${target}`)
      break
    }
    case 'deop': {
      const channel = activeName.value
      if (!channel || findBuffer(channel)?.kind !== 'channel')
        break
      const target = rest[0] ?? nick.value
      send(`MODE ${channel} -o ${target}`)
      break
    }
    case 'voice': {
      const channel = activeName.value
      if (!channel || findBuffer(channel)?.kind !== 'channel')
        break
      const target = rest[0] ?? nick.value
      send(`MODE ${channel} +v ${target}`)
      break
    }
    case 'devoice': {
      const channel = activeName.value
      if (!channel || findBuffer(channel)?.kind !== 'channel')
        break
      const target = rest[0] ?? nick.value
      send(`MODE ${channel} -v ${target}`)
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
  if (!parent.msgid || !reaction)
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

export function useIrcChat() {
  if (!initialised && import.meta.client) {
    initialised = true
    loadPersisted()
    resetBuffers()
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
        if (!isChatVisible.value)
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
    // reply
    replyTarget,
    setReply,
    clearReply,
    // reactions
    toggleReaction,
    // typing
    sendTyping,
    // connection
    connState,
    isConnected,
    canChat,
    latencyMs,
    nick,
    account,
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
    send,
    connect,
    connectAsAnon,
    disconnect,
    sendMessage,
    clearMessages,
    setActive,
    joinChannel,
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
    queryNickServInfo,
    enableAlwaysOn,
    disableAlwaysOn,
    claimEmail,
    verifyClaimCode,
    // identity seam
    registerIdentityProvider,
    setMentionKeywords,
    clearInputNick,
    defaultChannel,
    setChatVisible,
    seedChannel,
    fetchOlderHistory,
  }
}
