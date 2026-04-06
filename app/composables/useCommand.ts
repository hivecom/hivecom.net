// Searchable entity types used to scope the command modal.
// Add new types here as more content becomes searchable.
export type SearchType
  = | 'discussion_topic'
    | 'discussion'
    | 'profile'
    | 'event'
    | 'gameserver'
    | 'project'

// ─────────────────────────────────────────────────────────────────────────────
// Singleton state – shared across all callers so every button and the modal
// itself stay in sync without duplicate watchers.
// ─────────────────────────────────────────────────────────────────────────────

const isOpen = ref(false)
const scope = ref<SearchType[] | null>(null)

export function useCommand() {
  /**
   * Open the command modal.
   *
   * @param s  Optional list of entity types to restrict results to.
   *           When omitted the modal searches across all types.
   *
   * @example
   *   openCommand()                                          // global search
   *   openCommand(['discussion', 'discussion_topic'])        // forum-scoped
   */
  function openCommand(s?: SearchType[]) {
    scope.value = s ?? null
    isOpen.value = true
  }

  /** Close the modal and reset scope. */
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
