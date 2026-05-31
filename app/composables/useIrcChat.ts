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
const DEFAULT_CHANNEL = '#playground'
const STORAGE_NICK = 'hivecom.chat.nick'
const STORAGE_CHANNEL = 'hivecom.chat.channel'
// Set once the user has successfully connected at least once. Used to reveal the
// navbar chat icon, which is hidden by default outside of local development.
const STORAGE_REVEALED = 'hivecom.chat.revealed'

// Synthetic buffer that holds connection-level/system output before any channel
// is joined. Never sent to the server.
const SERVER_BUFFER = '*'

// IRCv3 capabilities we request when the server advertises them.
const WANTED_CAPS = [
  'sasl',
  'message-tags',
  'server-time',
  'multi-prefix',
  'account-tag',
  'account-notify',
  'extended-join',
  'draft/chathistory',
]

export type ConnState = 'disconnected' | 'connecting' | 'connected' | 'error'

export interface ChatMessage {
  id: number
  ts: Date
  type: 'chat' | 'system' | 'error' | 'join' | 'part'
  from?: string
  channel?: string
  text: string
  /** True for messages replayed from server-side history (CHATHISTORY batch). */
  backlog?: boolean
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
  topic?: string
}

/** A channel member together with their current IRC mode prefixes. */
export interface ChatUser {
  name: string
  /** Mode prefix chars, highest privilege first (e.g. "@", "+", "~@"). Empty when none. */
  prefix: string
}

/** Identity supplied by the host app (the website's Supabase session). */
export interface ChatIdentity {
  username: string
  token: string
}
export type IdentityProvider = () => Promise<ChatIdentity | null> | ChatIdentity | null

const MODE_PREFIX_RE = /^[~&@%+]+/

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
const activeName = ref<string>(SERVER_BUFFER)
const msgCounter = ref(0)

// Whether the chat entry point should be revealed in the navbar. Persisted so it
// survives reloads once the user has connected through the /chat page.
const revealed = ref(false)

// Form / draft state, shared so both surfaces edit the same values.
const inputNick = ref('')
const inputChannel = ref(DEFAULT_CHANNEL)
const inputMessage = ref('')

// Extra words (besides the current nick) that count as a mention. Sourced from
// user settings and pushed in via `setMentionKeywords` so this module-level
// store stays decoupled from the settings composable.
const mentionKeywords = ref<string[]>([])

/** Replace the list of extra keywords that highlight a message as a mention. */
export function setMentionKeywords(words: string[]) {
  mentionKeywords.value = words.map(w => w.trim()).filter(w => w.length > 0)
}

let ws: WebSocket | null = null
let initialised = false

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
let chatHistorySupported = false
// Active CHATHISTORY batch ids, so replayed lines can be flagged as backlog.
const backlogBatches = new Set<string>()

// --- Buffers helpers ---------------------------------------------------------
function resetBuffers() {
  buffers.value = [{ name: SERVER_BUFFER, kind: 'server', messages: [], users: [], unread: 0, mentions: 0, joined: true }]
  activeName.value = SERVER_BUFFER
}

function findBuffer(name: string) {
  const lc = name.toLowerCase()
  return buffers.value.find(b => b.name.toLowerCase() === lc)
}

function getBuffer(name: string, kind: BufferKind): ChatBuffer {
  const existing = findBuffer(name)
  if (existing)
    return existing
  const buf: ChatBuffer = { name, kind, messages: [], users: [], unread: 0, mentions: 0, joined: false, topic: '' }
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
  opts: { ts?: Date, backlog?: boolean } = {},
) {
  const buf = getBuffer(name, kind)
  buf.messages.push({
    ...msg,
    id: msgCounter.value++,
    ts: opts.ts ?? new Date(),
    backlog: opts.backlog,
  })

  if (opts.backlog)
    return

  if (buf.name.toLowerCase() !== activeName.value.toLowerCase()) {
    buf.unread += 1
    if (msg.type === 'chat' && msg.from != null && msg.from !== nick.value && mentionsSelf(msg.text))
      buf.mentions += 1
  }
}

