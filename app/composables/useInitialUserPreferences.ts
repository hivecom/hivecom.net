import { setColorTheme } from '@dolanske/vui'
import { useDataUserSettings } from './useDataUserSettings'
import { useUserTheme } from './useUserTheme'

/**
 * Fetches and applies the authenticated user's preferences (light/dark theme
 * toggle and custom color theme) in one blocking call.
 *
 * Designed to be awaited inside Loading.vue before the fade-out begins, so
 * that the correct theme is in place before the loading screen lifts.
 *
 * Waits for the Supabase auth session to resolve before deciding whether the
 * user is signed in, so that a cached guest theme is never incorrectly applied
 * on a reload where the user is actually authenticated.
 */
export function useInitialUserPreferences() {
  const supabase = useSupabaseClient()
  const userId = useUserId()
  const { fetchSettings, settings } = useDataUserSettings()
  const { fetchAndApply } = useUserTheme()

  async function applyUserPreferences(): Promise<void> {
    // Wait for auth session to resolve before branching on userId.
    // useSupabaseUser starts as null even for logged-in users until the
    // session is restored asynchronously - checking userId.value before this
    // completes would incorrectly treat an authenticated user as a guest.
    if (import.meta.client) {
      await supabase.auth.getSession()
    }

    // For guests, still attempt to restore a cached theme from localStorage.
    if (userId.value == null) {
      await fetchAndApply()
      return
    }

    // Run both fetches in parallel - settings (light/dark) and custom theme
    // (palette overrides). Neither depends on the other.
    await Promise.all([
      fetchSettings(),
      fetchAndApply(),
    ])

    // Apply the light/dark preference from settings now that it has been
    // populated. useUserTheme handles the palette side itself via applyTheme.
    setColorTheme(settings.value.theme ?? 'dark')
  }

  return { applyUserPreferences }
}
