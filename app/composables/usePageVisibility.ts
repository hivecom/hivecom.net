/**
 * Singleton page-visibility composable.
 *
 * Tracks `document.hidden` as a reactive ref. Only one event listener is
 * attached regardless of how many composable instances are created.
 *
 * Usage:
 *   const { isHidden } = usePageVisibility()
 *   watch(isHidden, hidden => { ... })
 */

const isHidden = ref(false)

if (import.meta.client) {
  isHidden.value = document.hidden

  document.addEventListener('visibilitychange', () => {
    isHidden.value = document.hidden
  })
}

export function usePageVisibility() {
  return { isHidden: readonly(isHidden) }
}