/** Connection-level/system output that has no channel context. */
function addServer(msg: Omit<ChatMessage, 'id' | 'ts'>, opts: { ts?: Date } = {}) {
  addToBuffer(SERVER_BUFFER, 'server', msg, opts)
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

/** Apply a MODE change's prefix mutations to the matching channel members. */
function applyModeChanges(buf: ChatBuffer, args: string[]) {
  const modeStr = args[0]
  if (modeStr == null || modeStr.length === 0)
    return
  let adding = true
  let paramIdx = 1
  let changed = false
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
    else if (PARAM_MODES_ALWAYS.has(ch) || (adding && PARAM_MODES_ON_SET.has(ch))) {
      paramIdx++
    }
  }
  if (changed)
    buf.users = [...buf.users].sort(sortUsers)
}

function removeUserEverywhere(name: string) {
  const clean = stripPrefix(name)
  for (const buf of buffers.value)
    buf.users = buf.users.filter(u => u.name !== clean)
}

// --- Persistence -------------------------------------------------------------
function loadPersisted() {
  if (!import.meta.client)
    return
  inputNick.value = localStorage.getItem(STORAGE_NICK) ?? ''
  inputChannel.value = localStorage.getItem(STORAGE_CHANNEL) ?? DEFAULT_CHANNEL
  revealed.value = localStorage.getItem(STORAGE_REVEALED) === 'true'
}

function markRevealed() {
  revealed.value = true
  if (import.meta.client)
    localStorage.setItem(STORAGE_REVEALED, 'true')
}

