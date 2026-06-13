/*
 * Hivecom chat (Ergo) push service worker.
 *
 * Separate from the main `/sw.js` so it can own its own push subscription: a
 * service worker registration may only hold one subscription bound to one
 * `applicationServerKey`, and `/sw.js` already uses the app's VAPID key for
 * platform notifications. This worker registers under the `/chat-push/` scope
 * and subscribes with Ergo's server-advertised VAPID key instead.
 *
 * Per the draft/webpush (soju.im/webpush) spec, each push payload is exactly one
 * raw IRC message (no trailing CRLF) - NOT JSON. We parse it just enough to build
 * a useful notification (sender, channel, text).
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

function buildNotification(line) {
  const { tags, nick, command, params } = parseIrc(line)

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

  // Deep-link to the channel so tapping lands in the conversation that pinged,
  // not the bare server tab. The chat page reads `?channel=` (without the `#`,
  // which would otherwise be parsed as a URL fragment). DMs have no such route,
  // so they fall back to the chat root.
  const href = target.startsWith('#')
    ? `/chat?channel=${encodeURIComponent(target.slice(1))}`
    : '/chat'

  return {
    title,
    options: {
      body,
      icon: '/apple-touch-icon.png',
      badge: '/apple-touch-icon.png',
      // Coalesce repeated pings from the same conversation.
      tag: tags.msgid || target || undefined,
      renotify: true,
      data: { href },
    },
  }
}

globalThis.addEventListener('push', (event) => {
  if (!event.data)
    return

  const line = event.data.text().trim()
  if (!line)
    return

  let notification
  try {
    notification = buildNotification(line)
  }
  catch {
    notification = null
  }

  // Fall back to a generic notification so a parse miss never silently drops a
  // ping (userVisibleOnly subscriptions must show something for each push).
  if (!notification) {
    notification = {
      title: 'Hivecom chat',
      options: { body: 'New activity', icon: '/apple-touch-icon.png', badge: '/apple-touch-icon.png', data: { href: '/chat' } },
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

  const href = (event.notification.data && event.notification.data.href) || '/chat'

  event.waitUntil((async () => {
    const clientList = await globalThis.clients.matchAll({ type: 'window', includeUncontrolled: true })

    for (const client of clientList) {
      const url = new URL(client.url)
      if (url.origin === globalThis.location.origin) {
        await client.focus()
        if ('navigate' in client) {
          try {
            await client.navigate(href)
          }
          catch {
            client.postMessage({ type: 'navigate', href })
          }
        }
        else {
          client.postMessage({ type: 'navigate', href })
        }
        return
      }
    }

    await globalThis.clients.openWindow(href)
  })())
})
