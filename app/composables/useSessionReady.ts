/**
 * Shared session-ready signal.
 *
 * Loading.vue calls `resolveSessionReady()` after `applyUserPreferences()` completes
 * (which internally awaits `supabase.auth.getSession()`). Any page that needs a valid
 * session before doing work can `await waitForSessionReady()` instead of racing against
 * the loading screen's own async initialisation.
 */

let _resolve: (() => void) | null = null

const _promise: Promise<void> = new Promise<void>((resolve) => {
  _resolve = resolve
})

export function useSessionReady() {
  function resolveSessionReady() {
    _resolve?.()
  }

  async function waitForSessionReady(): Promise<void> {
    return _promise
  }

  return { resolveSessionReady, waitForSessionReady }
}
