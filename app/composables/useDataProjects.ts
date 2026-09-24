import type { Tables } from '@/types/database.overrides'
import type { Database } from '@/types/database.types'
import { ref } from 'vue'
import { useCache } from '@/composables/useCache'
import { useCacheModule } from '@/composables/useCacheModule'
import { CACHE_NAMESPACES } from '@/lib/cache/namespaces'

const CACHE_KEY = 'projects:all'

// Module-level singleton for cache invalidation from outside the composable.
const _projectsCache = useCache(CACHE_NAMESPACES.projects)

export function invalidateProjectsCache(): void {
  _projectsCache.delete(CACHE_KEY)
}

/** Call `invalidate()` after admin writes to the projects table. */
export function useDataProjects() {
  const { withCache, cache, loading, error, onExternalInvalidation } = useCacheModule(CACHE_NAMESPACES.projects)
  const supabase = useSupabaseClient<Database>()

  const projects = ref<Tables<'projects'>[]>([])

  const _initialCached = cache.getInitial<Tables<'projects'>[]>(CACHE_KEY)
  if (_initialCached !== null)
    projects.value = _initialCached

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

  /** Returns null until the list has loaded. */
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
