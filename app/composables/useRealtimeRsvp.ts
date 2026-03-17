import type { RealtimeChannel } from '@supabase/supabase-js'
import type { Database } from '@/types/database.types'
import { useRsvpBus } from '@/composables/useRsvpBus'

type RSVPStatus = Database['public']['Enums']['events_rsvp_status']

/**
 * Subscribes to Supabase realtime changes on `events_rsvps` for a specific event.
 *
 * Bridges cross-browser RSVP changes into the existing `useRsvpBus` so all
 * components that already listen to that bus (EventRSVPCount, EventRSVPModal,
 * EventHeader) receive cross-browser updates without any further changes.
 *
 * Note: we do NOT skip events for the current user. `RSVPButton` dispatches
 * via `window.dispatchEvent`, which is same-tab only - so in a second browser
 * window (even the same user) the realtime event is the only signal and must
 * not be dropped. The extra re-fetch on the originating tab is harmless.
 *
 * The subscription is automatically cleaned up when the calling component
 * is unmounted.
 *
 * @param eventId - Reactive or static event ID to subscribe to.
 */
export function useRealtimeRsvp(eventId: MaybeRef<number | null | undefined>) {
  const supabase = useSupabaseClient()
  const { dispatch } = useRsvpBus()

  let channel: RealtimeChannel | null = null

  function subscribe(id: number) {
    if (channel != null) {
      void supabase.removeChannel(channel)
      channel = null
    }

    channel = supabase
      .channel(`events_rsvps:event_id=eq.${id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'events_rsvps',
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
          table: 'events_rsvps',
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
          table: 'events_rsvps',
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
