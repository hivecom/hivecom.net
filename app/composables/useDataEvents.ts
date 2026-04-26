import type { Tables } from '@/types/database.overrides'
import type { Database } from '@/types/database.types'
import { ref, watch } from 'vue'
import { useSupabaseUser } from '#imports'
import { useCache } from './useCache'

const CACHE_KEY = 'events:all'
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

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
  const cache = useCache()
  const supabase = useSupabaseClient<Database>()

  const events = ref<Tables<'events'>[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  // Note: events is not wrapped in readonly() - DeepReadonly conflicts with mutable
  // array expectations at call sites. The ref itself is not re-exported as writable.

  async function fetch(force = false): Promise<void> {
    if (!force) {
      const cached = cache.get<Tables<'events'>[]>(CACHE_KEY)
      if (cached !== null) {
        events.value = cached
        return
      }
    }

    loading.value = true
    error.value = null

    try {
      const { data, error: fetchError } = await supabase
        .from('events')
        .select('*')
        .is('recurrence_parent_id', null)
        .order('date', { ascending: true })

      if (fetchError)
        throw fetchError

      const result = data ?? []
      events.value = result
      cache.set(CACHE_KEY, result, CACHE_TTL)
    }
    catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to fetch events'
    }
    finally {
      loading.value = false
    }
  }

  function invalidate(): void {
    cache.delete(CACHE_KEY)
  }

  async function refresh(): Promise<void> {
    await fetch(true)
  }

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
