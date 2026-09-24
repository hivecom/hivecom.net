import type { RealtimeChannel } from '@supabase/supabase-js'
import type { Database } from '@/types/database.types'
import { useRsvpBus } from '@/composables/useRsvpBus'

type RSVPStatus = Database['public']['Enums']['events_rsvp_status']

// Each instance subscribes under its own topic. supabase.channel() hands back
// the existing channel for a topic that's still registered, and removeChannel()
// only deregisters once its unsubscribe resolves, so remounting on the same
// event would otherwise attach handlers to a channel already on its way out.
let instanceCounter = 0

/**
 * Bridges realtime RSVP changes into `useRsvpBus`. Don't skip the current
 * user's events: `RSVPButton` dispatches with `window.dispatchEvent`, which is
 * same-tab only, so in a second window the realtime event is the only signal.
 */
export function useRealtimeRsvp(eventId: MaybeRef<number | null | undefined>) {
  const supabase = useSupabaseClient()
  const instanceKey = ++instanceCounter
  const { dispatch } = useRsvpBus()

  let channel: RealtimeChannel | null = null

  function subscribe(id: number) {
    if (channel != null) {
      void supabase.removeChannel(channel)
      channel = null
    }

    channel = supabase
      .channel(`event_rsvps:event_id=eq.${id}:${instanceKey}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'event_rsvps',
          filter: `event_id=eq.${id}`,
        },
        (payload) => {
          const row = payload.new as { event_id: number, user_id: string, rsvp: RSVPStatus }
          dispatch({ eventId: row.event_id, newStatus: row.rsvp })
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'event_rsvps',
          filter: `event_id=eq.${id}`,
        },
        (payload) => {
          const row = payload.new as { event_id: number, user_id: string, rsvp: RSVPStatus }
          dispatch({ eventId: row.event_id, newStatus: row.rsvp })
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'event_rsvps',
          filter: `event_id=eq.${id}`,
        },
        (payload) => {
          // With REPLICA IDENTITY FULL, `old` contains the full deleted row.
          const row = payload.old as { event_id: number, user_id: string }
          dispatch({ eventId: row.event_id, newStatus: null })
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

  const resolvedId = computed(() => toValue(eventId))

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

  return { unsubscribe }
}