function persistNick(value: string) {
  if (import.meta.client && value)
    localStorage.setItem(STORAGE_NICK, value)
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

function requestHistory(channel: string) {
  if (chatHistorySupported)
    send(`CHATHISTORY LATEST ${channel} * 50`)
}

function handleMessage(raw: string) {
  const { tags, command, params, nickFrom } = parseIrc(raw)
  const timeTag = tags.time
  const ts = timeTag != null && timeTag !== '' ? new Date(timeTag) : undefined
  const batchTag = tags.batch
  const backlog = batchTag != null && backlogBatches.has(batchTag)

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
        chatHistorySupported = capLs.includes('draft/chathistory')
        const wanted = WANTED_CAPS.filter(c => capLs.includes(c))
        if (wanted.length)
          send(`CAP REQ :${wanted.join(' ')}`)
        else
          finishCap()
      }
      else if (sub === 'ACK') {
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
      break

    case '902': // ERR_NICKLOCKED
    case '904': // ERR_SASLFAIL
    case '905': // ERR_SASLTOOLONG
    case '906': // ERR_SASLABORTED
    case '907': // ERR_SASLALREADY
      addServer({ type: 'error', text: 'Authentication failed - continuing without a verified account.' })
      finishCap()
      break

    case '001': // RPL_WELCOME
      connState.value = 'connected'
      markRevealed()
      nick.value = params[0] ?? inputNick.value
      addServer({ type: 'system', text: `Connected as ${nick.value}` })
      if (inputChannel.value)
        send(`JOIN ${inputChannel.value}`)
      _startPinging()
      break

    case '433': // ERR_NICKNAMEINUSE
      addServer({ type: 'error', text: `Nickname ${params[1]} is already in use. Try a different one.` })
      connState.value = 'error'
      ws?.close()
      break

    case 'JOIN': {
      const channel = params[0] ?? inputChannel.value
      const buf = getBuffer(channel, 'channel')
      if (nickFrom === nick.value) {
        buf.joined = true
        setActive(channel)
        addToBuffer(channel, 'channel', { type: 'join', channel, text: `You joined ${channel}` }, { ts, backlog })
        requestHistory(channel)
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
      if (buf)
        buf.users = buf.users.filter(u => u.name !== stripPrefix(nickFrom))
      if (nickFrom === nick.value)
        addToBuffer(channel, 'channel', { type: 'part', channel, text: `You left ${channel}` }, { ts })
      else
        addToBuffer(channel, 'channel', { type: 'part', channel, text: `${nickFrom} left` }, { ts, backlog })
      break
    }

    case 'MODE': {
      const target = params[0] ?? ''
      if (target.startsWith('#') || target.startsWith('&')) {
        const buf = findBuffer(target)
        if (buf)
          applyModeChanges(buf, params.slice(1))
      }
      break
    }

    case 'NICK': {
      const newNick = params[0] ?? ''
      const oldName = stripPrefix(nickFrom)
      for (const buf of buffers.value) {
        const existing = buf.users.find(u => u.name === oldName)
        if (existing) {
          buf.users = buf.users.filter(u => u.name !== oldName)
          addUser(buf, existing.prefix + newNick)
        }
      }
      if (nickFrom === nick.value)
        nick.value = newNick
      addServer({ type: 'system', text: `${nickFrom} is now known as ${newNick}` }, { ts })
      break
    }

    case 'PRIVMSG': {
      const target = params[0] ?? ''
      const text = params[1] ?? ''
      const isAction = text.startsWith('\x01ACTION ') && text.endsWith('\x01')
      const body = isAction ? text.slice(8, -1) : text
      const from = isAction ? `* ${nickFrom}` : nickFrom
      // A message addressed to our nick is a PM; bucket it by the sender.
      const isPm = target.toLowerCase() === nick.value.toLowerCase()
      const bufferName = isPm ? nickFrom : target
      const kind: BufferKind = isPm ? 'pm' : 'channel'
      addToBuffer(bufferName, kind, { type: 'chat', from, channel: target, text: body }, { ts, backlog })
      break
    }

    case 'QUIT':
      removeUserEverywhere(nickFrom)
      addServer({ type: 'part', text: `${nickFrom} quit: ${params[0] ?? ''}` }, { ts })
      break

    case 'BATCH': {
      const ref = params[0] ?? ''
      const id = ref.slice(1)
      if (ref.startsWith('+') && params[1] === 'chathistory')
        backlogBatches.add(id)
      else if (ref.startsWith('-'))
        backlogBatches.delete(id)
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

    case '366': // RPL_ENDOFNAMES
      break

    case '375': // RPL_MOTDSTART
    case '372': // RPL_MOTD
    case '376': // RPL_ENDOFMOTD
      addServer({ type: 'system', text: params[params.length - 1] ?? '' }, { ts })
      break

    case '332': { // RPL_TOPIC
      const channel = params[1] ?? SERVER_BUFFER
      getBuffer(channel, 'channel').topic = params[2] ?? ''
      addToBuffer(channel, 'channel', { type: 'system', text: `Topic: ${params[2] ?? ''}` }, { ts })
      break
    }

    case 'NOTICE':
      addServer({ type: 'system', from: nickFrom.length > 0 ? nickFrom : undefined, text: params[params.length - 1] ?? '' }, { ts })
      break

    default:
      if (!/^\d+$/.test(command))
        addServer({ type: 'system', text: raw }, { ts })
  }
}

// --- Connection lifecycle ----------------------------------------------------
function openSocket() {
  if (!import.meta.client)
    return
  if (ws) {
    ws.close()
    ws = null
  }

  capLs = []
  saslMech = null
  backlogBatches.clear()
  chatHistorySupported = false
  resetBuffers()
  account.value = ''
  connState.value = 'connecting'
  addServer({ type: 'system', text: `Connecting to ${WS_URL}...` })

  persistNick(inputNick.value)
  persistChannel(inputChannel.value)

  try {
    ws = new WebSocket(WS_URL, ['binary'])
  }
  catch (e) {
    connState.value = 'error'
    addServer({ type: 'error', text: `Failed to open WebSocket: ${String(e)}` })
    return
  }

  ws.onopen = () => {
    const n = inputNick.value !== '' ? inputNick.value : `anon-${Math.random().toString(36).slice(2, 7)}`
    send('CAP LS 302')
    send(`NICK ${n}`)
    send(`USER ${n} 0 * :Hivecom Web Client`)
  }

  ws.onmessage = (evt) => {
    const text: string = typeof evt.data === 'string' ? evt.data : ''
    text.split('\r\n').filter(Boolean).forEach(handleMessage)
  }

  ws.onerror = () => {
    connState.value = 'error'
    _stopPinging()
    addServer({ type: 'error', text: 'WebSocket error - check console for details.' })
  }

  ws.onclose = (evt) => {
    if (connState.value !== 'error')
      connState.value = 'disconnected'
    _stopPinging()
    addServer({ type: 'system', text: `Disconnected (code ${evt.code})` })
    for (const buf of buffers.value) {
      buf.users = []
      buf.joined = false
    }
    ws = null
  }
}

/**
 * Connect as the signed-in user when an identity provider is registered, else as
 * the nickname currently in the form. SASL auth is attempted and falls back to
 * plain registration if the server has no auth bridge yet.
 */
async function connect() {
  authCreds = null
  useAnonymous = false
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
  authCreds = null
  useAnonymous = true
  openSocket()
}

function disconnect() {
  if (ws) {
    send('QUIT :Leaving')
    ws.close()
  }
  resetBuffers()
}

// --- User actions ------------------------------------------------------------
function setActive(name: string) {
  activeName.value = name
  const buf = findBuffer(name)
  if (buf) {
    buf.unread = 0
    buf.mentions = 0
  }
}

function joinChannel(name: string) {
  const channel = name.startsWith('#') ? name : `#${name}`
  send(`JOIN ${channel}`)
  getBuffer(channel, 'channel')
  setActive(channel)
}

function openPm(target: string) {
  getBuffer(target, 'pm')
  setActive(target)
}

function closeBuffer(name: string) {
  const buf = findBuffer(name)
  if (!buf || buf.kind === 'server')
    return
  if (buf.kind === 'channel' && buf.joined)
    send(`PART ${buf.name}`)
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
      if (arg)
        joinChannel(arg.split(' ')[0] ?? '')
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
        addToBuffer(target, findBuffer(target)?.kind ?? 'channel', { type: 'chat', from: `* ${nick.value}`, channel: target, text: arg })
      }
      break
    }
    case 'nick':
      if (arg)
        send(`NICK ${arg.split(' ')[0]}`)
      break
    default:
      addServer({ type: 'error', text: `Unknown command: /${cmd}` })
  }
}

function sendMessage() {
  const text = inputMessage.value.trim()
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

  send(`PRIVMSG ${target} :${text}`)
  addToBuffer(target, buf.kind, { type: 'chat', from: nick.value, channel: target, text })
  inputMessage.value = ''
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
  '&': { symbol: '&', label: 'Admin', color: 'var(--color-text-purple)' },
  '@': { symbol: '@', label: 'Operator', color: 'var(--color-text-green)' },
  '%': { symbol: '%', label: 'Half-operator', color: 'var(--color-text-blue)' },
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

  const hasUnread = computed(() => buffers.value.some(b => b.unread > 0))
  const mentionCount = computed(() => buffers.value.reduce((sum, b) => sum + b.mentions, 0))
  const hasMention = computed(() => mentionCount.value > 0)

  return {
    // config
    WS_URL,
    // connection
    connState,
    isConnected,
    canChat,
    latencyMs,
    revealed,
    nick,
    account,
    // buffers
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
    // actions
    connect,
    connectAsAnon,
    disconnect,
    sendMessage,
    clearMessages,
    setActive,
    joinChannel,
    openPm,
    closeBuffer,
    ensureNick,
    // identity seam
    registerIdentityProvider,
    setMentionKeywords,
  }
}
