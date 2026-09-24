// Blocks pinch and ctrl/cmd + wheel zoom outside lightboxes, which do their own
// pan/zoom. Keyboard zoom stays on for accessibility.
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
