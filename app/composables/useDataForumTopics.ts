import type { Tables } from '@/types/database.overrides'
import type { Database } from '@/types/database.types'
import { ref } from 'vue'
import { useCache } from '@/composables/useCache'
import { useCacheModule } from '@/composables/useCacheModule'
import { CACHE_NAMESPACES } from '@/lib/cache/namespaces'

const CACHE_KEY = 'discussion_topics:all'
const CACHE_TTL = 30 * 60 * 1000 // topics almost never change

// Module-level singleton for cache invalidation from outside the composable.
const _forumTopicsCache = useCache(CACHE_NAMESPACES.forum)

export function invalidateForumTopicsCache(): void {
  _forumTopicsCache.delete(CACHE_KEY)
}

/**
 * Flat topic list for pickers. The forum index fetches its own topic tree since
 * that one depends on the user. Call `invalidate()` after admin writes.
 */
export function useDataForumTopics() {
  const { withCache, cache, loading, error, onExternalInvalidation } = useCacheModule(CACHE_NAMESPACES.forum)
  const supabase = useSupabaseClient<Database>()

  const topics = ref<Tables<'discussion_topics'>[]>([])

  const _initialCached = cache.getInitial<Tables<'discussion_topics'>[]>(CACHE_KEY)
  if (_initialCached !== null)
    topics.value = _initialCached

  async function fetch(force = false): Promise<void> {
    const result = await withCache(CACHE_KEY, async () => {
      const { data, error: fetchError } = await supabase
        .from('discussion_topics')
        .select('*')
        .order('name', { ascending: true })
      if (fetchError)
        throw fetchError

      return data ?? []
    }, { force, ttl: CACHE_TTL })
    if (result !== null)
      topics.value = result
  }

  function getById(id: string): Tables<'discussion_topics'> | null {
    return topics.value.find(t => t.id === id) ?? null
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

  return {
    topics,
    loading,
    error,
    getById,
    refresh,
    invalidate,
  }
}
