import { useRsvpBus } from '@/composables/useRsvpBus'

/**
 * RSVP the organizer to the event they just created.
 *
 * Nobody creates an event they aren't going to, so the host starts out
 * attending instead of having to answer their own invite. Recurring events get
 * a series-scoped row so the host counts for every occurrence; one-offs get the
 * usual occurrence row.
 *
 * The event itself is already saved by the time this runs, so a failure here is
 * logged rather than thrown - the RSVP is recoverable by clicking the button,
 * losing the event isn't. RLS also refuses the insert outright when the event
 * was created with a date in the past.
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
