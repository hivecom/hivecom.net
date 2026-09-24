import type { RealtimeChannel } from '@supabase/supabase-js'
import type { Tables } from '@/types/database.overrides'

// Each instance subscribes under its own topic. supabase.channel() hands back
// the existing channel for a topic that's still registered, and removeChannel()
// only deregisters once its unsubscribe resolves. A remount on the same
// referendum would otherwise attach handlers to a channel on its way out.
let instanceCounter = 0

// A live copy of one referendum's votes, starting from initialVotes.
export function useRealtimeReferendumVotes(
  referendumId: MaybeRef<number | null | undefined>,
  initialVotes: MaybeRef<Tables<'referendum_votes'>[] | null | undefined> = [],
) {
  const supabase = useSupabaseClient()
  const instanceKey = ++instanceCounter

  const votes = ref<Tables<'referendum_votes'>[]>([])

  // initialVotes can change, e.g. when the cache query resolves after mount.
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
      .channel(`referendum_votes:referendum_id=eq.${id}:${instanceKey}`)
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
          // Optimistic inserts from this tab are already in the list.
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
