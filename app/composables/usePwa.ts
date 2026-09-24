import { readonly, ref } from 'vue'

/**
 * State is module-level so the one-shot `beforeinstallprompt` is captured
 * whichever component mounts first. iOS Safari has no programmatic install, so
 * callers show "Add to Home Screen" instructions when `isIOS` is set.
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
