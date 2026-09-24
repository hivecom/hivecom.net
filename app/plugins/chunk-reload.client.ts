import { pushToast } from '@dolanske/vui'
import { reloadWithCacheBust, stripCacheBustParam } from '@/lib/utils/common'

// Stops a genuinely broken deploy from looping on reloads. Cleared on a good boot.
const RELOAD_GUARD_KEY = 'chunk-reload-attempted'

const VERSION_CHECK_THROTTLE_MS = 60_000

export default defineNuxtPlugin((nuxtApp) => {
  const config = useRuntimeConfig()
  const baseURL = config.app.baseURL || '/'
  const currentBuildId = String(config.app.buildId ?? '')

  // --- 1. Stale chunk recovery -------------------------------------------
  // Each deploy deletes the old hashed `_nuxt/` chunks, so stale cached HTML 404s
  // on import and never hydrates. One cache-busting reload pulls fresh HTML.
  window.addEventListener('vite:preloadError', (event) => {
    event.preventDefault()

    let alreadyAttempted = false
    try {
      alreadyAttempted = sessionStorage.getItem(RELOAD_GUARD_KEY) === '1'
    }
    catch {
      // sessionStorage can throw in private mode. Reload anyway, a frozen app is worse.
    }

    if (alreadyAttempted)
      return

    try {
      sessionStorage.setItem(RELOAD_GUARD_KEY, '1')
    }
    catch {
      // The reload is still worth one attempt
    }

    reloadWithCacheBust()
  })

  // Clear the guard so the next deploy in this session can recover again
  nuxtApp.hook('app:mounted', () => {
    try {
      sessionStorage.removeItem(RELOAD_GUARD_KEY)
    }
    catch {
      // Ignore.
    }

    stripCacheBustParam()
  })

  // --- 2. Outdated build prompt ------------------------------------------
  let lastCheck = 0
  let promptShown = false

  async function checkForNewBuild() {
    if (promptShown)
      return

    const now = Date.now()
    if (now - lastCheck < VERSION_CHECK_THROTTLE_MS)
      return

    lastCheck = now

    try {
      const url = `${baseURL.replace(/\/$/, '')}/_nuxt/builds/latest.json?_=${now}`
      const res = await fetch(url, { cache: 'no-store' })
      if (!res.ok)
        return

      const meta = await res.json() as { id?: string }
      if (!meta?.id || meta.id === currentBuildId)
        return

      promptShown = true
      pushToast('A new version is available', {
        persist: true,
        description: 'Reload to get the latest update.',
        action: {
          label: 'Reload',
          handler: () => reloadWithCacheBust(),
        },
      })
    }
    catch {
      // Best-effort. Offline, dev server and a missing manifest all land here.
    }
  }

  function onVisible() {
    if (document.visibilityState === 'visible')
      void checkForNewBuild()
  }

  document.addEventListener('visibilitychange', onVisible)
  window.addEventListener('focus', () => void checkForNewBuild())
})
