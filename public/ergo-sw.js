/*
 * Hivecom chat (Ergo) push service worker.
 *
 * Separate from `/sw.js` because a registration can hold only one subscription
 * bound to one `applicationServerKey`, and `/sw.js` uses the app's VAPID key.
 * This worker lives under the `/chat-push/` scope and subscribes with Ergo's
 * advertised key instead.
 *
 * Per draft/webpush (soju.im/webpush), each payload is one raw IRC message with
 * no trailing CRLF, not JSON.
 */

globalThis.addEventListener('install', () => {
  globalThis.skipWaiting()
})

globalThis.addEventListener('activate', (event) => {
  event.waitUntil(globalThis.clients.claim())
})

// Minimal IRC line parser: `@tags :prefix COMMAND params... :trailing`.
function parseIrc(line) {
  let rest = line
  const tags = {}

  if (rest.startsWith('@')) {
    const sp = rest.indexOf(' ')
    const tagStr = rest.slice(1, sp === -1 ? undefined : sp)
    rest = sp === -1 ? '' : rest.slice(sp + 1)
    for (const part of tagStr.split(';')) {
      if (!part)
        continue
      const eq = part.indexOf('=')
      if (eq === -1)
        tags[part] = ''
      else
        tags[part.slice(0, eq)] = part.slice(eq + 1)
    }
  }

  let prefix = ''
  if (rest.startsWith(':')) {
    const sp = rest.indexOf(' ')
    prefix = rest.slice(1, sp === -1 ? undefined : sp)
    rest = sp === -1 ? '' : rest.slice(sp + 1)
  }

  let trailing
  const trailingIdx = rest.indexOf(' :')
  if (rest.startsWith(':')) {
    trailing = rest.slice(1)
    rest = ''
  }
  else if (trailingIdx !== -1) {
    trailing = rest.slice(trailingIdx + 2)
    rest = rest.slice(0, trailingIdx)
  }

  const parts = rest.split(' ').filter(Boolean)
  const command = (parts.shift() ?? '').toUpperCase()
  const params = trailing != null ? [...parts, trailing] : parts
  const nick = prefix.split('!')[0] ?? prefix

  return { tags, prefix, nick, command, params }
}

// Strip CTCP ACTION wrapping (\x01ACTION ...\x01) into a "* nick did x" form.
function formatBody(nick, text) {
  if (text.startsWith('\u0001ACTION') && text.endsWith('\u0001'))
    return `* ${nick} ${text.slice(7, -1).trim()}`
  return text
}

// Ergo casefolds with ASCII casemapping, so lowercasing is enough to line a
// MARKREAD target up with the conversation a notification came from.
function casefold(name) {
  return name.toLowerCase()
}

