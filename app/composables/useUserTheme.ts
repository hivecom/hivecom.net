import type { Tables } from '@/types/database.overrides'
import type { Database } from '@/types/database.types'
import { pushToast, setColorTheme } from '@dolanske/vui'
import { useStyleTag } from '@vueuse/core'
import { applyTheme, sanitizeCustomCss } from '@/lib/theme'
import { useThemeTransition } from './useThemeTransition'

export type ThemeVariant = 'light' | 'dark'

interface VariantOption { label: string, value: ThemeVariant }

const variantOptions: VariantOption[] = [
  { label: 'Light', value: 'light' },
  { label: 'Dark', value: 'dark' },
]

const HAS_URL_REGEX = /url\s*\(/i

const THEME_CACHE_KEY = 'hivecom-theme-cache'

const COLOR_SCALE_KEYS: Array<keyof Tables<'themes'>> = [
  'dark_accent',
  'dark_bg',
  'dark_bg_accent_lowered',
  'dark_bg_accent_raised',
  'dark_bg_blue_lowered',
  'dark_bg_blue_raised',
  'dark_bg_green_lowered',
  'dark_bg_green_raised',
  'dark_bg_lowered',
  'dark_bg_medium',
  'dark_bg_raised',
  'dark_bg_red_lowered',
  'dark_bg_red_raised',
  'dark_bg_yellow_lowered',
  'dark_bg_yellow_raised',
  'dark_border',
  'dark_border_strong',
  'dark_border_weak',
  'dark_button_fill',
  'dark_button_fill_hover',
  'dark_button_gray',
  'dark_button_gray_hover',
  'dark_text',
  'dark_text_blue',
  'dark_text_green',
  'dark_text_invert',
  'dark_text_light',
  'dark_text_lighter',
  'dark_text_lightest',
  'dark_text_red',
  'dark_text_yellow',
  'light_accent',
  'light_bg',
  'light_bg_accent_lowered',
  'light_bg_accent_raised',
  'light_bg_blue_lowered',
  'light_bg_blue_raised',
  'light_bg_green_lowered',
  'light_bg_green_raised',
  'light_bg_lowered',
  'light_bg_medium',
  'light_bg_raised',
  'light_bg_red_lowered',
  'light_bg_red_raised',
  'light_bg_yellow_lowered',
  'light_bg_yellow_raised',
  'light_border',
  'light_border_strong',
  'light_border_weak',
  'light_button_fill',
  'light_button_fill_hover',
  'light_button_gray',
  'light_button_gray_hover',
  'light_text',
  'light_text_blue',
  'light_text_green',
  'light_text_invert',
  'light_text_light',
  'light_text_lighter',
  'light_text_lightest',
  'light_text_red',
  'light_text_yellow',
  'rounding',
  'spacing',
  'transitions',
  'widening',
]

function computeThemeChecksum(theme: Tables<'themes'>): string {
  const sorted = COLOR_SCALE_KEYS
    .filter(k => k in theme)
    .sort()
    .map(k => [k, theme[k]])

  return btoa(JSON.stringify(sorted))
}

function computeCssChecksum(css: string | null | undefined): string {
  if (css == null || css.trim().length === 0)
    return ''
  return btoa(css.trim())
}

export function useUserTheme() {
  const supabase = useSupabaseClient<Database>()
  const userId = useUserId()

  const activeTheme = useState<Tables<'themes'> | null>('user-active-theme', () => null)
  const hasFetched = useState<boolean>('user-theme-fetched', () => false)

  // Non-null when a theme with custom CSS is awaiting user confirmation before being applied.
  const pendingTheme = useState<{ theme: Tables<'themes'>, hasUrl: boolean, origin?: { x: number, y: number } } | null>('theme-pending-confirmation', () => null)

  // Non-null when a previewed theme with custom CSS is awaiting user confirmation before preview is applied.
  const pendingPreviewTheme = useState<{
    theme: Tables<'themes'>
    hasUrl: boolean
    origin?: { x: number, y: number }
    onConfirm: (withCss: boolean) => void
    onCancel: () => void
  } | null>('theme-pending-preview-confirmation', () => null)

  // Non-null when the cached theme's CSS differs from the freshly fetched theme's CSS.
  const pendingCssChange = useState<{ theme: Tables<'themes'>, hasUrl: boolean } | null>('theme-pending-css-change', () => null)

  const { settings } = useDataUserSettings()
  const { themes } = useDataThemes()

  const customCssContent = useState<string>('theme-custom-css', () => '')

  const { load: loadStyleTag } = useStyleTag(customCssContent, {
    id: 'hivecom-theme-custom-css',
    immediate: false,
    manual: true,
  })

  function applyCustomCss(raw: string | null | undefined): void {
    const sanitized = sanitizeCustomCss(raw)
    customCssContent.value = sanitized

    if (sanitized.length > 0) {
      loadStyleTag()
    }
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
        void setActiveTheme(options[0].value)
    },
  })

  const selectedVariant = computed({
    get(): VariantOption[] {
      const option = variantOptions.find(o => o.value === settings.value.theme)
      return option ? [option] : []
    },
    set(options: VariantOption[]) {
      if (options?.[0]) {
        setVariant(options[0].value)
      }
    },
  })

  function setVariant(value: ThemeVariant) {
    settings.value.theme = value
    setColorTheme(value)
  }

  async function fetchAndApply(force = false, isLoginTransition = false): Promise<void> {
    const id = userId.value
    if (id == null) {
      // Signed-out users: restore from localStorage cache if available
      if (import.meta.client) {
        try {
          const cached = localStorage.getItem(THEME_CACHE_KEY)
          if (cached != null) {
            const cachedTheme = JSON.parse(cached) as Tables<'themes'>
            if (cachedTheme?.id != null) {
              applyTheme(cachedTheme)
              activeTheme.value = cachedTheme
              // Also restore custom CSS if it was previously allowed
              if (cachedTheme.custom_css != null && cachedTheme.custom_css.trim().length > 0) {
                applyCustomCss(cachedTheme.custom_css)
              }
              return
            }
          }
        }
        catch {
          // Ignore parse errors
        }
      }
      applyTheme(null)
      applyCustomCss(null)
      activeTheme.value = null
      return
    }

    if (hasFetched.value && !force)
      return

    // Early restoration from localStorage to avoid FOUC on reload.
    // Skip on login transitions: the cache may hold a stale guest theme set
    // before the user authenticated, which would flash before the real profile
    // theme loads. On a normal reload the session is restored synchronously so
    // isLoginTransition is false and this path is safe to use.
    if (import.meta.client && !isLoginTransition) {
      try {
        const cached = localStorage.getItem(THEME_CACHE_KEY)
        if (cached != null) {
          const cachedTheme = JSON.parse(cached) as Tables<'themes'>
          if (cachedTheme?.id != null) {
            applyTheme(cachedTheme)
            activeTheme.value = cachedTheme
          }
        }
      }
      catch {
        // Ignore parse errors
      }
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('theme_id')
      .eq('id', id)
      .single()

    if (profileError || profile?.theme_id == null) {
      applyTheme(null)
      applyCustomCss(null)
      activeTheme.value = null
      hasFetched.value = true
      return
    }

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

    const theme = themeData

    if (import.meta.client) {
      // Checksum tracking for color/scale changes
      const newChecksum = computeThemeChecksum(theme)
      const storedChecksum = localStorage.getItem(`hivecom-theme-checksum-${theme.id}`)

      if (storedChecksum !== null && storedChecksum !== newChecksum) {
        pushToast('Your active theme has been updated.')
      }

      localStorage.setItem(`hivecom-theme-checksum-${theme.id}`, newChecksum)
      localStorage.setItem(THEME_CACHE_KEY, JSON.stringify(theme))

      // CSS change detection
      const newCssChecksum = computeCssChecksum(theme.custom_css)
      const storedCssChecksum = localStorage.getItem(`hivecom-theme-css-checksum-${theme.id}`)
      const hasCss = theme.custom_css != null && theme.custom_css.trim().length > 0

      if (hasCss && storedCssChecksum !== null && storedCssChecksum !== newCssChecksum) {
        // CSS has changed since last apply - prompt user
        pendingCssChange.value = {
          theme,
          hasUrl: HAS_URL_REGEX.test(theme.custom_css ?? ''),
        }
        activeTheme.value = theme
        applyTheme(theme)
        applyCustomCss(null)
        hasFetched.value = true
        return
      }

      // No CSS change or first time - save CSS checksum and apply normally
      if (hasCss) {
        localStorage.setItem(`hivecom-theme-css-checksum-${theme.id}`, newCssChecksum)
      }
    }

    activeTheme.value = theme
    applyTheme(theme)
    if (settings.value.allow_custom_css)
      applyCustomCss(theme.custom_css)
    else
      applyCustomCss(null)
    hasFetched.value = true
  }

  async function applyAndPersistTheme(theme: Tables<'themes'>, withCss?: boolean): Promise<void> {
    const id = userId.value

    activeTheme.value = theme
    applyTheme(theme)
    // withCss explicitly controls CSS application when called from preview keep.
    // Falls back to the user's persistent setting when not specified.
    const applyCss = withCss ?? settings.value.allow_custom_css
    if (applyCss)
      applyCustomCss(theme.custom_css)
    else
      applyCustomCss(null)

    if (import.meta.client) {
      localStorage.setItem(THEME_CACHE_KEY, JSON.stringify(theme))
      localStorage.setItem(`hivecom-theme-checksum-${theme.id}`, computeThemeChecksum(theme))
      if (theme.custom_css && theme.custom_css.trim().length > 0) {
        localStorage.setItem(`hivecom-theme-css-checksum-${theme.id}`, btoa(theme.custom_css.trim()))
      }
    }

    if (id == null)
      return

    await supabase
      .from('profiles')
      .update({ theme_id: theme.id })
      .eq('id', id)
  }

  async function setActiveTheme(themeId: string | null, origin?: { x: number, y: number }): Promise<void> {
    const id = userId.value

    if (themeId == null) {
      const { transitionTheme } = useThemeTransition()
      void transitionTheme(() => {
        applyTheme(null)
        applyCustomCss(null)
        activeTheme.value = null

        if (import.meta.client) {
          localStorage.removeItem(THEME_CACHE_KEY)
        }
      }, origin)

      if (id == null)
        return

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

    const theme = data

    if (theme.custom_css && theme.custom_css.trim().length > 0) {
      const hasUrl = HAS_URL_REGEX.test(theme.custom_css)
      pendingTheme.value = { theme, hasUrl, origin }
      return
    }

    const { transitionTheme } = useThemeTransition()
    void transitionTheme(() => {
      void applyAndPersistTheme(theme)
    }, origin)
  }

  function confirmPendingPreviewTheme(withCss: boolean): void {
    if (!pendingPreviewTheme.value)
      return
    const { onConfirm } = pendingPreviewTheme.value
    pendingPreviewTheme.value = null
    onConfirm(withCss)
  }

  function cancelPendingPreviewTheme(): void {
    if (!pendingPreviewTheme.value)
      return
    const { onCancel } = pendingPreviewTheme.value
    pendingPreviewTheme.value = null
    onCancel()
  }

  async function confirmPendingTheme(): Promise<void> {
    if (!pendingTheme.value)
      return
    const { theme } = pendingTheme.value
    pendingTheme.value = null
    settings.value.allow_custom_css = true
    await applyAndPersistTheme(theme)
  }

  async function confirmPendingThemeWithoutCss(): Promise<void> {
    if (!pendingTheme.value)
      return
    const { theme } = pendingTheme.value
    pendingTheme.value = null
    settings.value.allow_custom_css = false
    await applyAndPersistTheme(theme)
  }

  async function confirmCssChange(): Promise<void> {
    if (!pendingCssChange.value)
      return
    const { theme } = pendingCssChange.value
    pendingCssChange.value = null
    settings.value.allow_custom_css = true
    if (import.meta.client && theme.custom_css) {
      localStorage.setItem(`hivecom-theme-css-checksum-${theme.id}`, btoa(theme.custom_css.trim()))
    }
    applyCustomCss(theme.custom_css)
  }

  async function dismissCssChange(): Promise<void> {
    if (!pendingCssChange.value)
      return
    pendingCssChange.value = null
    // Do not update the CSS checksum - user wants to keep old behavior
    applyCustomCss(null)
  }

  watch(userId, (newId, oldId) => {
    if (newId == null) {
      hasFetched.value = false
      return
    }

    if (newId !== oldId) {
      hasFetched.value = false
      if (import.meta.client) {
        localStorage.removeItem(THEME_CACHE_KEY)
      }
      void fetchAndApply(false, true)
    }
  })

  watch(() => settings.value.allow_custom_css, (allowed) => {
    applyCustomCss(allowed ? activeTheme.value?.custom_css : null)
  })

  function reapplyCustomCss(): void {
    applyCustomCss(settings.value.allow_custom_css ? activeTheme.value?.custom_css : null)
  }

  return {
    activeTheme,
    pendingTheme,
    applyAndPersistTheme,
    pendingCssChange,
    pendingPreviewTheme,
    fetchAndApply,
    setActiveTheme,
    setVariant,
    confirmPendingPreviewTheme,
    cancelPendingPreviewTheme,
    confirmPendingTheme,
    confirmPendingThemeWithoutCss,
    confirmCssChange,
    dismissCssChange,
    applyCustomCss,
    reapplyCustomCss,
    themeOptions,
    selectedTheme,
    variantOptions,
    selectedVariant,
  }
}
