import { useDataUserSettings } from './useDataUserSettings'

/**
 * The app disables the browser's own zoom gestures unless the user turns on
 * "Allow browser zoom". The disable-zoom plugin reads this flag on every
 * gesture. It defaults to true so guests and pre-hydration keep zoom disabled.
 */
const zoomDisabled = ref(true)

export function useBrowserZoomDisabled() {
  return zoomDisabled
}

// Also drives the viewport meta and the <html> class. Call once, centrally.
export function useZoomPreference() {
  const { settings } = useDataUserSettings()

  watch(
    () => settings.value.allow_browser_zoom,
    (allow) => {
      zoomDisabled.value = !allow
    },
    { immediate: true },
  )

  // touch-action lives behind a class so iOS Safari (which ignores
  // `user-scalable=no`) still gets pinch/double-tap zoom disabled.
  if (import.meta.client) {
    watchEffect(() => {
      document.documentElement.classList.toggle('disable-zoom', zoomDisabled.value)
    })
  }

  useHead(() => ({
    meta: [
      {
        name: 'viewport',
        // viewport-fit=cover is what turns on the env(safe-area-inset-*) values.
        // Without it those insets read 0 even on a notched iPhone, so any
        // safe-area padding (drawers, fullscreen modals, toasts) is a no-op.
        content: zoomDisabled.value
          ? 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover'
          : 'width=device-width, initial-scale=1, viewport-fit=cover',
      },
    ],
  }))
}
