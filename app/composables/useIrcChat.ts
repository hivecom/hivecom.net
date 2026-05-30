// ─────────────────────────────────────────────────────────────────────────────
// Singleton IRC-over-WebSocket client.
//
// All connection state lives at module scope so the socket survives route
// changes and stays in sync between the navbar chat sheet and the full `/chat`
// page. The WebSocket is only ever created in the browser.
// ─────────────────────────────────────────────────────────────────────────────

const WS_URL = 'wss://irc.hivecom.net:8097'
const DEFAULT_CHANNEL = '#playground'
const STORAGE_NICK = 'hivecom.chat.nick'
const STORAGE_CHANNEL = 'hivecom.chat.channel'
// Set once the user has successfully connected at least once. Used to reveal the
// navbar chat icon, which is hidden by default outside of local development.
const STORAGE_REVEALED = 'hivecom.chat.revealed'

export type ConnState = 'disconnected' | 'connecting' | 'connected' | 'error'

export interface ChatMessage {
  id: number
  ts: Date
  type: 'chat' | 'system' | 'error' | 'join' | 'part'
  from?: string
  channel?: string
  text: string
}

const MODE_PREFIX_RE = /^[~&@%+]+/

// --- Shared reactive state ---------------------------------------------------
const connState = ref<ConnState>('disconnected')
const nick = ref('')
const joinedChannel = ref('')
const messages = ref<ChatMessage[]>([])
const users = ref<string[]>([])
const msgCounter = ref(0)

// Whether the chat entry point should be revealed in the navbar. Persisted so it
// survives reloads once the user has connected through the /chat page.
const revealed = ref(false)

// Form / draft state, shared so both surfaces edit the same values.
const inputNick = ref('')
const inputChannel = ref(DEFAULT_CHANNEL)
const inputMessage = ref('')

let ws: WebSocket | null = null
let initialised = false

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

function addMsg(msg: Omit<ChatMessage, 'id' | 'ts'>) {
  messages.value.push({ ...msg, id: msgCounter.value++, ts: new Date() })
}

function send(line: string) {
  if (ws && ws.readyState === WebSocket.OPEN)
    ws.send(`${line}\r\n`)
}

function stripPrefix(name: string) {
  return name.replace(MODE_PREFIX_RE, '')
}

function addUser(name: string) {
  const clean = stripPrefix(name)
  if (clean && !users.value.includes(clean))
    users.value = [...users.value, clean].sort((a, b) => a.localeCompare(b))
}

function removeUser(name: string) {
  const clean = stripPrefix(name)
  users.value = users.value.filter(u => u !== clean)
}

function parseIrc(raw: string) {
  let rest = raw
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
  return { prefix, command, params, nickFrom }
}

