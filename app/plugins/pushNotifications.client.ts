import { watch } from 'vue'
import { useDataNotifications } from '@/composables/useDataNotifications'
import { usePushNotifications } from '@/composables/usePushNotifications'

export default defineNuxtPlugin(() => {
  if (!import.meta.client || !('serviceWorker' in navigator))
    return

  // After load so it doesn't contend with hydration
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js').catch(() => {
      // Non-fatal, push just won't be available
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

    // The SW posts `navigate` when a clicked notification's tab can't navigate itself
    if (data?.type === 'navigate' && typeof data.href === 'string') {
      void router.push(data.href)
    }
    else if (data?.type === 'pushsubscriptionchange') {
      // The SW rotated this device's subscription
      void reconcile(data.subscription ?? null, data.oldEndpoint ?? null)
    }
  })

  // Picks up a subscription the browser rotated while the app was closed
  watch(userId, (id) => {
    if (id)
      void reconcile()
  }, { immediate: true })

  // The SW sets the badge for pushes that arrive while the app is closed
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
