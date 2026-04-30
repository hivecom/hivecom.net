import type { MaybeRefOrGetter } from 'vue'
import type { Tables } from '@/types/database.overrides'
import type { Database } from '@/types/database.types'
import { useCache } from '@/composables/useCache'
import { useRsvpBus } from '@/composables/useRsvpBus'
import { CACHE_NAMESPACES } from '@/lib/cache/namespaces'

type RSVPStatus = Database['public']['Enums']['events_rsvp_status']

interface RsvpRow {
  id: number
  rsvp: RSVPStatus
}

// Wrapper type so we can cache null (no RSVP) as a non-null object.
// useCache.get returns null for both cache miss and expired entry, so
// storing a naked null value would be indistinguishable from a miss.
interface RsvpStatusEntry { row: RsvpRow | null }

const _rsvpStatusCache = useCache(CACHE_NAMESPACES.rsvps)

function statusCacheKey(eventId: number, userId: string): string {
  return `rsvp:status:${eventId}:${userId}`
}

/**
 * Manages RSVP state and Supabase operations for a single event.
 *
 * Fetches the current user's RSVP on mount and whenever the event or user
 * changes. Exposes `updateRsvp` and `removeRsvp` for mutations.
 *
 * Fires `useRsvpBus` dispatch after every successful mutation so sibling
 * components (e.g. attendee counts) stay in sync.
 *
 * @param eventSource - Reactive or static event row. Can be a ref, getter, or plain value.
 */
export function useRSVP(eventSource: MaybeRefOrGetter<Tables<'events'> | null | undefined>) {
  const supabase = useSupabaseClient()
  const user = useSupabaseUser()
  const userId = useUserId()
  const { dispatch: dispatchRsvpUpdated } = useRsvpBus()

  const event = toRef(eventSource)

  const rsvpStatus = ref<RSVPStatus | null>(null)
  const rsvpId = ref<number | null>(null)
  const rsvpLoading = ref(false)

  async function checkRsvpStatus(): Promise<void> {
    const currentUserId = userId.value
    const currentEvent = event.value

    if (user.value == null || currentUserId == null || currentEvent == null) {
      rsvpStatus.value = null
      rsvpId.value = null
      return
    }

    // Serve from cache - { row: null } means confirmed no-RSVP, not a miss
    const cacheKey = statusCacheKey(currentEvent.id, currentUserId)
    const cached = _rsvpStatusCache.get<RsvpStatusEntry>(cacheKey)
    if (cached !== null) {
      rsvpStatus.value = cached.row?.rsvp ?? null
      rsvpId.value = cached.row?.id ?? null
      return
    }

    try {
      const result = await supabase
        .from('events_rsvps')
        .select('id, rsvp')
        .eq('user_id', currentUserId)
        .eq('event_id', currentEvent.id)
        .maybeSingle()

      // maybeSingle() returns null data (not an error) when no row is found
      if (result.error != null) {
        console.error('Error checking RSVP status:', result.error)
        return
      }

      const data = result.data as RsvpRow | null

      // Cache result - wrapping in { row } allows caching null (no RSVP)
      _rsvpStatusCache.set<RsvpStatusEntry>(cacheKey, { row: data })

      if (data != null) {
        rsvpStatus.value = data.rsvp
        rsvpId.value = data.id
      }
      else {
        rsvpStatus.value = null
        rsvpId.value = null
      }
    }
    catch (error) {
      console.error('Error checking RSVP status:', error)
    }
  }

  async function updateRsvp(newStatus: RSVPStatus): Promise<void> {
    const currentUserId = userId.value
    const currentEvent = event.value

    if (user.value == null || currentUserId == null || currentEvent == null)
      return

    rsvpLoading.value = true

    try {
      const currentRsvpId = rsvpId.value

      if (currentRsvpId != null) {
        const result = await supabase
          .from('events_rsvps')
          .update({
            rsvp: newStatus,
            modified_by: currentUserId,
          })
          .eq('id', currentRsvpId)
          .select('id, rsvp')
          .single()

        if (result.error != null)
          throw result.error

        const data = result.data as RsvpRow
        rsvpStatus.value = data.rsvp
        // Write-through: keep cache consistent so back-navigation is instant
        _rsvpStatusCache.set<RsvpStatusEntry>(
          statusCacheKey(currentEvent.id, currentUserId),
          { row: { id: data.id, rsvp: data.rsvp } },
        )
      }
      else {
        const result = await supabase
          .from('events_rsvps')
          .insert({
            user_id: currentUserId,
            event_id: currentEvent.id,
            rsvp: newStatus,
            created_by: currentUserId,
          })
          .select('id, rsvp')
          .single()

        if (result.error != null)
          throw result.error

        const data = result.data as RsvpRow
        rsvpStatus.value = data.rsvp
        rsvpId.value = data.id
        // Write-through
        _rsvpStatusCache.set<RsvpStatusEntry>(
          statusCacheKey(currentEvent.id, currentUserId),
          { row: { id: data.id, rsvp: data.rsvp } },
        )
      }

      dispatchRsvpUpdated({ eventId: currentEvent.id, newStatus })
    }
    catch (error) {
      console.error('Error updating RSVP:', error)
    }
    finally {
      rsvpLoading.value = false
    }
  }

  async function removeRsvp(): Promise<void> {
    const currentRsvpId = rsvpId.value
    const currentEvent = event.value
    const currentUserId = userId.value

    if (currentRsvpId == null || currentEvent == null || currentUserId == null)
      return

    rsvpLoading.value = true

    try {
      const { error } = await supabase
        .from('events_rsvps')
        .delete()
        .eq('id', currentRsvpId)

      if (error != null)
        throw error

      rsvpStatus.value = null
      rsvpId.value = null
      // Write-through: cache the no-RSVP state
      _rsvpStatusCache.set<RsvpStatusEntry>(
        statusCacheKey(currentEvent.id, currentUserId),
        { row: null },
      )

      dispatchRsvpUpdated({ eventId: currentEvent.id, newStatus: null })
    }
    catch (error) {
      console.error('Error removing RSVP:', error)
    }
    finally {
      rsvpLoading.value = false
    }
  }

  onMounted(() => {
    void checkRsvpStatus()
  })

  watch(userId, () => {
    void checkRsvpStatus()
  })

  watch(() => event.value?.id, () => {
    void checkRsvpStatus()
  })

  return {
    rsvpStatus,
    rsvpId,
    rsvpLoading,
    checkRsvpStatus,
    updateRsvp,
    removeRsvp,
  }
}