function buildNotification({ tags, nick, command, params }) {
  // Only PRIVMSG/NOTICE carry a target + body worth surfacing.
  if (command !== 'PRIVMSG' && command !== 'NOTICE')
    return null

  const target = params[0] ?? ''
  const text = params[params.length - 1] ?? ''
  if (!text)
    return null

  const isChannel = /^[#&+!]/.test(target)
  const title = isChannel ? target : (nick || 'Hivecom')
  const body = isChannel ? formatBody(nick, `${nick}: ${text}`) : formatBody(nick, text)

  // Deep-link to the conversation that pinged. Channels use `?channel=` without
  // the `#`, which would parse as a URL fragment. DMs use `?dm=<sender>`, since
  // `target` is us. Non-`#` prefixes have no route and fall back to the chat
  // root. `notify=1` makes the chat page connect immediately without the dialog.
  let href = '/chat?notify=1'
  if (isChannel) {
    if (target.startsWith('#'))
      href = `/chat?channel=${encodeURIComponent(target.slice(1))}&notify=1`
  }
  else if (nick) {
    href = `/chat?dm=${encodeURIComponent(nick)}&notify=1`
  }

  const ts = Date.parse(tags.time ?? '')

  return {
    title,
    options: {
      body,
      icon: '/apple-touch-icon.png',
      badge: '/apple-touch-icon.png',
      // Coalesce repeated pings from the same conversation.
      tag: tags.msgid || target || undefined,
      renotify: true,
      // A later MARKREAD matches `conversation` + `ts` to retire this. For a DM
      // the conversation is the sender, not `target` (us).
      data: {
        href,
        conversation: casefold(isChannel ? target : nick),
        ts: Number.isFinite(ts) ? ts : null,
      },
    },
  }
}

// Ergo pushes MARKREAD once a conversation has been read, including to this
// device when the read lands before its subscription registered (Ergo only
// skips the endpoint that sent it). Clear what it covers and show nothing. The
// ping it retires already satisfied userVisibleOnly.
async function clearRead(params) {
  const conversation = casefold(params[0] ?? '')
  if (!conversation)
    return

  const raw = params[1] ?? ''
  const marker = Date.parse(raw.startsWith('timestamp=') ? raw.slice('timestamp='.length) : raw)

  const notifications = await globalThis.registration.getNotifications()
  for (const notification of notifications) {
    const data = notification.data
    if (!data || data.conversation !== conversation)
      continue
    // Anything newer than the marker arrived after the read and still stands.
    if (Number.isFinite(marker) && typeof data.ts === 'number' && data.ts > marker)
      continue
    notification.close()
  }
}

// The page drops a timestamp here right before WEBPUSH REGISTER for a freshly
// enabled subscription. Ergo sends a "PING webpush" test push before acking, and
// its later keepalive PINGs are byte-identical, so this flag is the only way to
// tell them apart. Consumed on first read. The TTL covers Ergo skipping the test
// push for an endpoint it already knew.
const WELCOME_CACHE = 'ergo-push-meta'
const WELCOME_KEY = '/ergo-push/welcome-pending'
const WELCOME_TTL_MS = 2 * 60 * 1000

async function consumeWelcomePending() {
  try {
    const cache = await caches.open(WELCOME_CACHE)
    const hit = await cache.match(WELCOME_KEY)
    if (!hit)
      return false
    await cache.delete(WELCOME_KEY)
    const ts = Number(await hit.text())
    return Number.isFinite(ts) && Date.now() - ts < WELCOME_TTL_MS
  }
  catch {
    return false
  }
}

globalThis.addEventListener('push', (event) => {
  if (!event.data)
    return

  const line = event.data.text().trim()
  if (!line)
    return

  let parsed
  try {
    parsed = parseIrc(line)
  }
  catch {
    parsed = null
  }

  if (parsed?.command === 'MARKREAD') {
    event.waitUntil(clearRead(parsed.params))
    return
  }

  // Ergo sends "PING webpush" to verify a fresh WEBPUSH REGISTER and as a
  // periodic keepalive. It's a health check, not activity. The only one worth
  // showing is the verification push right after the user enabled notifications
  // (see consumeWelcomePending), so they see delivery works. Other PINGs are
  // dropped. Like MARKREAD, the occasional silent push stays within
  // userVisibleOnly tolerance.
  if (parsed?.command === 'PING') {
    event.waitUntil((async () => {
      if (await consumeWelcomePending()) {
        await globalThis.registration.showNotification('Hivecom chat', {
          body: 'You\'re now subscribed to push notifications',
          icon: '/apple-touch-icon.png',
          badge: '/apple-touch-icon.png',
          tag: 'ergo-push-welcome',
          data: { href: '/chat?notify=1' },
        })
      }
    })())
    return
  }

  let notification
  try {
    notification = parsed ? buildNotification(parsed) : null
  }
  catch {
    notification = null
  }

  // Fall back to a generic notification so a parse miss never silently drops a
  // ping (userVisibleOnly subscriptions must show something for each push).
  if (!notification) {
    notification = {
      title: 'Hivecom chat',
      options: { body: 'New activity', icon: '/apple-touch-icon.png', badge: '/apple-touch-icon.png', data: { href: '/chat?notify=1' } },
    }
  }

  event.waitUntil(globalThis.registration.showNotification(notification.title, notification.options))
})

globalThis.addEventListener('pushsubscriptionchange', (event) => {
  // The browser rotated this device's subscription. Re-subscribe with the same
  // key, then ask any open client to re-run WEBPUSH REGISTER over IRC (the page
  // owns the IRC connection). If no client is open, the page reconciles on its
  // next open.
  event.waitUntil((async () => {
    const oldSubscription = event.oldSubscription
    let newSubscription = event.newSubscription

    if (!newSubscription) {
      const applicationServerKey = oldSubscription?.options?.applicationServerKey
      if (applicationServerKey) {
        try {
          newSubscription = await globalThis.registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey,
          })
        }
        catch {
          // Couldn't re-subscribe; Ergo will expire the stale endpoint.
        }
      }
    }

    const clientList = await globalThis.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const client of clientList) {
      client.postMessage({
        type: 'ergo-pushsubscriptionchange',
        oldEndpoint: oldSubscription?.endpoint ?? null,
        subscription: newSubscription ? newSubscription.toJSON() : null,
      })
    }
  })())
})

globalThis.addEventListener('notificationclick', (event) => {
  event.notification.close()

  const href = (event.notification.data && event.notification.data.href) || '/chat?notify=1'

  event.waitUntil((async () => {
    const clientList = await globalThis.clients.matchAll({ type: 'window', includeUncontrolled: true })

    for (const client of clientList) {
      const url = new URL(client.url)
      if (url.origin === globalThis.location.origin) {
        await client.focus()
        // Route via postMessage to the app's router, not client.navigate(). This
        // worker's /chat-push/ scope doesn't control the page, so navigate()
        // rejects on spec-compliant engines, and WebKit/iOS PWAs update the URL
        // without triggering the SPA router.
        client.postMessage({ type: 'navigate', href })
        return
      }
    }

    await globalThis.clients.openWindow(href)
  })())
})
