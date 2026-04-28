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
    // Dismiss any existing preview toast
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
      body: ToastBodyThemePreview as Component,
      bodyProps: {
        themeName: theme.name,
        onKeep: (toastId: number, keepOrigin?: { x: number, y: number }) => {
          if (theme.id === '$default') {
            void transitionTheme(() => {
              void setActiveTheme(null)
            }, keepOrigin)
          }
          else {
            // Pass withCss explicitly so applyAndPersistTheme doesn't re-evaluate
            // settings.value.allow_custom_css - user already decided during preview.
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

    // Theme has custom CSS - prompt unless already previewing this exact theme
    // (re-clicking the same theme shouldn't re-prompt) or user has globally
    // allowed custom CSS. Each distinct theme gets its own warning.
    if (hasCss && !settings.value.allow_custom_css && previewingThemeId.value !== theme.id) {
      pendingPreviewTheme.value = {
        theme,
        hasUrl: HAS_URL_REGEX.test(theme.custom_css ?? ''),
        origin,
        onConfirm: (withCss: boolean) => {
          _applyPreview(theme, origin, withCss)
        },
        onCancel: () => {
          // Nothing to restore - preview was never applied
        },
      }
      return
    }

    // No CSS prompt needed - apply with CSS if user has globally allowed it
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

  // Dismiss the toast only - no theme restore. Use when the caller is
  // handling the transition itself (e.g. reset-to-default button).
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
      void transitionTheme(() => {
        void setActiveTheme(null)
      }, origin)
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
