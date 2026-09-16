import type { MaybeRefOrGetter } from 'vue'
import type { Database } from '@/types/database.types'
import { useCache } from '@/composables/useCache'
import { useRsvpBus } from '@/composables/useRsvpBus'
import { CACHE_NAMESPACES } from '@/lib/cache/namespaces'

// Module-level so every card on a page shares one cache entry per event and
// one in-flight request, instead of each card querying for itself.
const _attendeeCache = useCache(CACHE_NAMESPACES.rsvps)

function cacheKey(eventId: number): string {
  return `rsvp:attendees:${eventId}`
}

// Ids requested during the current tick, waiting to go out as one query.
const _queue = new Map<number, Array<(ids: string[]) => void>>()
let _flushing = false

async function enqueue(supabase: ReturnType<typeof useSupabaseClient<Database>>, eventId: number): Promise<string[]> {
  return new Promise((resolve) => {
    const waiters = _queue.get(eventId)
    if (waiters != null) {
      waiters.push(resolve)
      return
    }

    _queue.set(eventId, [resolve])

    // A list renders all its cards in the same tick, so batching here turns
    // twenty queries into one.
    if (!_flushing) {
      _flushing = true
      queueMicrotask(() => void flush(supabase))
    }
  })
}

async function flush(supabase: ReturnType<typeof useSupabaseClient<Database>>): Promise<void> {
  const batch = new Map(_queue)
  _queue.clear()
  _flushing = false

  const ids = [...batch.keys()]

  const { data, error } = await supabase
    .from('event_rsvps')
    .select('event_id, user_id')
    .eq('rsvp', 'yes')
    .in('event_id', ids)

  if (error)
    console.error('Failed to fetch event attendees:', error)

  // Deduplicate: an event can carry both a series and an occurrence row for
  // the same person.
  const byEvent = new Map<number, Set<string>>()
  for (const row of data ?? []) {
    const set = byEvent.get(row.event_id) ?? new Set<string>()
    set.add(row.user_id)
    byEvent.set(row.event_id, set)
  }

  for (const [eventId, waiters] of batch) {
    const resolved = [...(byEvent.get(eventId) ?? [])]

    // An event nobody answered still caches, otherwise every render re-queries
    // to learn the same nothing.
    if (!error)
      _attendeeCache.set(cacheKey(eventId), resolved)

    waiters.forEach(resolve => resolve(resolved))
  }
}

/**
 * The user ids attending an event, for the avatar cluster on event cards.
 *
 * Reads from cache synchronously so a revisit paints with the faces already in
 * place, and batches the misses across every card rendering in the same tick.
 * Refreshes when anything announces an RSVP write for this event.
 */
export function useDataEventAttendees(eventSource: MaybeRefOrGetter<number | null | undefined>) {
  const supabase = useSupabaseClient<Database>()

  const userIds = ref<string[]>([])
  const count = computed(() => userIds.value.length)
  const loading = ref(false)

  function primeFromCache(eventId: number): boolean {
    const cached = _attendeeCache.get<string[]>(cacheKey(eventId))
    if (cached === null)
      return false

    userIds.value = cached

    return true
  }

  async function fetch(force = false): Promise<void> {
    const eventId = toValue(eventSource)
    if (eventId == null)
      return

    if (force)
      _attendeeCache.delete(cacheKey(eventId))
    else if (primeFromCache(eventId))
      return

    loading.value = true
    userIds.value = await enqueue(supabase, eventId)
    loading.value = false
  }

  // Prime before the first paint so a warm cache never flashes a skeleton.
  const _initialId = toValue(eventSource)
  if (_initialId != null)
    primeFromCache(_initialId)

  onBeforeMount(() => {
    void fetch()
  })

  watch(() => toValue(eventSource), () => {
    void fetch()
  })

  useRsvpBus().onRsvpUpdated(({ eventId: updatedId }) => {
    if (updatedId === toValue(eventSource))
      void fetch(true)
  })

  return { userIds, count, loading }
}
