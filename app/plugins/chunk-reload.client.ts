import { pushToast } from '@dolanske/vui'
import { reloadWithCacheBust } from '@/lib/utils/common'

// sessionStorage guard key. Set right before a stale-chunk recovery reload so a
// second `vite:preloadError` (on a genuinely broken deploy) doesn't trigger an
// infinite reload loop. Cleared once the app boots successfully.
const RELOAD_GUARD_KEY = 'chunk-reload-attempted'

// Minimum gap between build-version checks so focus/visibility churn can't spam
// network requests.
const VERSION_CHECK_THROTTLE_MS = 60_000

export default defineNuxtPlugin((nuxtApp) => {
  const config = useRuntimeConfig()
  const baseURL = config.app.baseURL || '/'
  const currentBuildId = String(config.app.buildId ?? '')

  // --- 1. Stale chunk recovery -------------------------------------------
  // Every deploy replaces `_nuxt/` with new content-hashed filenames and
  // deletes the old ones. A returning user on stale cached HTML requests a
  // now-deleted chunk -> 404 -> Vue never hydrates -> frozen splash. Vite
  // fires `vite:preloadError` when a dynamic import fails; intercept it and
  // do a single cache-busting reload to pull fresh HTML.
  window.addEventListener('vite:preloadError', (event) => {
    event.preventDefault()

    let alreadyAttempted = false
    try {
      alreadyAttempted = sessionStorage.getItem(RELOAD_GUARD_KEY) === '1'
    }
    catch {
      // sessionStorage can throw (private mode, blocked storage); fall through
      // and attempt the reload anyway since a frozen app is worse.
    }

    if (alreadyAttempted)
      return

    try {
      sessionStorage.setItem(RELOAD_GUARD_KEY, '1')
    }
    catch {
      // Ignore - the reload below is still worth attempting once.
    }

    reloadWithCacheBust()
  })

  // Once the app has actually mounted, the chunks loaded fine, so clear the
  // guard. This lets a future genuine stale-chunk event (after the next
  // deploy, same session) recover again instead of being suppressed.
  nuxtApp.hook('app:mounted', () => {
    try {
      sessionStorage.removeItem(RELOAD_GUARD_KEY)
    }
    catch {
      // Ignore.
    }
  })

  // --- 2. Outdated build prompt ------------------------------------------
  // When the user returns to a backgrounded tab, check whether a newer build
  // has been deployed. If so, surface a NON-forced toast offering a reload so
  // they can pick up the new version before they hit a stale-chunk 404.
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
      // Network error, offline, dev server, or 404 (manifest absent): fail
      // silently. This check is best-effort and must never surface noise.
    }
  }

  function onVisible() {
    if (document.visibilityState === 'visible')
      void checkForNewBuild()
  }

  document.addEventListener('visibilitychange', onVisible)
  window.addEventListener('focus', () => void checkForNewBuild())
})
