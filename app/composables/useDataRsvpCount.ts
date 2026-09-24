import type { Tables } from '@/types/database.overrides'
import type { Database } from '@/types/database.types'
import { onMounted, ref, watch } from 'vue'
import { useCache } from '@/composables/useCache'
import { useRsvpBus } from '@/composables/useRsvpBus'
import { CACHE_NAMESPACES } from '@/lib/cache/namespaces'
import { isSeriesActive, nextOccurrenceDate } from '@/lib/utils/rrule'

// Module-level so every instance for an event shares one cache entry.
const _rsvpCountCache = useCache(CACHE_NAMESPACES.rsvps)

function countCacheKey(eventId: number): string {
  return `rsvp:count:yes:${eventId}`
}

/**
 * Recurring events count through get_effective_rsvps_for_occurrence, which
 * applies the occurrence window and series fallback. One-off events use a
 * direct count.
 */
export function useDataRsvpCount(eventSource: MaybeRefOrGetter<Tables<'events'> | null | undefined>) {
  const supabase = useSupabaseClient<Database>()

  const goingCount = ref(0)
  const loading = ref(true) // so the skeleton shows before onMounted fires
  const error = ref<string | null>(null)

  async function fetch(force = false): Promise<void> {
    const event = toValue(eventSource)
    const id = event?.id ?? null

    if (id == null) {
      loading.value = false
      return
    }

    if (!force) {
      const cached = _rsvpCountCache.get<number>(countCacheKey(id))
      if (cached !== null) {
        goingCount.value = cached
        loading.value = false
        return
      }
    }

    loading.value = true
    error.value = null

    try {
      let result = 0

      if (event != null && isSeriesActive(event)) {
        const nextDate = nextOccurrenceDate(event)
        const { data, error: fetchError } = await supabase
          .rpc('get_effective_rsvps_for_occurrence', {
            p_event_id: id,
            ...(nextDate != null ? { p_occurrence_date: nextDate.toISOString() } : {}),
          })

        if (fetchError)
          throw fetchError

        result = (data ?? []).filter((r: { rsvp: string }) => r.rsvp === 'yes').length
      }
      else {
        const { count, error: fetchError } = await supabase
          .from('event_rsvps')
          .select('*', { count: 'exact', head: true })
          .eq('event_id', id)
          .eq('rsvp', 'yes')

        if (fetchError)
          throw fetchError

        result = count ?? 0
      }

      goingCount.value = result
      _rsvpCountCache.set(countCacheKey(id), result)
    }
    catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to fetch RSVP count'
    }
    finally {
      loading.value = false
    }
  }

  const { onRsvpUpdated } = useRsvpBus()

  onRsvpUpdated(({ eventId: updatedId }) => {
    const id = toValue(eventSource)?.id ?? null
    if (updatedId === id)
      void fetch(true)
  })

  onMounted(() => void fetch())

  watch(() => toValue(eventSource)?.id, () => void fetch())

  return { goingCount, loading, error }
}
