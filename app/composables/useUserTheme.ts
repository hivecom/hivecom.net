import type { Tables } from '@/types/database.overrides'
import type { Database } from '@/types/database.types'
import { setColorTheme } from '@dolanske/vui'
import { applyCustomCss, applyTheme, removeCustomCss } from '@/lib/theme'

interface VariantOption { label: string, value: string }

const variantOptions: VariantOption[] = [
  { label: 'Light', value: 'light' },
  { label: 'Dark', value: 'dark' },
]

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

  const { settings } = useDataUserSettings()
  const { themes } = useDataThemes()

  interface ThemeOption { label: string, value: string | null }

  const themeOptions = computed<ThemeOption[]>(() => [
    { label: 'Default', value: null },
    ...themes.value.map(t => ({ label: t.name, value: t.id })),
  ])

  const selectedTheme = computed({
    get(): ThemeOption[] {
      if (!activeTheme.value)
        return [{ label: 'Default', value: null }]
      return [{ label: activeTheme.value.name, value: activeTheme.value.id }]
    },
    set(options: ThemeOption[]) {
      if (options?.[0] !== undefined)
        // eslint-disable-next-line ts/no-floating-promises
        setActiveTheme(options[0].value)
    },
  })

  const selectedVariant = computed({
    get(): VariantOption[] {
      const option = variantOptions.find(o => o.value === settings.value.theme)
      return option ? [option] : []
    },
    set(options: VariantOption[]) {
      if (options?.[0]) {
        const value = options[0].value as Tables<'settings'>['data']['theme']
        settings.value.theme = value
        setColorTheme(value)
      }
    },
  })

  async function fetchAndApply(force = false): Promise<void> {
    const id = userId.value
    if (id == null) {
      applyTheme(null)
      removeCustomCss()
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
      removeCustomCss()
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
      removeCustomCss()
      activeTheme.value = null
      hasFetched.value = true
      return
    }

    // 3. Apply colors + scales
    activeTheme.value = theme
    applyTheme(theme)
    if (settings.value.allow_custom_css && theme.custom_css)
      applyCustomCss(theme.custom_css)
    else
      removeCustomCss()
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
      removeCustomCss()
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
    if (settings.value.allow_custom_css && theme.custom_css)
      applyCustomCss(theme.custom_css)
    else
      removeCustomCss()

    // Persist the selection so fetchAndApply picks it up on next load
    await supabase
      .from('profiles')
      .update({ theme_id: themeId })
      .eq('id', id)
  }

  // Re-fetch and apply when the user changes (login/logout).
  // The initial fetch on page load is handled by useInitialUserPreferences
  // inside Loading.vue, which blocks the fade-out until both settings and
  // the custom theme are ready.
  watch(userId, (newId, oldId) => {
    if (newId == null) {
      // Logged out - revert to defaults
      applyTheme(null)
      removeCustomCss()
      activeTheme.value = null
      hasFetched.value = false
      return
    }

    if (newId !== oldId) {
      hasFetched.value = false
      void fetchAndApply()
    }
  })

  watch(() => settings.value.allow_custom_css, (allowed) => {
    const css = activeTheme.value?.custom_css
    if (allowed && css !== undefined && css !== '')
      applyCustomCss(css)
    else
      removeCustomCss()
  })

  return {
    activeTheme,
    fetchAndApply,
    setActiveTheme,
    themeOptions,
    selectedTheme,
    variantOptions,
    selectedVariant,
  }
}
