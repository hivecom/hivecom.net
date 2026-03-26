import type { Tables } from '@/types/database.overrides'
import type { Database } from '@/types/database.types'
import { applyTheme } from '@/lib/theme'

/**
 * Loads and applies the authenticated user's custom theme (if any) from their
 * profile's `theme_id` foreign key.
 *
 * Designed to be called once in a root layout/component. Uses `useState` so
 * the active theme is shared across all component instances.
 */
export function useUserTheme() {
  const supabase = useSupabaseClient<Database>()
  const userId = useUserId()

  const activeTheme = useState<Tables<'themes'> | null>('user-active-theme', () => null)
  const hasFetched = useState<boolean>('user-theme-fetched', () => false)

  async function fetchAndApply(force = false): Promise<void> {
    const id = userId.value
    if (id == null) {
      applyTheme(null)
      activeTheme.value = null
      return
    }

    if (hasFetched.value && !force)
      return

    // 1. Read the user's theme_id from their profile
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('theme_id')
      .eq('id', id)
      .single()

    if (profileError || profile?.theme_id == null) {
      // No custom theme set - ensure defaults are active
      applyTheme(null)
      activeTheme.value = null
      hasFetched.value = true
      return
    }

    // 2. Fetch the full theme row
    const { data: theme, error: themeError } = await supabase
      .from('themes')
      .select('*')
      .eq('id', profile.theme_id)
      .single()

    if (themeError || theme == null) {
      applyTheme(null)
      activeTheme.value = null
      hasFetched.value = true
      return
    }

    // 3. Apply colors + scales
    activeTheme.value = theme
    applyTheme(theme)
    hasFetched.value = true
  }

  /**
   * Immediately switch to a theme by ID, or pass `null` to revert to defaults.
   * Fetches the full theme row, applies it to the DOM, updates `activeTheme`,
   * and persists the selection to the user's profile so it survives page reloads.
   */
  async function setActiveTheme(themeId: string | null): Promise<void> {
    const id = userId.value
    if (id == null)
      return

    if (themeId == null) {
      applyTheme(null)
      activeTheme.value = null

      // Clear the persisted selection from the profile
      await supabase
        .from('profiles')
        .update({ theme_id: null })
        .eq('id', id)

      return
    }

    const { data: theme, error } = await supabase
      .from('themes')
      .select('*')
      .eq('id', themeId)
      .single()

    if (error || theme == null)
      return

    activeTheme.value = theme
    applyTheme(theme)

    // Persist the selection so fetchAndApply picks it up on next load
    await supabase
      .from('profiles')
      .update({ theme_id: themeId })
      .eq('id', id)
  }

  // Always attempt to fetch and apply on client mount - SSR cannot apply DOM
  // styles, so we must run this unconditionally on the client side regardless
  // of hasFetched to ensure the theme is visible after a page refresh.
  onMounted(() => {
    if (userId.value != null)
      void fetchAndApply()
  })

  watch(userId, (newId, oldId) => {
    if (newId == null) {
      // Logged out - revert to defaults
      applyTheme(null)
      activeTheme.value = null
      hasFetched.value = false
      return
    }

    if (newId !== oldId) {
      hasFetched.value = false
      void fetchAndApply()
    }
  })

  return {
    activeTheme,
    fetchAndApply,
    setActiveTheme,
  }
}
