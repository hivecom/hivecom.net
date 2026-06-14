import { ref, watch } from 'vue'
import { useIrcChat } from '@/composables/useIrcChat'

/**
 * Web Push for the chat server (Ergo) via the draft/webpush (soju.im/webpush)
 * IRCv3 extension.
 *
 * Unlike `usePushNotifications` (platform notifications, signed with the app's
 * own VAPID key and delivered by a Supabase edge function), here Ergo itself is
 * the application server: it advertises its VAPID public key in the `VAPID`
 * ISUPPORT token, the client subscribes the browser to that key, and the
 * subscription is registered with Ergo over the IRC connection via
 * `WEBPUSH REGISTER`. Ergo then signs and sends push messages directly.
 *
 * This needs its own service worker registration (`/ergo-sw.js`, scope
 * `/chat-push/`) because a registration may only hold one subscription bound to
 * one applicationServerKey, and `/sw.js` already uses the app's key.
 *
 * Consent is per-device: a browser subscription exists only because the user
 * enabled chat push on this device. We persist that intent so it can be
 * re-registered automatically on each reconnect (the endpoint is stable, and
 * `WEBPUSH REGISTER` is idempotent - the server replaces any prior subscription
 * with the same endpoint).
 */

const ERGO_SW_URL = '/ergo-sw.js'
const ERGO_SW_SCOPE = '/chat-push/'
const ENABLED_KEY = 'hivecom.chat.webpush.enabled'

const isSupported = ref(false)
const isSubscribed = ref(false)
const loading = ref(false)
// Endpoint we've already sent WEBPUSH REGISTER for on the current connection, to
// avoid re-registering on every reactive tick. Cleared when the link drops.
const registeredEndpoint = ref<string | null>(null)

let _orchestratorRegistered = false

// Convert the URL-safe base64 VAPID key into the byte array the Push API expects.
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  // Strip any whitespace/newlines first. Safari's `atob()` is stricter than
  // Chromium's/Firefox's and throws `InvalidCharacterError` on stray whitespace.
  const sanitized = base64String.trim().replace(/\s+/g, '')
  const padding = '='.repeat((4 - (sanitized.length % 4)) % 4)
  const base64 = (sanitized + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const output = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++)
    output[i] = raw.charCodeAt(i)
  return output
}

function wantsPush(): boolean {
  return import.meta.client && localStorage.getItem(ENABLED_KEY) === 'true'
}

// Register (or fetch) the dedicated chat-push service worker.
async function ergoRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!isSupported.value)
    return null
  // getRegistration() returns the longest-scope match, which before our worker
  // exists is the root `/sw.js` (scope `/`). Only reuse a registration that is
  // actually our `/chat-push/` worker; otherwise register it.
  const existing = await navigator.serviceWorker.getRegistration(ERGO_SW_SCOPE)
  if (existing && new URL(existing.scope).pathname === ERGO_SW_SCOPE)
    return existing
  try {
    return await navigator.serviceWorker.register(ERGO_SW_URL, { scope: ERGO_SW_SCOPE })
  }
  catch {
    return null
  }
}

