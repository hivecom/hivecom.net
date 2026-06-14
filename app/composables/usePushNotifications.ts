import type { Database } from '@/types/database.types'
import { pushToast } from '@dolanske/vui'
import { ref } from 'vue'
import { usePwa } from '@/composables/usePwa'

/**
 * Web Push subscription management for installed PWAs / supporting browsers.
 *
 * Handles the browser-side half of platform push notifications: feature
 * detection, permission, and (un)subscribing via the registered service
 * worker.
 *
 * Consent is per-device: a row in `user_push_subscriptions` exists only because
 * the user enabled push on that device, and unsubscribing removes it. The
 * `trigger-notification-push-send` edge function delivers to whatever rows
 * exist - there is no account-wide opt-in flag.
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

// Resolve the active service worker registration without hanging.
//
// On a freshly launched iOS PWA the page often isn't controlled by the SW yet,
// and WebKit's `navigator.serviceWorker.ready` can then never resolve. Awaiting
// it directly (as the subscribe/refresh flows did) left the UI spinner stuck
// forever. We register `/sw.js` (idempotent) and race `ready` against a timeout,
// falling back to whatever registration exists.
async function getRegistration(): Promise<ServiceWorkerRegistration | null> {
  try {
    await navigator.serviceWorker.register('/sw.js')
  }
  catch {
    // Registration failures are non-fatal; fall through to the lookups below.
  }

  const timeout = new Promise<null>((resolve) => {
    setTimeout(resolve, 5000, null)
  })
  const ready = await Promise.race([navigator.serviceWorker.ready, timeout])
  if (ready)
    return ready

  // `ready` hung (iOS first-launch): use whatever registration exists instead.
  return (await navigator.serviceWorker.getRegistration()) ?? null
}

// Reject after `ms` if the wrapped promise hasn't settled. `pushManager.subscribe`
// can hang forever when the browser can't reach its push service (Brave's
// disabled Google push, a firewall/VPN/region blocking FCM/APNs, etc.), which
// would otherwise leave the UI spinner stuck on.
async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('push-subscribe-timeout')), ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (err) => {
        clearTimeout(timer)
        reject(err)
      },
    )
  })
}

export function usePushNotifications() {
  const supabase = useSupabaseClient<Database>()
  const userId = useUserId()
  const config = useRuntimeConfig()
  const vapidPublicKey = config.public.vapidPublicKey

  // Standalone (installed app) detection lives in the shared PWA composable.
  const { isStandalone } = usePwa()

  const isSupported = ref(false)
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
  }

  // Reconcile local state with the actual push subscription registered in the SW.
  async function refresh() {
    detect()
    if (!isSupported.value)
      return
    const registration = await getRegistration()
    if (!registration)
      return
    const subscription = await registration.pushManager.getSubscription()
    isSubscribed.value = Boolean(subscription)
  }

  // Persist a subscription JSON to the DB (idempotent on endpoint).
  async function persist(json: PushSubscriptionJSON): Promise<boolean> {
    const p256dh = json.keys?.p256dh
    const auth = json.keys?.auth
    if (!userId.value || !json.endpoint || !p256dh || !auth)
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

    return !error
  }

  // Reconcile the DB with this device's live subscription. Handles browser
  // subscription rotation: ensures the current endpoint is stored, and removes
  // a rotated-away endpoint when we know it. Called on app open and in response
  // to the SW's `pushsubscriptionchange` message.
  async function reconcile(
    changed?: PushSubscriptionJSON | null,
    oldEndpoint?: string | null,
  ): Promise<void> {
    detect()
    if (!isSupported.value || !userId.value)
      return

    let json = changed ?? null
    if (!json) {
      const registration = await getRegistration()
      if (!registration)
        return
      const live = await registration.pushManager.getSubscription()
      // No live subscription means this device isn't opted in - nothing to do.
      if (!live)
        return
      json = live.toJSON()
    }

    const stored = await persist(json)
    if (!stored)
      return

    if (oldEndpoint && oldEndpoint !== json.endpoint) {
      await supabase
        .from('user_push_subscriptions')
        .delete()
        .eq('endpoint', oldEndpoint)
    }

    isSubscribed.value = true
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

      const registration = await getRegistration()
      if (!registration) {
        pushToast('Push notifications aren\'t available on this device right now.')
        return false
      }

      // Bound the subscribe call: it can hang indefinitely when the browser
      // can't reach its push service rather than rejecting.
      const subscription = await registration.pushManager.getSubscription()
        ?? await withTimeout(
          registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as BufferSource,
          }),
          10000,
        )

      const stored = await persist(subscription.toJSON())
      if (!stored)
        return false

      isSubscribed.value = true
      return true
    }
    catch (err) {
      pushToast('Couldn\'t enable push notifications', {
        description: err instanceof Error && err.message === 'push-subscribe-timeout'
          ? 'Couldn\'t reach the push service. Check that notifications aren\'t blocked by your browser, VPN, or network.'
          : 'Something went wrong. Please try again.',
      })
      return false
    }
    finally {
      loading.value = false
    }
  }

  async function unsubscribe(): Promise<void> {
    loading.value = true
    try {
      if (isSupported.value) {
        const registration = await getRegistration()
        const subscription = await registration?.pushManager.getSubscription()
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
    reconcile,
    subscribe,
    unsubscribe,
  }
}
