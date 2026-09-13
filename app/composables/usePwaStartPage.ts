import { readonly, ref } from 'vue'

/**
 * Per-device launch destination for the installed app.
 *
 * The manifest's `start_url` is a single static value shared by every install,
 * so a launch always hands us `/`. This picks where the app goes from there.
 *
 * Kept in localStorage rather than `user_settings` on purpose. The useful
 * choice differs per install (chat on the phone, home on the desktop), and on
 * iOS the home-screen app has its own storage container, so a synced value
 * could never be set from Safari in the first place.
 */

export const PWA_START_PAGE_KEY = 'hivecom.pwa.start-page'

export interface PwaStartPageDestination {
  label: string
  path: string
  /** Route sits behind the auth guard, so we skip it when signed out. */
  authRequired?: boolean
}

/**
 * Allowlist of launch destinations. A stored value that isn't in here is
 * ignored, so a removed route can never strand someone on a dead launch.
 */
export const PWA_START_PAGE_DESTINATIONS: PwaStartPageDestination[] = [
  { label: 'Home', path: '/' },
  { label: 'Chat', path: '/chat' },
  { label: 'Forum', path: '/forum' },
  { label: 'Events', path: '/events' },
  { label: 'Games', path: '/community/games' },
  { label: 'Profile', path: '/profile', authRequired: true },
]

const startPage = ref('/')
let hydrated = false

function hydrate(): void {
  if (hydrated || !import.meta.client)
    return
  hydrated = true

  const stored = localStorage.getItem(PWA_START_PAGE_KEY)
  if (stored && PWA_START_PAGE_DESTINATIONS.some(d => d.path === stored))
    startPage.value = stored
}

export function usePwaStartPage() {
  hydrate()

  function setStartPage(path: string): void {
    if (!PWA_START_PAGE_DESTINATIONS.some(d => d.path === path))
      return

    startPage.value = path
    if (import.meta.client)
      localStorage.setItem(PWA_START_PAGE_KEY, path)
  }

  return {
    startPage: readonly(startPage),
    setStartPage,
    destinations: PWA_START_PAGE_DESTINATIONS,
  }
}
