import type { Tables } from '@/types/database.overrides'
import type { Database } from '@/types/database.types'
import { ref, watch } from 'vue'
import { useSupabaseUser } from '#imports'
import { useCache } from '@/composables/useCache'
import { useCacheModule } from '@/composables/useCacheModule'
import { CACHE_NAMESPACES } from '@/lib/cache/namespaces'

const CACHE_KEY = 'events:all'

// Module-level singleton for cache invalidation from outside the composable.
const _eventsCache = useCache(CACHE_NAMESPACES.events)

export function invalidateEventsCache(): void {
  // Clears the whole namespace so calendar windows and paginated pages go too.
  _eventsCache.clearCache()
}

/** Call `invalidate()` after admin writes to the events table. */
export function useDataEvents() {
  const { withCache, cache, loading, error, onExternalInvalidation } = useCacheModule(CACHE_NAMESPACES.events)
  const supabase = useSupabaseClient<Database>()

  const events = ref<Tables<'events'>[]>([])

  // Seed from cache so back-navigation within the TTL doesn't flash a skeleton.
  const _initialCached = cache.getInitial<Tables<'events'>[]>(CACHE_KEY)
  if (_initialCached !== null)
    events.value = _initialCached

  // Not wrapped in readonly(): DeepReadonly conflicts with mutable array types at
  // call sites.

  async function fetch(force = false): Promise<void> {
    const result = await withCache(CACHE_KEY, async () => {
      const { data, error: fetchError } = await supabase
        .from('events')
        .select('*')
        .is('recurrence_parent_id', null)
        .order('date', { ascending: true })
      if (fetchError)
        throw fetchError

      return data ?? []
    }, { force })
    if (result !== null)
      events.value = result
  }

  function invalidate(): void {
    cache.delete(CACHE_KEY)
  }

  async function refresh(): Promise<void> {
    await fetch(true)
  }

  onExternalInvalidation((key) => {
    if (key === CACHE_KEY)
      void fetch(true)
  })

  onMounted(() => {
    void fetch()
  })

  // Auth changes which events are visible, so a guest cache must not survive sign-in.
  const currentUser = useSupabaseUser()

  // Seeded from the current auth state so back-navigation doesn't count as a sign-in.
  let _wasAuthed = currentUser.value != null
  watch(currentUser, (newUser) => {
    const isAuthed = newUser != null
    const justSignedIn = !_wasAuthed && isAuthed
    _wasAuthed = isAuthed
    if (justSignedIn) {
      invalidate()
      void fetch()
    }
  })

  return {
    events,
    loading,
    error,
    refresh,
    invalidate,
  }
}
