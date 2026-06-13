/*
 * Hivecom service worker.
 *
 * Hand-rolled and dependency-free. Its sole job today is Web Push delivery for
 * platform notifications (non-chat). No offline/precaching is implemented - if
 * that's wanted later, consider migrating to a generated Workbox SW.
 */

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('push', (event) => {
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
    await self.registration.showNotification(title, options)

    // Mirror the unread count onto the app icon badge when the platform
    // supports it (the page also does this while open).
    if (typeof payload.unreadCount === 'number' && 'setAppBadge' in self.navigator) {
      try {
        if (payload.unreadCount > 0)
          await self.navigator.setAppBadge(payload.unreadCount)
        else
          await self.navigator.clearAppBadge()
      }
      catch {
        // Badging is best-effort.
      }
    }
  })())
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  const href = (event.notification.data && event.notification.data.href) || '/'

  event.waitUntil((async () => {
    const clientList = await self.clients.matchAll({
      type: 'window',
      includeUncontrolled: true,
    })

    // Focus an existing Hivecom tab and navigate it, if one is open.
    for (const client of clientList) {
      const url = new URL(client.url)
      if (url.origin === self.location.origin) {
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
    await self.clients.openWindow(href)
  })())
})