function handleMessage(raw: string) {
  const { command, params, nickFrom } = parseIrc(raw)

  switch (command) {
    case 'PING':
      send(`PONG :${params[0] ?? ''}`)
      break

    case '001': // RPL_WELCOME
      connState.value = 'connected'
      markRevealed()
      nick.value = inputNick.value
      addMsg({ type: 'system', text: `Connected as ${nick.value}` })
      send(`JOIN ${inputChannel.value}`)
      break

    case '433': // ERR_NICKNAMEINUSE
      addMsg({ type: 'error', text: `Nickname ${params[1]} is already in use. Try a different one.` })
      connState.value = 'error'
      ws?.close()
      break

    case 'JOIN':
      joinedChannel.value = params[0] ?? inputChannel.value
      if (nickFrom === nick.value) {
        addMsg({ type: 'join', channel: joinedChannel.value, text: `You joined ${joinedChannel.value}` })
      }
      else {
        addUser(nickFrom)
        addMsg({ type: 'join', channel: joinedChannel.value, text: `${nickFrom} joined` })
      }
      break

    case 'PART':
      removeUser(nickFrom)
      if (nickFrom === nick.value)
        addMsg({ type: 'part', channel: params[0], text: `You left ${params[0]}` })
      else
        addMsg({ type: 'part', channel: params[0], text: `${nickFrom} left` })
      break

    case 'NICK': {
      const newNick = params[0] ?? ''
      removeUser(nickFrom)
      addUser(newNick)
      if (nickFrom === nick.value)
        nick.value = newNick
      addMsg({ type: 'system', text: `${nickFrom} is now known as ${newNick}` })
      break
    }

    case 'PRIVMSG': {
      const target = params[0] ?? ''
      const text = params[1] ?? ''
      const isAction = text.startsWith('\x01ACTION ') && text.endsWith('\x01')
      if (isAction)
        addMsg({ type: 'chat', from: `* ${nickFrom}`, channel: target, text: text.slice(8, -1) })
      else
        addMsg({ type: 'chat', from: nickFrom, channel: target, text })
      break
    }

    case 'QUIT':
      removeUser(nickFrom)
      addMsg({ type: 'part', text: `${nickFrom} quit: ${params[0] ?? ''}` })
      break

    case 'ERROR':
      addMsg({ type: 'error', text: `Server error: ${params[0] ?? raw}` })
      break

    case '353': { // RPL_NAMREPLY
      const nicks = (params[params.length - 1] ?? '').split(' ').filter(Boolean)
      nicks.forEach(addUser)
      break
    }

    case '366': // RPL_ENDOFNAMES
      break

    case '332': // RPL_TOPIC
      addMsg({ type: 'system', text: `Topic for ${params[1]}: ${params[2] ?? ''}` })
      break

    case 'NOTICE':
      addMsg({ type: 'system', from: nickFrom.length > 0 ? nickFrom : undefined, text: params[params.length - 1] ?? '' })
      break

    default:
      if (!/^\d+$/.test(command))
        addMsg({ type: 'system', text: raw })
  }
}

function connect() {
  if (!import.meta.client)
    return
  if (ws) {
    ws.close()
    ws = null
  }

  users.value = []
  connState.value = 'connecting'
  addMsg({ type: 'system', text: `Connecting to ${WS_URL}...` })

  persistNick(inputNick.value)
  persistChannel(inputChannel.value)

  try {
    ws = new WebSocket(WS_URL, ['binary'])
  }
  catch (e) {
    connState.value = 'error'
    addMsg({ type: 'error', text: `Failed to open WebSocket: ${String(e)}` })
    return
  }

  ws.onopen = () => {
    send(`CAP LS 302`)
    send(`NICK ${inputNick.value}`)
    send(`USER ${inputNick.value} 0 * :Hivecom Web Client`)
    send(`CAP END`)
  }

  ws.onmessage = (evt) => {
    const text: string = typeof evt.data === 'string' ? evt.data : ''
    text.split('\r\n').filter(Boolean).forEach(handleMessage)
  }

  ws.onerror = () => {
    connState.value = 'error'
    addMsg({ type: 'error', text: 'WebSocket error - check console for details.' })
  }

  ws.onclose = (evt) => {
    if (connState.value !== 'error')
      connState.value = 'disconnected'
    addMsg({ type: 'system', text: `Disconnected (code ${evt.code})` })
    users.value = []
    ws = null
  }
}

function disconnect() {
  if (ws) {
    send('QUIT :Leaving')
    ws.close()
  }
  joinedChannel.value = ''
  users.value = []
}

function sendMessage() {
  const text = inputMessage.value.trim()
  if (!text || !joinedChannel.value)
    return
  send(`PRIVMSG ${joinedChannel.value} :${text}`)
  addMsg({ type: 'chat', from: nick.value, channel: joinedChannel.value, text })
  inputMessage.value = ''
}

function clearMessages() {
  messages.value = []
}

export function useIrcChat() {
  if (!initialised && import.meta.client) {
    initialised = true
    loadPersisted()
  }

  /** Seed the nickname field with a default (e.g. the signed-in username) when empty. */
  function ensureNick(defaultNick: string) {
    if (!inputNick.value && defaultNick)
      inputNick.value = defaultNick
  }

  const isConnected = computed(() => connState.value === 'connected')
  const canChat = computed(() => isConnected.value && Boolean(joinedChannel.value))

  return {
    // config
    WS_URL,
    // state
    connState,
    revealed,
    nick,
    joinedChannel,
    messages,
    users,
    inputNick,
    inputChannel,
    inputMessage,
    isConnected,
    canChat,
    // actions
    connect,
    disconnect,
    sendMessage,
    clearMessages,
    ensureNick,
  }
}
