import type { Tables } from '@/types/database.overrides'
import type { Database } from '@/types/database.types'
import { ref } from 'vue'
import { useCache } from '@/composables/useCache'
import { useCacheModule } from '@/composables/useCacheModule'
import { CACHE_NAMESPACES } from '@/lib/cache/namespaces'

const CACHE_KEY = 'projects:all'

// Module-level singleton for cache invalidation from outside the composable.
// Follows the same pattern as useDataProjectBanner's _bannerCache.
const _projectsCache = useCache(CACHE_NAMESPACES.projects)

export function invalidateProjectsCache(): void {
  _projectsCache.delete(CACHE_KEY)
}

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
 * - TTL: 1 hour
 * - `invalidate()` should be called after admin writes to the projects table
 * - `refresh()` forces a cache-busting re-fetch
 */
export function useDataProjects() {
  const { withCache, cache, loading, error, onExternalInvalidation } = useCacheModule(CACHE_NAMESPACES.projects)
  const supabase = useSupabaseClient<Database>()

  const projects = ref<Tables<'projects'>[]>([])

  async function fetch(force = false): Promise<void> {
    const result = await withCache(CACHE_KEY, async () => {
      const { data, error: fetchError } = await supabase
        .from('projects')
        .select('*')
        .order('created_at', { ascending: false })
      if (fetchError)
        throw fetchError
      return data ?? []
    }, { force })
    if (result !== null)
      projects.value = result
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

  onExternalInvalidation((key) => {
    if (key === CACHE_KEY)
      void fetch(true)
  })

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
