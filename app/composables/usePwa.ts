import { readonly, ref } from 'vue'

/**
 * PWA install + display-mode detection.
 *
 * Tells the app whether it's running as an installed standalone app vs. a plain
 * browser tab, and (where the platform supports it) exposes a programmatic
 * install prompt.
 *
 * - `isStandalone`: running from the home screen / installed app. iOS exposes
 *   this via the non-standard `navigator.standalone`; everyone else via the
 *   `display-mode: standalone` media query (kept reactive to live changes).
 * - `canInstall`: a `beforeinstallprompt` event was captured, so `install()`
 *   can show the native prompt (Chromium browsers only).
 * - `isIOS`: iOS Safari has no programmatic install, so callers fall back to
 *   showing "Add to Home Screen" instructions.
 *
 * State is module-level so the one-shot `beforeinstallprompt` event is captured
 * regardless of which component mounts first.
 */

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[]
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed', platform: string }>
  prompt: () => Promise<void>
}

const isStandalone = ref(false)
const canInstall = ref(false)
const isIOS = ref(false)

let deferredPrompt: BeforeInstallPromptEvent | null = null
let initialized = false

function computeStandalone(): boolean {
  if (!import.meta.client)
    return false
  // `standalone` is the non-standard iOS Safari flag for home-screen apps.
  const nav = window.navigator as Navigator & { standalone?: boolean }
  return window.matchMedia('(display-mode: standalone)').matches || nav.standalone === true
}

function init(): void {
  if (initialized || !import.meta.client)
    return
  initialized = true

  isIOS.value = /iphone|ipad|ipod/i.test(window.navigator.userAgent)
  isStandalone.value = computeStandalone()

  // Display mode can flip without a reload (e.g. launched into the installed
  // app), so keep the flag live.
  window.matchMedia('(display-mode: standalone)').addEventListener('change', () => {
    isStandalone.value = computeStandalone()
  })

  // Chromium fires this once when the app is installable. Capture it so a UI
  // gesture can trigger the prompt later.
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault()
    deferredPrompt = event as BeforeInstallPromptEvent
    canInstall.value = true
  })

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null
    canInstall.value = false
    isStandalone.value = true
  })
}

export function usePwa() {
  init()

  // Show the native install prompt. Returns 'unavailable' when no deferred
  // prompt was captured (iOS, already installed, or unsupported browser).
  async function install(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
    if (!deferredPrompt)
      return 'unavailable'
    await deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    deferredPrompt = null
    canInstall.value = false
    return outcome
  }

  return {
    isStandalone: readonly(isStandalone),
    canInstall: readonly(canInstall),
    isIOS: readonly(isIOS),
    install,
  }
}
