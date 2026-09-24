import type { MaybeRefOrGetter } from 'vue'
import type { Tables } from '@/types/database.overrides'
import { useDataUser } from '@/composables/useDataUser'

/**
 * Who hosts an event, and who is left in the attendee list once the host is
 * pulled out of it.
 *
 * Every event card shows the organizer at the head of the RSVP cluster, so the
 * privacy gate and the de-duplication live here rather than in each card.
 */
export function useEventOrganizer(
  eventSource: MaybeRefOrGetter<Tables<'events'>>,
  attendeeIdsSource: MaybeRefOrGetter<string[]>,
) {
  const user = useSupabaseUser()

  const organizerId = computed(() => toValue(eventSource).created_by ?? null)

  const { user: organizer } = useDataUser(organizerId, {
    includeRole: false,
    includeAvatar: false,
  })

  // Guests only see the organizer when that profile is public.
  const showOrganizer = computed(() =>
    organizerId.value != null && (!!user.value || organizer.value?.isPublic === true),
  )

  // The host gets their own avatar in front of the cluster, so drop them from
  // the attendee list rather than showing the same face twice.
  const attendees = computed(() => {
    const ids = toValue(attendeeIdsSource)

    return showOrganizer.value ? ids.filter(id => id !== organizerId.value) : ids
  })

  return { organizerId, showOrganizer, attendees }
}
