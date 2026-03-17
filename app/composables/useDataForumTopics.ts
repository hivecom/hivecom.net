import type { Tables } from '@/types/database.overrides'
import type { Database } from '@/types/database.types'
import { ref } from 'vue'
import { useCache } from './useCache'

const CACHE_KEY = 'discussion_topics:all'
const CACHE_TTL = 30 * 60 * 1000 // 30 minutes - topics almost never change

/**
 * Shared cached discussion_topics composable.
 *
 * Previously fetched independently by 3 call sites with no coordination:
 * - components/Forum/ForumModalAddDiscussion.vue (plain list for topic picker, with fallback query)
 * - components/Admin/Discussions/DiscussionDetails.vue (plain list for reassign picker)
 * - pages/forum/index.vue (full topic tree with nested discussions - that fetch stays separate
 *   since it's user-data-dependent; this composable covers the lightweight picker uses)
 *
 * - TTL: 30 minutes (topics change on the scale of days/weeks)
 * - `invalidate()` should be called after admin writes to discussion_topics
 * - `refresh()` forces a cache-busting re-fetch
 */
export function useDataForumTopics() {
  const cache = useCache()
  const supabase = useSupabaseClient<Database>()

  const topics = ref<Tables<'discussion_topics'>[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function fetch(force = false): Promise<void> {
    if (!force) {
      const cached = cache.get<Tables<'discussion_topics'>[]>(CACHE_KEY)
      if (cached !== null) {
        topics.value = cached
        return
      }
    }

    loading.value = true
    error.value = null

    try {
      const { data, error: fetchError } = await supabase
        .from('discussion_topics')
        .select('*')
        .order('name', { ascending: true })

      if (fetchError)
        throw fetchError

      const result = data ?? []
      topics.value = result
      cache.set(CACHE_KEY, result, CACHE_TTL)
    }
    catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to fetch forum topics'
    }
    finally {
      loading.value = false
    }
  }

  /**
   * Look up a single topic from the cached list by ID.
   */
  function getById(id: string): Tables<'discussion_topics'> | null {
    return topics.value.find(t => t.id === id) ?? null
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

  return {
    topics,
    loading,
    error,
    getById,
    refresh,
    invalidate,
  }
}
