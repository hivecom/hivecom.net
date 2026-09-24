import { useRsvpBus } from '@/composables/useRsvpBus'

/**
 * The host starts out attending their own event. Recurring events get a
 * series-scoped row so the host counts for every occurrence.
 *
 * The event is already saved by now, so a failure only gets logged. A missing
 * RSVP is one click to fix. RLS refuses the insert when the event's date is in
 * the past.
 */
export async function rsvpEventOrganizer(eventId: number, userId: string, isRecurring: boolean): Promise<void> {
  const supabase = useSupabaseClient()

  const { error } = await supabase.from('event_rsvps').insert({
    event_id: eventId,
    user_id: userId,
    rsvp: 'yes',
    scope: isRecurring ? 'series' : 'occurrence',
    created_by: userId,
  })

  if (error) {
    console.error('Failed to RSVP the event organizer:', error)
    return
  }

  // Cached RSVP maps (home dashboard, RSVP buttons) only refresh off the bus.
  useRsvpBus().dispatch({ eventId, newStatus: 'yes' })
}
