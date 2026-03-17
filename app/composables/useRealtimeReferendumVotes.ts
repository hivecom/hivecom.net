import type { RealtimeChannel } from '@supabase/supabase-js'
import type { Tables } from '@/types/database.overrides'

/**
 * Subscribes to Supabase realtime changes on `referendum_votes` for a specific
 * referendum, keeping a local reactive copy of the vote list in sync.
 *
 * Returns the same shape as `useCacheQuery` for the votes so callers can swap
 * it in without restructuring their templates.
 *
 * The subscription is automatically cleaned up when the calling component
 * is unmounted.
 *
 * @param referendumId - Reactive or static referendum ID to subscribe to.
 * @param initialVotes - Optional initial votes array (e.g. from SSR or a cache
 *   query). The composable will keep this list live from that starting point.
 */
export function useRealtimeReferendumVotes(
  referendumId: MaybeRef<number | null | undefined>,
  initialVotes: MaybeRef<Tables<'referendum_votes'>[] | null | undefined> = [],
) {
  const supabase = useSupabaseClient()

  // Local reactive copy of votes - starts from initialVotes and stays live.
  const votes = ref<Tables<'referendum_votes'>[]>([])

  // Sync when initialVotes changes (e.g. the cache query resolves after mount).
  watch(
    () => toValue(initialVotes),
    (incoming) => {
      if (incoming != null) {
        votes.value = [...incoming]
      }
    },
    { immediate: true },
  )

  let channel: RealtimeChannel | null = null

  function subscribe(id: number) {
    if (channel != null) {
      void supabase.removeChannel(channel)
      channel = null
    }

    channel = supabase
      .channel(`referendum_votes:referendum_id=eq.${id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'referendum_votes',
          filter: `referendum_id=eq.${id}`,
        },
        (payload) => {
          const newVote = payload.new as Tables<'referendum_votes'>
          // Guard against duplicate inserts (optimistic local inserts from
          // the same tab will already be in the list).
          if (!votes.value.some(v => v.id === newVote.id)) {
            votes.value = [...votes.value, newVote]
          }
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'referendum_votes',
          filter: `referendum_id=eq.${id}`,
        },
        (payload) => {
          const updated = payload.new as Tables<'referendum_votes'>
          votes.value = votes.value.map(v => v.id === updated.id ? updated : v)
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'referendum_votes',
          filter: `referendum_id=eq.${id}`,
        },
        (payload) => {
          // With REPLICA IDENTITY FULL, `old` contains the full deleted row.
          const deleted = payload.old as { id: number }
          votes.value = votes.value.filter(v => v.id !== deleted.id)
        },
      )
      .subscribe()
  }

  function unsubscribe() {
    if (channel != null) {
      void supabase.removeChannel(channel)
      channel = null
    }
  }

  const resolvedId = computed(() => toValue(referendumId))

  watch(
    resolvedId,
    (id) => {
      if (id != null) {
        subscribe(id)
      }
      else {
        unsubscribe()
      }
    },
    { immediate: true },
  )

  onUnmounted(unsubscribe)

  return {
    votes,
    unsubscribe,
  }
}
