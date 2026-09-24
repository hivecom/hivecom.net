import type { Component } from 'vue'
import type { Tables } from '@/types/database.overrides'
import { pushToast, removeToast } from '@dolanske/vui'
import { ref } from 'vue'
import ToastBodyThemePreview from '@/components/Toast/ToastBodyThemePreview.vue'
import { applyTheme } from '@/lib/theme'
import { useThemeTransition } from './useThemeTransition'

const HAS_URL_REGEX = /url\s*\(/i

// Module-level so all instances share one active preview toast.
// Clicking preview on a different card bumps the existing toast.
let previewToastId: number | null = null
const previewingThemeId = ref<string | null>(null)
let previewingTheme: Tables<'themes'> | null = null
let previewingWithCss = false

export function useThemePreview() {
  const { activeTheme, setActiveTheme, applyAndPersistTheme, applyCustomCss, pendingPreviewTheme } = useUserTheme()
  const { settings } = useDataUserSettings()
  const { transitionTheme } = useThemeTransition()

  function _applyPreview(theme: Tables<'themes'>, origin?: { x: number, y: number }, withCss = false) {
    if (previewToastId !== null)
      removeToast(previewToastId)

    previewingThemeId.value = theme.id
    previewingTheme = theme
    previewingWithCss = withCss

    void transitionTheme(() => {
      applyTheme(theme)
      applyCustomCss(withCss ? theme.custom_css : null)
    }, origin)

    const toast = pushToast('', {
      persist: true,
      body: markRaw(ToastBodyThemePreview as Component),
      bodyProps: {
        themeName: theme.name,
        onKeep: (toastId: number, keepOrigin?: { x: number, y: number }) => {
          if (theme.id === '$default') {
            // setActiveTheme(null) owns its own transitionTheme call.
            // Wrapping it in another transitionTheme triggers the guard
            // (transitioning = true) and silently blocks the inner apply.
            void setActiveTheme(null, keepOrigin)
          }
          else {
            // Pass withCss explicitly so applyAndPersistTheme doesn't re-read
            // allow_custom_css, since the user already decided during preview.
            // The consent is persisted so it survives reloads.
            if (withCss)
              settings.value.allow_custom_css = true
            void transitionTheme(() => {
              void applyAndPersistTheme(theme, withCss)
            }, keepOrigin)
          }
          removeToast(toastId)
          previewToastId = null
          previewingThemeId.value = null
          previewingTheme = null
        },
        onRemove: (toastId: number, removeOrigin?: { x: number, y: number }) => {
          void transitionTheme(() => {
            applyTheme(activeTheme.value ?? null)
            applyCustomCss(settings.value.allow_custom_css ? activeTheme.value?.custom_css : null)
          }, removeOrigin)
          removeToast(toastId)
          previewToastId = null
          previewingThemeId.value = null
          previewingTheme = null
        },
      },
    })

    previewToastId = toast.id
  }

  function previewTheme(theme: Tables<'themes'>, origin?: { x: number, y: number }) {
    const hasCss = theme.custom_css != null && theme.custom_css.trim().length > 0

    // Custom CSS prompts once per distinct theme. Re-clicking the theme already
    // being previewed doesn't re-prompt.
    if (hasCss && previewingThemeId.value !== theme.id) {
      pendingPreviewTheme.value = {
        theme,
        hasUrl: HAS_URL_REGEX.test(theme.custom_css ?? ''),
        origin,
        onConfirm: (withCss: boolean) => {
          _applyPreview(theme, origin, withCss)
        },
        onCancel: () => {
          // Nothing to restore, the preview was never applied.
        },
      }
      return
    }

    // No prompt needed. CSS applies only if the user allowed it globally.
    _applyPreview(theme, origin, settings.value.allow_custom_css)
  }

  function cancelPreview(origin?: { x: number, y: number }) {
    if (previewToastId !== null) {
      removeToast(previewToastId)
      previewToastId = null
    }
    previewingThemeId.value = null
    void transitionTheme(() => applyTheme(activeTheme.value ?? null), origin)
  }

  // Dismisses the toast without restoring a theme, for callers that handle the
  // transition themselves.
  function dismissPreview() {
    if (previewToastId !== null) {
      removeToast(previewToastId)
      previewToastId = null
    }
    previewingThemeId.value = null
  }

  function keepPreview(origin?: { x: number, y: number }) {
    if (previewingThemeId.value === null || previewingTheme === null)
      return

    const theme = previewingTheme
    const withCss = previewingWithCss
    if (previewToastId !== null) {
      removeToast(previewToastId)
      previewToastId = null
    }
    previewingThemeId.value = null
    previewingTheme = null
    if (theme.id === '$default') {
      // setActiveTheme(null) owns its own transitionTheme call. Calling it
      // directly lets the origin propagate and avoids the double wrap that trips
      // the transitioning guard and silently blocks applyTheme(null).
      void setActiveTheme(null, origin)
    }
    else {
      void transitionTheme(() => {
        void applyAndPersistTheme(theme, withCss)
      }, origin)
    }
  }

  return {
    previewTheme,
    cancelPreview,
    dismissPreview,
    keepPreview,
    previewingThemeId,
  }
}
