/**
 * Loading.vue resolves this once `applyUserPreferences()` has awaited
 * getSession(). Pages that need a session can `await waitForSessionReady()`
 * instead of racing the loading screen.
 */

let _resolve: (() => void) | null = null
let _resolved = false

const _promise: Promise<void> = new Promise<void>((resolve) => {
  _resolve = resolve
})

export function useSessionReady() {
  function resolveSessionReady() {
    if (!_resolved) {
      _resolved = true
      _resolve?.()
    }
  }

  async function waitForSessionReady(): Promise<void> {
    return _promise
  }

  function isSessionReady(): boolean {
    return _resolved
  }

  return { resolveSessionReady, waitForSessionReady, isSessionReady }
}
