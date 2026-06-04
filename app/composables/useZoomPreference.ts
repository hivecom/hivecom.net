import { useDataUserSettings } from './useDataUserSettings'

/**
 * Browser-zoom preference.
 *
 * By default the app disables the browser's own zoom gestures (trackpad pinch,
 * Safari pinch, mobile pinch / double-tap) - see `plugins/disable-zoom.client.ts`
 * and the `.disable-zoom` rule in `assets/index.scss`. Users can opt back in via
 * the "Allow browser zoom" setting. Lightboxes always provide their own zoom
 * regardless of this preference.
 *
 * The module-level `zoomDisabled` ref is the single source of truth, shared
 * between the plugin (which reads it on each gesture) and `useZoomPreference`
 * (which keeps it in sync with the user's setting). It defaults to `true` so
 * guests and the pre-hydration state keep zoom disabled.
 */
const zoomDisabled = ref(true)

/** Read-only-ish accessor for the global flag, usable from plugins/components. */
export function useBrowserZoomDisabled() {
  return zoomDisabled
}

/**
 * Wires the user's `allow_browser_zoom` setting to the global flag and applies
 * the side effects (viewport meta + `<html>` class). Call once, centrally.
 */
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
        content: zoomDisabled.value
          ? 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no'
          : 'width=device-width, initial-scale=1',
      },
    ],
  }))
}
