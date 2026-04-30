import type { Tables } from '@/types/database.overrides'
import type { Database } from '@/types/database.types'
import { useSupabaseUser } from '#imports'
import { ref, watch } from 'vue'
import { useCache } from '@/composables/useCache'
import { useCacheModule } from '@/composables/useCacheModule'
import { CACHE_NAMESPACES } from '@/lib/cache/namespaces'

const CACHE_KEY = 'events:all'

// Module-level singleton for cache invalidation from outside the composable.
// Follows the same pattern as useDataProjectBanner's _bannerCache.
const _eventsCache = useCache(CACHE_NAMESPACES.events)

export function invalidateEventsCache(): void {
  // Clear entire events namespace so calendar windows and paginated pages are
  // also busted when admin writes to the events table.
  _eventsCache.clearCache()
}

/**
 * Shared cached events composable.
 *
 * All three consumers (NavEventBadge, pages/events/index.vue, pages/index.vue) previously
 * issued independent queries with no coordination. This composable owns the single fetch
 * and serves the result from cache on subsequent calls within the TTL window.
 *
 * - TTL: 5 minutes (events change infrequently relative to navigation frequency)
 * - `invalidate()` should be called after admin writes to the events table
 * - `refresh()` forces a cache-busting re-fetch (e.g. after RSVP mutations)
 */
export function useDataEvents() {
  const { withCache, cache, loading, error, onExternalInvalidation } = useCacheModule(CACHE_NAMESPACES.events)
  const supabase = useSupabaseClient<Database>()

  const events = ref<Tables<'events'>[]>([])

  // Note: events is not wrapped in readonly() - DeepReadonly conflicts with mutable
  // array expectations at call sites. The ref itself is not re-exported as writable.

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

  // Bust cache and re-fetch when user signs in - auth state changes what events
  // are visible (e.g. private/restricted events), so stale guest cache must not persist.
  let _wasAuthed = false
  const currentUser = useSupabaseUser()
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
