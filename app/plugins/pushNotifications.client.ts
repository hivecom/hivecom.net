/**
 * Registers the Hivecom service worker and wires PWA niceties:
 *
 * 1. Registers `/sw.js` (required for Web Push delivery).
 * 2. Handles the SW's `navigate` postMessage - used when a push notification is
 *    clicked and an open tab can't self-navigate.
 * 3. Mirrors the unread notification count onto the app icon badge while the
 *    app is open (the SW handles it for pushes received while closed).
 *
 * Lives at plugin scope so the SW is registered once, early, regardless of
 * which surfaces mount.
 */
import { watch } from 'vue'
import { useDataNotifications } from '@/composables/useDataNotifications'
import { usePushNotifications } from '@/composables/usePushNotifications'

export default defineNuxtPlugin(() => {
  if (!import.meta.client || !('serviceWorker' in navigator))
    return

  // Defer registration until after load so it doesn't contend with hydration.
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js').catch(() => {
      // Registration failures are non-fatal; push simply won't be available.
    })
  })

  const router = useRouter()
  const userId = useUserId()
  const { reconcile } = usePushNotifications()

  navigator.serviceWorker.addEventListener('message', (event) => {
    const data = event.data as {
      type?: string
      href?: string
      oldEndpoint?: string | null
      subscription?: PushSubscriptionJSON | null
    } | null

    if (data?.type === 'navigate' && typeof data.href === 'string') {
      void router.push(data.href)
    }
    else if (data?.type === 'pushsubscriptionchange') {
      // The SW rotated this device's subscription - persist the new endpoint.
      void reconcile(data.subscription ?? null, data.oldEndpoint ?? null)
    }
  })

  // Reconcile on app open (and whenever the user becomes available): if the
  // browser rotated the subscription while the app was closed, this re-stores
  // the current endpoint. No-op when this device isn't subscribed.
  watch(userId, (id) => {
    if (id)
      void reconcile()
  }, { immediate: true })

  if ('setAppBadge' in navigator) {
    const { unreadCount } = useDataNotifications()
    watch(unreadCount, (count) => {
      if (count > 0)
        void navigator.setAppBadge?.(count).catch(() => {})
      else
        void navigator.clearAppBadge?.().catch(() => {})
    }, { immediate: true })
  }
})
