import type { Database } from '@/types/database.types'
import { onMounted, ref, watch } from 'vue'
import { useCache } from '@/composables/useCache'
import { useRsvpBus } from '@/composables/useRsvpBus'
import { CACHE_NAMESPACES } from '@/lib/cache/namespaces'

// Module-level singleton so all instances for the same event share one cache entry
// and don't issue duplicate network requests on the same page load.
const _rsvpCountCache = useCache(CACHE_NAMESPACES.rsvps)

function countCacheKey(eventId: number): string {
  return `rsvp:count:yes:${eventId}`
}

/**
 * Cached RSVP "yes" count for a single event.
 *
 * Extracted from EventRSVPCount.vue so the count is fetched once per event and
 * served from cache on back-navigation (TTL: 2 minutes).
 *
 * - Force-refreshes when useRsvpBus fires for this event (covers same-tab writes
 *   and cross-tab changes bridged by useRealtimeRsvp).
 * - `loading` starts true so consumers can show a skeleton on the first render
 *   before onMounted fires.
 */
export function useDataRsvpCount(eventId: MaybeRefOrGetter<number | null | undefined>) {
  const supabase = useSupabaseClient<Database>()

  const goingCount = ref(0)
  const loading = ref(true) // starts true so skeleton shows before onMounted fires
  const error = ref<string | null>(null)

  async function fetch(force = false): Promise<void> {
    const id = toValue(eventId)

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
      const { count, error: fetchError } = await supabase
        .from('events_rsvps')
        .select('*', { count: 'exact', head: true })
        .eq('event_id', id)
        .eq('rsvp', 'yes')

      if (fetchError)
        throw fetchError

      const result = count ?? 0
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
    if (updatedId === toValue(eventId))
      void fetch(true)
  })

  onMounted(() => void fetch())

  watch(() => toValue(eventId), () => void fetch())

  return { goingCount, loading, error }
}
