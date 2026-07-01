/*
 * Hivecom service worker.
 *
 * Hand-rolled and dependency-free. Its sole job today is Web Push delivery for
 * platform notifications (non-chat). No offline/precaching is implemented - if
 * that's wanted later, consider migrating to a generated Workbox SW.
 */

globalThis.addEventListener('install', () => {
  globalThis.skipWaiting()
})

globalThis.addEventListener('activate', (event) => {
  event.waitUntil(globalThis.clients.claim())
})

globalThis.addEventListener('push', (event) => {
  if (!event.data)
    return

  let payload
  try {
    payload = event.data.json()
  }
  catch {
    payload = { title: 'Hivecom', body: event.data.text() }
  }

  const title = payload.title || 'Hivecom'
  const options = {
    body: payload.body || '',
    icon: '/apple-touch-icon.png',
    badge: '/apple-touch-icon.png',
    tag: payload.tag,
    renotify: Boolean(payload.tag),
    data: { href: payload.href || '/' },
  }

  event.waitUntil((async () => {
    await globalThis.registration.showNotification(title, options)

    // Mirror the unread count onto the app icon badge when the platform
    // supports it (the page also does this while open).
    if (typeof payload.unreadCount === 'number' && 'setAppBadge' in globalThis.navigator) {
      try {
        if (payload.unreadCount > 0)
          await globalThis.navigator.setAppBadge(payload.unreadCount)
        else
          await globalThis.navigator.clearAppBadge()
      }
      catch {
        // Badging is best-effort.
      }
    }
  })())
})

globalThis.addEventListener('pushsubscriptionchange', (event) => {
  // The browser rotated this device's subscription. Re-subscribe immediately so
  // pushes keep flowing, then ask any open client to persist the new endpoint
  // (the page has the auth needed to write to the DB). If no client is open,
  // the page reconciles on its next open by comparing the live subscription
  // against the stored row.
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
          // Couldn't re-subscribe; the stale endpoint will 410 and be pruned.
        }
      }
    }

    const clientList = await globalThis.clients.matchAll({
      type: 'window',
      includeUncontrolled: true,
    })
    for (const client of clientList) {
      client.postMessage({
        type: 'pushsubscriptionchange',
        oldEndpoint: oldSubscription?.endpoint ?? null,
        subscription: newSubscription ? newSubscription.toJSON() : null,
      })
    }
  })())
})

globalThis.addEventListener('notificationclick', (event) => {
  event.notification.close()

  const href = (event.notification.data && event.notification.data.href) || '/'

  event.waitUntil((async () => {
    const clientList = await globalThis.clients.matchAll({
      type: 'window',
      includeUncontrolled: true,
    })

    // Focus an existing Hivecom tab and navigate it, if one is open.
    for (const client of clientList) {
      const url = new URL(client.url)
      if (url.origin === globalThis.location.origin) {
        await client.focus()
        if ('navigate' in client) {
          try {
            await client.navigate(href)
          }
          catch {
            // Some browsers reject cross-document navigate; fall back to a message.
            client.postMessage({ type: 'navigate', href })
          }
        }
        else {
          client.postMessage({ type: 'navigate', href })
        }
        return
      }
    }

    // Otherwise open a fresh window.
    await globalThis.clients.openWindow(href)
  })())
})
