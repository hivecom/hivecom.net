import { onBeforeUnmount } from 'vue'

// Run a handler whenever the active theme changes: the light/dark class or
// data-theme attribute on the root, a custom colour theme, or the system
// colour-scheme preference. This
// mirrors the globe's theme watcher (useGlobeBase + GlobeTheme) so the canvas
// audio visuals, which read CSS colour tokens once, can re-read them on a theme
// switch instead of staying stuck on the colours they loaded with.
//
// Client-only and self-cleaning: call it from setup and it disconnects on
// unmount. Does not fire on registration; read your colours once yourself first.
export function onThemeChange(handler: () => void): void {
  if (!import.meta.client)
    return

  const media = window.matchMedia?.('(prefers-color-scheme: light)') ?? null
  media?.addEventListener('change', handler)

  // 'style' is in there because a custom colour theme is applied as inline
  // custom properties on the root (see lib/theme applyTheme), so switching
  // themes touches neither the class nor data-theme. Without it the colours
  // only catch up on the next light/dark flip.
  const observer = new MutationObserver(handler)
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class', 'data-theme', 'style'],
  })

  onBeforeUnmount(() => {
    media?.removeEventListener('change', handler)
    observer.disconnect()
  })
}
