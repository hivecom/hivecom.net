import type { Database } from '@/types/database.types'
import { ref } from 'vue'
import { useDataUserSettings } from '@/composables/useDataUserSettings'

/**
 * Web Push subscription management for installed PWAs / supporting browsers.
 *
 * Handles the browser-side half of platform push notifications: feature
 * detection, permission, and (un)subscribing via the registered service
 * worker. Subscriptions are persisted to `user_push_subscriptions`; the
 * `push-send` edge function reads them to deliver pushes.
 *
 * The opt-in preference itself lives in user settings
 * (`app_push_notifications`) so the edge function can honour it server-side.
 */

// Convert the URL-safe base64 VAPID application server key into the byte array
// the Push API expects.
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const output = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++)
    output[i] = raw.charCodeAt(i)
  return output
}

export function usePushNotifications() {
  const supabase = useSupabaseClient<Database>()
  const userId = useUserId()
  const { settings } = useDataUserSettings()
  const config = useRuntimeConfig()
  const vapidPublicKey = config.public.vapidPublicKey as string

  const isSupported = ref(false)
  const isStandalone = ref(false)
  const permission = ref<NotificationPermission>('default')
  const isSubscribed = ref(false)
  const loading = ref(false)

  function detect() {
    isSupported.value = import.meta.client
      && 'serviceWorker' in navigator
      && 'PushManager' in window
      && 'Notification' in window

    if (isSupported.value)
      permission.value = Notification.permission

    if (import.meta.client) {
      // `standalone` is the non-standard iOS Safari flag for home-screen apps.
      const nav = window.navigator as Navigator & { standalone?: boolean }
      isStandalone.value = window.matchMedia('(display-mode: standalone)').matches
        || nav.standalone === true
    }
  }

  // Reconcile local state with the actual push subscription registered in the SW.
  async function refresh() {
    detect()
    if (!isSupported.value)
      return
    const registration = await navigator.serviceWorker.ready
    const subscription = await registration.pushManager.getSubscription()
    isSubscribed.value = Boolean(subscription)
  }

  async function subscribe(): Promise<boolean> {
    if (!isSupported.value || !vapidPublicKey || !userId.value)
      return false

    loading.value = true
    try {
      const result = await Notification.requestPermission()
      permission.value = result
      if (result !== 'granted')
        return false

      const registration = await navigator.serviceWorker.ready
      const subscription = await registration.pushManager.getSubscription()
        ?? await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as BufferSource,
        })

      const json = subscription.toJSON()
      const p256dh = json.keys?.p256dh
      const auth = json.keys?.auth
      if (!json.endpoint || !p256dh || !auth)
        return false

      const { error } = await supabase
        .from('user_push_subscriptions')
        .upsert({
          user_id: userId.value,
          endpoint: json.endpoint,
          p256dh,
          auth,
          user_agent: navigator.userAgent,
        }, { onConflict: 'endpoint' })

      if (error)
        return false

      isSubscribed.value = true
      settings.value.app_push_notifications = true
      return true
    }
    finally {
      loading.value = false
    }
  }

  async function unsubscribe(): Promise<void> {
    loading.value = true
    try {
      if (isSupported.value) {
        const registration = await navigator.serviceWorker.ready
        const subscription = await registration.pushManager.getSubscription()
        if (subscription) {
          const { endpoint } = subscription
          await subscription.unsubscribe()
          await supabase
            .from('user_push_subscriptions')
            .delete()
            .eq('endpoint', endpoint)
        }
      }
      isSubscribed.value = false
      settings.value.app_push_notifications = false
    }
    finally {
      loading.value = false
    }
  }

  return {
    isSupported,
    isStandalone,
    permission,
    isSubscribed,
    loading,
    refresh,
    subscribe,
    unsubscribe,
  }
}
