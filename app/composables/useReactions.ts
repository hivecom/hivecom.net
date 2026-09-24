import type { RawReactions } from '@/lib/reactions'
import {
  applyOptimisticToggle,
  buildDisplayReactions,
  EMOJI_PROVIDER,
  parseRawReactions,
} from '@/lib/reactions'

export type ReactableTable = 'discussions' | 'discussion_replies'

export interface UseReactionsOptions {
  table: ReactableTable
  rowId: Ref<string | null | undefined> | string | null | undefined

  /** Raw JSONB from the fetched row. A local copy updates optimistically. */
  initialReactions?: Ref<unknown> | unknown

  /** Defaults to every provider present in the raw object. */
  providers?: string[]
}

export function useReactions(options: UseReactionsOptions) {
  const { table, providers } = options

  const rowId = isRef(options.rowId) ? options.rowId : ref(options.rowId)

  const supabase = useSupabaseClient()
  const userId = useUserId()

  // ── Local state ────────────────────────────────────────────────────────────

  const rawReactions = ref<RawReactions>(
    parseRawReactions(
      isRef(options.initialReactions)
        ? options.initialReactions.value
        : options.initialReactions,
    ),
  )

  // Emotes mid-toggle, so a double-click doesn't fire twice.
  const pending = ref(new Set<string>())

  const error = ref<string | null>(null)
  const capped = ref<Set<string>>(new Set())

  // ── Keep in sync when the parent updates initialReactions ──────────────────

  if (isRef(options.initialReactions)) {
    watch(
      options.initialReactions,
      (next) => {
        rawReactions.value = parseRawReactions(next)
      },
    )
  }

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

  async function toggleReaction(
    emote: string,
    provider: string = EMOJI_PROVIDER,
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

    // A capped emote can't be added, but removals still go through.
    const isCapped = capped.value.has(`${provider}:${emote}`)
    const isCurrentlyReacted = hasReacted(emote, provider)
    if (isCapped && !isCurrentlyReacted)
      return

    const snapshot = { ...rawReactions.value }

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
      rawReactions.value = snapshot

      if (rpcResult.error.message.includes('Reaction cap reached')) {
        // Remember the cap so the UI shows it without another round trip.
        capped.value = new Set(capped.value).add(`${provider}:${emote}`)
        error.value = null
      }
      else {
        error.value = rpcResult.error.message
      }
      return
    }

    // The cap can lift server-side.
    if (capped.value.has(`${provider}:${emote}`)) {
      const next = new Set(capped.value)
      next.delete(`${provider}:${emote}`)
      capped.value = next
    }

    // The RPC returns the authoritative value.
    rawReactions.value = parseRawReactions(rpcResult.data)
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  function hasReacted(emote: string, provider: string = EMOJI_PROVIDER): boolean {
    const uid = userId.value
    if (uid == null || uid === '')
      return false

    const reactors = rawReactions.value[provider]?.[emote]
    return Array.isArray(reactors) && reactors.includes(uid)
  }

  function reactionCount(emote: string, provider: string = EMOJI_PROVIDER): number {
    const reactors = rawReactions.value[provider]?.[emote]
    return Array.isArray(reactors) ? reactors.length : 0
  }

  const isLoading = computed(() => pending.value.size > 0)

  return {
    displayReactions,
    rawReactions: readonly(rawReactions),
    toggleReaction,
    hasReacted,
    reactionCount,
    /** "provider:emote" keys known to be at the 100-reactor cap. */
    capped: readonly(capped),
    isLoading,
    error: readonly(error),
  }
}
