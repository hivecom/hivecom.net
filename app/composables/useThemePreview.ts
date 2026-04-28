import type { Component } from 'vue'
import type { Tables } from '@/types/database.overrides'
import { pushToast, removeToast } from '@dolanske/vui'
import { ref } from 'vue'
import ToastBodyThemePreview from '@/components/Toast/ToastBodyThemePreview.vue'
import { applyTheme } from '@/lib/theme'

// Module-level so all instances share one active preview toast.
// Clicking preview on a different card bumps the existing toast.
let previewToastId: number | null = null
const previewingThemeId = ref<string | null>(null)

export function useThemePreview() {
  const { activeTheme, setActiveTheme } = useUserTheme()

  function previewTheme(theme: Tables<'themes'>) {
    // Apply visually without persisting
    applyTheme(theme)

    // Dismiss any existing preview toast
    if (previewToastId !== null)
      removeToast(previewToastId)

    previewingThemeId.value = theme.id

    const toast = pushToast('', {
      persist: true,
      body: ToastBodyThemePreview as Component,
      bodyProps: {
        themeName: theme.name,
        onKeep: (toastId: number) => {
          void setActiveTheme(theme.id === '$default' ? null : theme.id)
          removeToast(toastId)
          previewToastId = null
          previewingThemeId.value = null
        },
        onRemove: (toastId: number) => {
          applyTheme(activeTheme.value ?? null)
          removeToast(toastId)
          previewToastId = null
          previewingThemeId.value = null
        },
      },
    })

    previewToastId = toast.id
  }

  function cancelPreview() {
    if (previewToastId !== null) {
      removeToast(previewToastId)
      previewToastId = null
    }
    previewingThemeId.value = null
    applyTheme(activeTheme.value ?? null)
  }

  function keepPreview() {
    if (previewingThemeId.value === null)
      return
    const id = previewingThemeId.value
    if (previewToastId !== null) {
      removeToast(previewToastId)
      previewToastId = null
    }
    void setActiveTheme(id === '$default' ? null : id)
    previewingThemeId.value = null
  }

  return {
    previewTheme,
    cancelPreview,
    keepPreview,
    previewingThemeId,
  }
}