export function useErgoPush() {
  // Access via the object rather than destructuring: the huge useIrcChat()
  // return widens destructured refs to `any`, but property access stays typed.
  const irc = useIrcChat()
  const send = irc.send
  const isConnected = irc.isConnected
  const vapidKey = irc.vapidKey
  // Ergo only accepts WEBPUSH REGISTER on a connection logged into an account
  // (it rejects guests with "You must be logged in to receive push messages").
  const account = irc.account

  function detect() {
    isSupported.value = import.meta.client
      && 'serviceWorker' in navigator
      && 'PushManager' in window
      && 'Notification' in window
  }

  // Format the subscription keys in the message-tag form the spec mandates and
  // register the subscription with Ergo over IRC.
  function sendRegister(subscription: PushSubscription) {
    const json = subscription.toJSON()
    const p256dh = json.keys?.p256dh
    const auth = json.keys?.auth
    if (!json.endpoint || !p256dh || !auth)
      return
    send(`WEBPUSH REGISTER ${json.endpoint} p256dh=${p256dh};auth=${auth}`)
    registeredEndpoint.value = json.endpoint
  }

  // Reconcile local state with the live subscription on the chat-push worker.
  async function refresh() {
    detect()
    if (!isSupported.value)
      return
    const registration = await ergoRegistration()
    const subscription = await registration?.pushManager.getSubscription()
    isSubscribed.value = Boolean(subscription)
  }

  async function subscribe(): Promise<boolean> {
    detect()
    // The key only arrives after connecting (005 ISUPPORT), and Ergo requires an
    // account, so a subscription can't be created until we're connected to a
    // webpush-capable server while logged in.
    if (!isSupported.value || !vapidKey.value || !account.value)
      return false

    loading.value = true
    try {
      const result = await Notification.requestPermission()
      if (result !== 'granted')
        return false

      const registration = await ergoRegistration()
      if (!registration)
        return false

      const subscription = await registration.pushManager.getSubscription()
        ?? await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidKey.value) as BufferSource,
        })

      localStorage.setItem(ENABLED_KEY, 'true')
      if (isConnected.value && account.value)
        sendRegister(subscription)
      isSubscribed.value = true
      return true
    }
    finally {
      loading.value = false
    }
  }

  async function unsubscribe(): Promise<void> {
    loading.value = true
    try {
      localStorage.removeItem(ENABLED_KEY)
      registeredEndpoint.value = null
      if (isSupported.value) {
        const registration = await ergoRegistration()
        const subscription = await registration?.pushManager.getSubscription()
        if (subscription) {
          // Tell Ergo to drop it first (needs the live IRC connection), then
          // tear down the browser subscription.
          if (isConnected.value)
            send(`WEBPUSH UNREGISTER ${subscription.endpoint}`)
          await subscription.unsubscribe()
        }
      }
      isSubscribed.value = false
    }
    finally {
      loading.value = false
    }
  }

  // Register the cross-cutting orchestration once: re-send WEBPUSH REGISTER
  // whenever we (re)connect to a webpush-capable server while the user has chat
  // push enabled, and react to the worker rotating the subscription.
  if (import.meta.client && !_orchestratorRegistered) {
    _orchestratorRegistered = true
    detect()

    watch([isConnected, vapidKey, account], async ([connected, key, acct]) => {
      if (!connected) {
        registeredEndpoint.value = null
        return
      }
      // Need the server key and a logged-in account before Ergo will accept the
      // subscription. Both arrive shortly after connect (SASL + 005 ISUPPORT),
      // and watching `account` covers a guest connection that later authenticates.
      if (!key || !acct || !wantsPush())
        return
      const registration = await ergoRegistration()
      const subscription = await registration?.pushManager.getSubscription()
      if (subscription && subscription.endpoint !== registeredEndpoint.value)
        sendRegister(subscription)
    }, { immediate: true })

    navigator.serviceWorker.addEventListener('message', (event) => {
      const data = event.data as {
        type?: string
        oldEndpoint?: string | null
        subscription?: PushSubscriptionJSON | null
      } | null
      if (data?.type !== 'ergo-pushsubscriptionchange')
        return
      // The worker rotated the subscription. Drop the old endpoint and register
      // the new one over IRC (best-effort; only possible while connected).
      if (isConnected.value && account.value) {
        if (data.oldEndpoint)
          send(`WEBPUSH UNREGISTER ${data.oldEndpoint}`)
        const next = data.subscription
        if (next?.endpoint && next.keys?.p256dh && next.keys?.auth) {
          send(`WEBPUSH REGISTER ${next.endpoint} p256dh=${next.keys.p256dh};auth=${next.keys.auth}`)
          registeredEndpoint.value = next.endpoint
        }
      }
    })
  }

  return {
    isSupported,
    isSubscribed,
    loading,
    refresh,
    subscribe,
    unsubscribe,
  }
}
