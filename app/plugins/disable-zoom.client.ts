/**
 * Disables the browser's own zoom gestures (trackpad pinch on macOS, Safari
 * pinch, ctrl/cmd + wheel) everywhere except inside lightboxes, which manage
 * their own pan/zoom. Keyboard zoom (cmd/ctrl +/-/0) is intentionally left
 * alone for accessibility.
 *
 * Can be turned off per-user via the "Allow browser zoom" setting, tracked by
 * the shared `useBrowserZoomDisabled` flag.
 */
import { useBrowserZoomDisabled } from '@/composables/useZoomPreference'

export default defineNuxtPlugin(() => {
  const zoomDisabled = useBrowserZoomDisabled()

  function insideLightbox(target: EventTarget | null): boolean {
    return target instanceof HTMLElement && target.closest('.md-lightbox') !== null
  }

  // Chromium / Firefox: trackpad pinch and ctrl/cmd + wheel page zoom.
  useEventListener(window, 'wheel', (e: WheelEvent) => {
    if (zoomDisabled.value && (e.ctrlKey || e.metaKey) && !insideLightbox(e.target))
      e.preventDefault()
  }, { passive: false, capture: true })

  // Safari (desktop + iOS): pinch gesture events.
  for (const type of ['gesturestart', 'gesturechange', 'gestureend'] as const) {
    useEventListener(document, type, (e: Event) => {
      if (zoomDisabled.value && !insideLightbox(e.target))
        e.preventDefault()
    }, { passive: false })
  }
})
