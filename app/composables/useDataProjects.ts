import type { Tables } from '@/types/database.overrides'
import type { Database } from '@/types/database.types'
import { ref } from 'vue'
import { useCache } from './useCache'

const CACHE_KEY = 'projects:all'
const CACHE_TTL = 60 * 60 * 1000 // 1 hour - projects change infrequently

/**
 * Shared cached projects composable.
 *
 * Previously fetched independently by 4 call sites with no coordination:
 * - pages/community/index.vue (up to 50, two separate code paths)
 * - pages/community/projects/index.vue (all, ordered)
 * - pages/community/projects/[id].vue (single by ID)
 *
 * Single-project lookups should derive from the cached list via `getById()` rather
 * than issuing a second query. Admin write paths should call `invalidate()` after
 * mutations so the next consumer gets a fresh list.
 *
 * - TTL: 5 minutes
 * - `invalidate()` should be called after admin writes to the projects table
 * - `refresh()` forces a cache-busting re-fetch
 */
export function useDataProjects() {
  const cache = useCache()
  const supabase = useSupabaseClient<Database>()

  const projects = ref<Tables<'projects'>[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function fetch(force = false): Promise<void> {
    if (!force) {
      const cached = cache.get<Tables<'projects'>[]>(CACHE_KEY)
      if (cached !== null) {
        projects.value = cached
        return
      }
    }

    loading.value = true
    error.value = null

    try {
      const { data, error: fetchError } = await supabase
        .from('projects')
        .select('*')
        .order('created_at', { ascending: false })

      if (fetchError)
        throw fetchError

      const result = data ?? []
      projects.value = result
      cache.set(CACHE_KEY, result, CACHE_TTL)
    }
    catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to fetch projects'
    }
    finally {
      loading.value = false
    }
  }

  /**
   * Look up a single project from the cached list by numeric ID. Returns null
   * if not found or if the cache hasn't been populated yet (call `fetch()` first).
   */
  function getById(id: number): Tables<'projects'> | null {
    return projects.value.find(p => p.id === id) ?? null
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
    projects,
    loading,
    error,
    getById,
    refresh,
    invalidate,
  }
}
