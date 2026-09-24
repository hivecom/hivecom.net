// ─────────────────────────────────────────────────────────────────────────────
// Singleton state – shared across all callers so every button and the modal
// itself stay in sync without duplicate watchers.
// ─────────────────────────────────────────────────────────────────────────────

const isOpen = ref(false)
const scope = ref<SearchType[] | null>(null)

export function useCommand() {
  /** Restricts results to the given entity types, or searches everything when omitted. */
  function openCommand(s?: SearchType[]) {
    scope.value = s ?? null
    isOpen.value = true
  }

  function closeCommand() {
    isOpen.value = false
    scope.value = null
  }

  return {
    isOpen,
    scope,
    openCommand,
    closeCommand,
  }
}
