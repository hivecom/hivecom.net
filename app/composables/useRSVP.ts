import type { MaybeRefOrGetter } from 'vue'
import type { Tables } from '@/types/database.overrides'
import type { Database } from '@/types/database.types'
import { useCache } from '@/composables/useCache'
import { useRsvpBus } from '@/composables/useRsvpBus'
import { CACHE_NAMESPACES } from '@/lib/cache/namespaces'

type RSVPStatus = Database['public']['Enums']['events_rsvp_status']
type RSVPScope = Database['public']['Enums']['events_rsvp_scope']

interface RsvpRow {
  id: number
  rsvp: RSVPStatus
  scope: RSVPScope
  occurrence_date: string | null
}

// Tracks both occurrence-level and series-level RSVP rows for an event.
// occurrenceRow - RSVP scoped to this specific event row (or null)
// seriesRow     - RSVP scoped to the parent series (or null, only for child occurrences)
interface RsvpState {
  occurrenceRow: RsvpRow | null
  seriesRow: RsvpRow | null
}

// Wrapper so cache can distinguish "confirmed no RSVP" from a cache miss.
interface RsvpStateEntry { state: RsvpState }

const _rsvpStatusCache = useCache(CACHE_NAMESPACES.rsvps)

function statusCacheKey(eventId: number, userId: string, occurrenceDate: string | null): string {
  return `rsvp:status:${eventId}:${userId}:${occurrenceDate ?? 'none'}`
}

/**
 * Manages RSVP state for a single event, supporting both one-off (occurrence)
 * and recurring-series (series) scopes.
 *
 * Resolution order for the displayed status:
 *   1. occurrence-scoped RSVP against this event row (highest priority / override)
 *   2. series-scoped RSVP against the parent event (only for child occurrences)
 *   3. null - no RSVP
 *
 * Exposes:
 *   rsvpStatus        - effective displayed status (read-only computed)
 *   rsvpScope         - scope of the row driving rsvpStatus ('occurrence' | 'series' | null)
 *   hasSeriesRsvp     - true when a series-level RSVP exists (independent of occurrence override)
 *   hasOccurrenceRsvp - true when an occurrence-level override exists
 *   updateRsvp(status, scope) - upsert with explicit scope
 *   removeRsvp(scope?)        - remove occurrence override, series RSVP, or both
 */
