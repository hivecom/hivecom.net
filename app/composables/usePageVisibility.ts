// Module-level, so there's one listener however many instances exist.
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
