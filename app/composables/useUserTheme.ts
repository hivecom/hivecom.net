import type { Tables } from '@/types/database.overrides'
import type { Database } from '@/types/database.types'
import { setColorTheme } from '@dolanske/vui'
import { useStyleTag } from '@vueuse/core'
import { applyTheme, sanitizeCustomCss } from '@/lib/theme'

interface VariantOption { label: string, value: string }

const variantOptions: VariantOption[] = [
  { label: 'Light', value: 'light' },
  { label: 'Dark', value: 'dark' },
]

const HAS_URL_REGEX = /url\s*\(/i

/**
 * Loads and applies the authenticated user's custom theme (if any) from their
 * profile's `theme_id` foreign key.
 *
 * Designed to be called once in a root layout/component. Uses `useState` so
 * the active theme is shared across all component instances.
 *
 * Custom CSS is managed via a `useStyleTag`-backed shared ref. Setting the ref
 * to a non-empty string injects/updates the style tag; setting it to '' clears
 * the content without removing the element (an empty style tag has no effect).
 * `load()` is called lazily on the first non-empty apply; it is intentionally
 * never called with `unload()` to avoid multi-instance watcher staleness issues.
 */
export function useUserTheme() {
  const supabase = useSupabaseClient<Database>()
  const userId = useUserId()

  const activeTheme = useState<Tables<'themes'> | null>('user-active-theme', () => null)
  const hasFetched = useState<boolean>('user-theme-fetched', () => false)

  // Non-null when a theme with custom CSS is awaiting user confirmation before being applied.
  const pendingTheme = useState<{ theme: Tables<'themes'>, hasUrl: boolean } | null>('theme-pending-confirmation', () => null)

  const { settings } = useDataUserSettings()
  const { themes } = useDataThemes()

  // Shared CSS content ref - all useUserTheme() instances share the same ref via
  // useState so every useStyleTag watcher always writes the same value to the element.
  const customCssContent = useState<string>('theme-custom-css', () => '')

  const { load: loadStyleTag } = useStyleTag(customCssContent, {
    id: 'hivecom-theme-custom-css',
    immediate: false,
    manual: true,
  })

  /**
   * Sanitize `raw` and update the shared style tag content.
   * Calls `load()` lazily on the first non-empty CSS so the element is only
   * created when actually needed. Never calls `unload()` - setting the content
   * to '' is equivalent (empty style tag has no cascade effect).
   */
  function applyCustomCss(raw: string | null | undefined): void {
    const sanitized = sanitizeCustomCss(raw)
    customCssContent.value = sanitized
    if (sanitized)
      loadStyleTag()
  }

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
      applyCustomCss(null)
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
      applyCustomCss(null)
      activeTheme.value = null
      hasFetched.value = true
      return
    }

    // 2. Fetch the full theme row
    const { data: themeData, error: themeError } = await supabase
      .from('themes')
      .select('*')
      .eq('id', profile.theme_id)
      .single()

    if (themeError || themeData == null) {
      applyTheme(null)
      applyCustomCss(null)
      activeTheme.value = null
      hasFetched.value = true
      return
    }

    const theme = themeData as Tables<'themes'>

    // 3. Apply colors + scales
    activeTheme.value = theme
    applyTheme(theme)
    if (settings.value.allow_custom_css)
      applyCustomCss(theme.custom_css)
    else
      applyCustomCss(null)
    hasFetched.value = true
  }

  /**
   * Applies a fully-fetched theme to the DOM and persists it to the user's profile.
   */
  async function applyAndPersistTheme(theme: Tables<'themes'>): Promise<void> {
    const id = userId.value
    if (id == null)
      return

    activeTheme.value = theme
    applyTheme(theme)
    if (settings.value.allow_custom_css)
      applyCustomCss(theme.custom_css)
    else
      applyCustomCss(null)

    await supabase
      .from('profiles')
      .update({ theme_id: theme.id })
      .eq('id', id)
  }

  /**
   * Immediately switch to a theme by ID, or pass `null` to revert to defaults.
   * Fetches the full theme row, applies it to the DOM, updates `activeTheme`,
   * and persists the selection to the user's profile so it survives page reloads.
   *
   * If the theme contains custom CSS, the switch is held in `pendingTheme` and
   * requires explicit user confirmation via `confirmPendingTheme()` before it is
   * applied. Check `pendingTheme` to know when to show the warning modal.
   */
  async function setActiveTheme(themeId: string | null): Promise<void> {
    const id = userId.value
    if (id == null)
      return

    if (themeId == null) {
      applyTheme(null)
      applyCustomCss(null)
      activeTheme.value = null

      // Clear the persisted selection from the profile
      await supabase
        .from('profiles')
        .update({ theme_id: null })
        .eq('id', id)

      return
    }

    const { data, error } = await supabase
      .from('themes')
      .select('*')
      .eq('id', themeId)
      .single()

    if (error || data == null)
      return

    const theme = data as Tables<'themes'>

    // If the theme ships custom CSS, hold it for user confirmation instead of
    // applying immediately. The caller should react to `pendingTheme` and show
    // a warning modal.
    if (theme.custom_css && theme.custom_css.trim().length > 0) {
      const hasUrl = HAS_URL_REGEX.test(theme.custom_css)
      pendingTheme.value = { theme, hasUrl }
      return
    }

    await applyAndPersistTheme(theme)
  }

  /**
   * Apply and persist the theme that is currently awaiting confirmation.
   * Call this when the user accepts the CSS warning modal.
   */
  async function confirmPendingTheme(): Promise<void> {
    if (!pendingTheme.value)
      return
    const { theme } = pendingTheme.value
    pendingTheme.value = null
    await applyAndPersistTheme(theme)
  }

  // Re-fetch and apply when the user changes (login/logout).
  // The initial fetch on page load is handled by useInitialUserPreferences
  // inside Loading.vue, which blocks the fade-out until both settings and
  // the custom theme are ready.
  watch(userId, (newId, oldId) => {
    if (newId == null) {
      // Logged out - revert to defaults
      applyTheme(null)
      applyCustomCss(null)
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
    applyCustomCss(allowed ? activeTheme.value?.custom_css : null)
  })

  /**
   * Re-apply the active theme's custom CSS respecting the allow_custom_css setting.
   * Call this when restoring state after closing the theme editor.
   */
  function reapplyCustomCss(): void {
    applyCustomCss(settings.value.allow_custom_css ? activeTheme.value?.custom_css : null)
  }

  return {
    activeTheme,
    pendingTheme,
    fetchAndApply,
    setActiveTheme,
    confirmPendingTheme,
    applyCustomCss,
    reapplyCustomCss,
    themeOptions,
    selectedTheme,
    variantOptions,
    selectedVariant,
  }
}
