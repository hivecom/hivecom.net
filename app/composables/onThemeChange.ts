import { onBeforeUnmount } from 'vue'

// Runs a handler when the light/dark class, data-theme, custom colour theme or
// system colour scheme changes. Client-only, disconnects on unmount. It doesn't
// fire on registration, so read your colours once yourself first.
export function onThemeChange(handler: () => void): void {
  if (!import.meta.client)
    return

  const media = window.matchMedia?.('(prefers-color-scheme: light)') ?? null
  media?.addEventListener('change', handler)

  // 'style' is needed because custom colour themes are inline custom properties
  // on the root and touch neither the class nor data-theme.
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