export function useRSVP(eventSource: MaybeRefOrGetter<Tables<'events'> | null | undefined>, occurrenceDateSource?: MaybeRefOrGetter<string | null | undefined>) {
  const supabase = useSupabaseClient()
  const user = useSupabaseUser()
  const userId = useUserId()
  const { dispatch: dispatchRsvpUpdated } = useRsvpBus()

  const event = toRef(eventSource)
  const occurrenceDate = computed(() => toValue(occurrenceDateSource) ?? null)

  const occurrenceRow = ref<RsvpRow | null>(null)
  const seriesRow = ref<RsvpRow | null>(null)
  const rsvpLoading = ref(false)

  // Computed effective status - occurrence overrides series
  const rsvpStatus = computed<RSVPStatus | null>(() => {
    return occurrenceRow.value?.rsvp ?? seriesRow.value?.rsvp ?? null
  })

  // Which scope is actually driving the displayed status
  const rsvpScope = computed<RSVPScope | null>(() => {
    if (occurrenceRow.value != null)
      return 'occurrence'
    if (seriesRow.value != null)
      return 'series'
    return null
  })

  const hasSeriesRsvp = computed(() => seriesRow.value != null)
  const hasOccurrenceRsvp = computed(() => occurrenceRow.value != null)

  // Whether this event is a child occurrence of a recurring series
  const isChildOccurrence = computed(() => event.value?.recurrence_parent_id != null)

  async function checkRsvpStatus(): Promise<void> {
    const currentUserId = userId.value
    const currentEvent = event.value

    if (user.value == null || currentUserId == null || currentEvent == null) {
      occurrenceRow.value = null
      seriesRow.value = null
      return
    }

    const cacheKey = statusCacheKey(currentEvent.id, currentUserId, occurrenceDate.value)
    const cached = _rsvpStatusCache.get<RsvpStateEntry>(cacheKey)
    if (cached !== null) {
      occurrenceRow.value = cached.state.occurrenceRow
      seriesRow.value = cached.state.seriesRow
      return
    }

    try {
      // Always fetch occurrence-scoped RSVP for this event
      const occurrenceDateVal = occurrenceDate.value
      const occurrenceQuery = supabase
        .from('events_rsvps')
        .select('id, rsvp, scope, occurrence_date')
        .eq('user_id', currentUserId)
        .eq('event_id', currentEvent.id)
        .eq('scope', 'occurrence')

      const occurrencePromise = (occurrenceDateVal != null
        ? occurrenceQuery.eq('occurrence_date', occurrenceDateVal)
        : occurrenceQuery.is('occurrence_date', null)
      ).maybeSingle()

      // Fetch series-scoped RSVP if this is a recurring event
      const seriesPromise = currentEvent.recurrence_rule != null
        ? supabase
            .from('events_rsvps')
            .select('id, rsvp, scope, occurrence_date')
            .eq('user_id', currentUserId)
            .eq('event_id', currentEvent.id)
            .eq('scope', 'series')
            .maybeSingle()
        : Promise.resolve({ data: null, error: null })

      const [occResult, serResult] = await Promise.all([occurrencePromise, seriesPromise])

      if (occResult.error != null) {
        console.error('Error fetching occurrence RSVP:', occResult.error)
        return
      }
      if (serResult.error != null) {
        console.error('Error fetching series RSVP:', serResult.error)
        return
      }

      const oRow = occResult.data as RsvpRow | null
      const sRow = serResult.data as RsvpRow | null

      occurrenceRow.value = oRow
      seriesRow.value = sRow

      const state: RsvpState = { occurrenceRow: oRow, seriesRow: sRow }
      _rsvpStatusCache.set<RsvpStateEntry>(cacheKey, { state })
    }
    catch (error) {
      console.error('Error checking RSVP status:', error)
    }
  }

  async function updateRsvp(newStatus: RSVPStatus, scope: RSVPScope = 'occurrence'): Promise<void> {
    const currentUserId = userId.value
    const currentEvent = event.value

    if (user.value == null || currentUserId == null || currentEvent == null)
      return

    // For series scope, RSVP is stored against the parent event
    const targetEventId = scope === 'series'
      ? (currentEvent.recurrence_parent_id ?? currentEvent.id)
      : currentEvent.id

    // Find existing row for this scope
    const existingRow = scope === 'occurrence' ? occurrenceRow.value : seriesRow.value

    rsvpLoading.value = true

    try {
      let updatedRow: RsvpRow

      if (existingRow != null) {
        const result = await supabase
          .from('events_rsvps')
          .update({ rsvp: newStatus, modified_by: currentUserId })
          .eq('id', existingRow.id)
          .select('id, rsvp, scope, occurrence_date')
          .single()

        if (result.error != null)
          throw result.error

        updatedRow = result.data as RsvpRow
      }
      else {
        const occurrenceDateVal = occurrenceDate.value
        const result = await supabase
          .from('events_rsvps')
          .insert({
            user_id: currentUserId,
            event_id: targetEventId,
            rsvp: newStatus,
            scope,
            created_by: currentUserId,
            ...(scope === 'occurrence' && occurrenceDateVal != null ? { occurrence_date: occurrenceDateVal } : {}),
          })
          .select('id, rsvp, scope, occurrence_date')
          .single()

        if (result.error != null)
          throw result.error

        updatedRow = result.data as RsvpRow
      }

      if (scope === 'occurrence') {
        occurrenceRow.value = updatedRow
      }
      else {
        seriesRow.value = updatedRow
      }

      // Write-through cache
      _rsvpStatusCache.set<RsvpStateEntry>(
        statusCacheKey(currentEvent.id, currentUserId, occurrenceDate.value),
        { state: { occurrenceRow: occurrenceRow.value, seriesRow: seriesRow.value } },
      )

      dispatchRsvpUpdated({ eventId: currentEvent.id, newStatus })
    }
    catch (error) {
      console.error('Error updating RSVP:', error)
    }
    finally {
      rsvpLoading.value = false
    }
  }

  async function removeRsvp(scope?: RSVPScope): Promise<void> {
    const currentEvent = event.value
    const currentUserId = userId.value

    if (currentEvent == null || currentUserId == null)
      return

    rsvpLoading.value = true

    try {
      const toDelete: RsvpRow[] = []

      if (scope === 'occurrence' || scope == null) {
        if (occurrenceRow.value != null)
          toDelete.push(occurrenceRow.value)
      }
      if (scope === 'series' || scope == null) {
        if (seriesRow.value != null)
          toDelete.push(seriesRow.value)
      }

      if (toDelete.length === 0) {
        return
      }

      const { error } = await supabase
        .from('events_rsvps')
        .delete()
        .in('id', toDelete.map(r => r.id))

      if (error != null)
        throw error

      if (scope === 'occurrence' || scope == null)
        occurrenceRow.value = null
      if (scope === 'series' || scope == null)
        seriesRow.value = null

      // Write-through cache
      _rsvpStatusCache.set<RsvpStateEntry>(
        statusCacheKey(currentEvent.id, currentUserId, occurrenceDate.value),
        { state: { occurrenceRow: occurrenceRow.value, seriesRow: seriesRow.value } },
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
    rsvpScope,
    hasSeriesRsvp,
    hasOccurrenceRsvp,
    isChildOccurrence,
    rsvpLoading,
    checkRsvpStatus,
    updateRsvp,
    removeRsvp,
  }
}
