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
 * Safe to call when no user is signed in - both inner composables guard
 * against a null user and return immediately.
 */
export function useInitialUserPreferences() {
  const userId = useUserId()
  const { fetchSettings, settings } = useDataUserSettings()
  const { fetchAndApply } = useUserTheme()

  async function applyUserPreferences(): Promise<void> {
    // Nothing to do for guests
    if (userId.value == null)
      return

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
