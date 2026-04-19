import type { ThemeScaleKey } from '@/lib/theme'
import type { Tables } from '@/types/database.overrides'
import { applyScale, getCssVarAsHex, SCALE_CONFIGS, THEME_SCALE_KEYS, VUI_COLOR_KEYS } from '@/lib/theme'

const HYPHEN_RE = /-/g

type ThemeType = 'dark' | 'light'

/**
 * Shared state bag for the theme editor.
 *
 * Uses `useState` so the same reactive objects are shared across both the
 * modal editor and the theming layout sidebar - switching contexts loses
 * nothing. All seeding / tear-down logic lives here so callers (pages, layouts)
 * can prepare or clear the editor state before the component mounts.
 *
 * Usage in callers before opening the editor:
 *   const { seedEditor } = useThemeEditorState()
 *   seedEditor(theme)   // or seedEditor(null) for new-theme creation
 *   themeEditorOpen.value = true
 */
export function useThemeEditorState() {
  const { activeTheme, applyCustomCss } = useUserTheme()

  // In-progress palette values for both dark and light variants.
  const themeForm = useState<Record<ThemeType, Record<string, string>>>(
    'theme-editor-form',
    () => ({ light: {}, dark: {} }),
  )

  // In-progress scale values (spacing, rounding, transitions, widening).
  const scaleValues = useState<Record<ThemeScaleKey, number>>(
    'theme-editor-scales',
    () => ({
      spacing: SCALE_CONFIGS.spacing.defaultDb,
      rounding: SCALE_CONFIGS.rounding.defaultDb,
      transitions: SCALE_CONFIGS.transitions.defaultDb,
      widening: SCALE_CONFIGS.widening.defaultDb,
    }),
  )

  // Currently active editor tab persisted across context switches.
  const activeTab = useState<'tokens' | 'css'>('theme-editor-tab', () => 'tokens')

  // In-progress custom CSS content (separate from the applied style tag).
  const customCss = useState<string>('theme-editor-css', () => '')

  // The theme being edited / forked, or null for new-theme creation.
  const editingTheme = useState<Tables<'themes'> | null>('theme-editor-editing', () => null)

  // True once seedEditor has run; prevents re-seeding on second mount.
  const seeded = useState<boolean>('theme-editor-seeded', () => false)

  // Controls whether the floating sidebar editor is visible in app.vue.
  const floatingEditorVisible = useState<boolean>('theme-editor-visible', () => false)

  function seedPalette(prefix: ThemeType, target: Record<string, string>) {
    for (const key of VUI_COLOR_KEYS) {
      target[key] = getCssVarAsHex(`--${prefix}-color-${key}`)
    }
  }

  function applyPaletteLocal(prefix: ThemeType, source: Record<string, string>) {
    for (const key of VUI_COLOR_KEYS) {
      if (source[key] != null)
        document.documentElement.style.setProperty(`--${prefix}-color-${key}`, source[key])
    }
  }

  function themeToForm(t: Tables<'themes'>) {
    for (const key of VUI_COLOR_KEYS) {
      const darkCol = `dark_${key.replace(HYPHEN_RE, '_')}` as keyof Tables<'themes'>
      const lightCol = `light_${key.replace(HYPHEN_RE, '_')}` as keyof Tables<'themes'>
      if (t[darkCol] != null)
        themeForm.value.dark[key] = t[darkCol] as string
      if (t[lightCol] != null)
        themeForm.value.light[key] = t[lightCol] as string
    }
  }

  /**
   * Seed all editor state from `theme` (if provided) or from
   * `editingTheme.value ?? activeTheme.value` (if called with no argument).
   *
   * Call this before opening the editor so state is ready when the component
   * mounts. Passing `null` explicitly clears `editingTheme` and seeds from
   * `activeTheme` or VUI CSS-var defaults.
   */
  function seedEditor(theme?: Tables<'themes'> | null) {
    if (theme !== undefined) {
      editingTheme.value = theme ?? null
    }

    const t = editingTheme.value ?? activeTheme.value

    if (t) {
      themeToForm(t)
      applyPaletteLocal('dark', themeForm.value.dark)
      applyPaletteLocal('light', themeForm.value.light)
    }
    else {
      seedPalette('dark', themeForm.value.dark)
      seedPalette('light', themeForm.value.light)
    }

    for (const key of THEME_SCALE_KEYS) {
      scaleValues.value[key] = t?.[key] ?? SCALE_CONFIGS[key].defaultDb
      applyScale(key, scaleValues.value[key])
    }

    customCss.value = t?.custom_css ?? ''
    applyCustomCss(customCss.value)
    seeded.value = true
  }

  /**
   * Reset all shared editor state to initial values.
   * Call after saving or cancelling to ensure the next open starts clean.
   */
  function clearEditorState() {
    themeForm.value = { light: {}, dark: {} }
    scaleValues.value = {
      spacing: SCALE_CONFIGS.spacing.defaultDb,
      rounding: SCALE_CONFIGS.rounding.defaultDb,
      transitions: SCALE_CONFIGS.transitions.defaultDb,
      widening: SCALE_CONFIGS.widening.defaultDb,
    }
    activeTab.value = 'tokens'
    customCss.value = ''
    editingTheme.value = null
    seeded.value = false
    floatingEditorVisible.value = false
  }

  return {
    themeForm,
    scaleValues,
    activeTab,
    customCss,
    editingTheme,
    seeded,
    floatingEditorVisible,
    seedPalette,
    applyPaletteLocal,
    themeToForm,
    seedEditor,
    clearEditorState,
  }
}
