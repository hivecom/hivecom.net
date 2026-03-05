import type { RawReactions } from '@/lib/reactions'
import {
  applyOptimisticToggle,
  buildDisplayReactions,
  HIVECOM_PROVIDER,
  parseRawReactions,
} from '@/lib/reactions'

export type ReactableTable = 'discussions' | 'discussion_replies'

export interface UseReactionsOptions {
  /**
   * The table this reaction set belongs to.
   */
  table: ReactableTable
  /**
   * The UUID of the row being reacted to.
   */
  rowId: Ref<string | null | undefined> | string | null | undefined
  /**
   * The initial raw reactions JSONB from the already-fetched row.
   * The composable keeps a local copy and updates it optimistically.
   */
  initialReactions?: Ref<unknown> | unknown
  /**
   * Provider keys to surface in displayReactions.
   * Defaults to all providers present in the raw object.
   */
  providers?: string[]
}

export function useReactions(options: UseReactionsOptions) {
  const { table, providers } = options

  const rowId = isRef(options.rowId) ? options.rowId : ref(options.rowId)

  const supabase = useSupabaseClient()
  const userId = useUserId()

  // ── Local state ────────────────────────────────────────────────────────────

  /** Parsed copy of the reactions JSONB - mutated optimistically. */
  const rawReactions = ref<RawReactions>(
    parseRawReactions(
      isRef(options.initialReactions)
        ? options.initialReactions.value
        : options.initialReactions,
    ),
  )

  /** Track which emotes are currently being toggled to prevent double-clicks. */
  const pending = ref(new Set<string>())

  /** Non-null if the last toggle call failed; cleared on next successful toggle. */
  const error = ref<string | null>(null)

  // ── Keep in sync when the parent updates initialReactions ──────────────────

  if (isRef(options.initialReactions)) {
    watch(
      options.initialReactions,
      (next) => {
        rawReactions.value = parseRawReactions(next)
      },
    )
  }

  // Reset when the row changes (e.g. navigating between posts)
  watch(rowId, () => {
    rawReactions.value = parseRawReactions(
      isRef(options.initialReactions)
        ? options.initialReactions.value
        : options.initialReactions,
    )
    pending.value = new Set()
    error.value = null
  })

  // ── Derived display list ───────────────────────────────────────────────────

  const displayReactions = computed(() =>
    buildDisplayReactions(rawReactions.value, userId.value, providers),
  )

  // ── Toggle ─────────────────────────────────────────────────────────────────

  /**
   * Toggle a reaction for the current user.
   *
   * @param emote    The emote string (emoji or external key).
   * @param provider The provider key. Defaults to "hivecom".
   */
  async function toggleReaction(
    emote: string,
    provider: string = HIVECOM_PROVIDER,
  ): Promise<void> {
    const id = rowId.value
    if (id == null || id === '') {
      error.value = 'No target row id'
      return
    }

    const uid = userId.value
    if (uid == null || uid === '') {
      error.value = 'Not authenticated'
      return
    }

    const pendingKey = `${provider}:${emote}`
    if (pending.value.has(pendingKey))
      return

    error.value = null

    // Snapshot for rollback
    const snapshot = { ...rawReactions.value }

    // Optimistic update
    pending.value = new Set(pending.value).add(pendingKey)
    rawReactions.value = applyOptimisticToggle(rawReactions.value, provider, emote, uid)

    const rpcResult = await supabase.rpc('toggle_reaction', {
      p_table: table,
      p_id: id,
      p_emote: emote,
      p_provider: provider,
    })

    const next = new Set(pending.value)
    next.delete(pendingKey)
    pending.value = next

    if (rpcResult.error != null) {
      // Roll back optimistic update
      rawReactions.value = snapshot
      error.value = rpcResult.error.message
      return
    }

    // Sync with the authoritative value returned by the RPC
    rawReactions.value = parseRawReactions(rpcResult.data)
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  /**
   * Returns true if the current user has already reacted with this emote
   * under this provider.
   */
  function hasReacted(emote: string, provider: string = HIVECOM_PROVIDER): boolean {
    const uid = userId.value
    if (uid == null || uid === '')
      return false
    const reactors = rawReactions.value[provider]?.[emote]
    return Array.isArray(reactors) && reactors.includes(uid)
  }

  /**
   * Count of unique users who reacted with this emote under this provider.
   */
  function reactionCount(emote: string, provider: string = HIVECOM_PROVIDER): number {
    const reactors = rawReactions.value[provider]?.[emote]
    return Array.isArray(reactors) ? reactors.length : 0
  }

  /**
   * True while any toggle RPC call is in-flight.
   */
  const isLoading = computed(() => pending.value.size > 0)

  return {
    /** Flat, sorted list of reactions ready for display. */
    displayReactions,
    /** Raw reactions object - useful if you need provider-level access. */
    rawReactions: readonly(rawReactions),
    /** Toggle a reaction emote for the current user. */
    toggleReaction,
    /** True if the current user has reacted with the given emote. */
    hasReacted,
    /** Count of reactors for a given emote. */
    reactionCount,
    /** True while any toggle is in flight. */
    isLoading,
    /** Last error message, or null. */
    error: readonly(error),
  }
}
