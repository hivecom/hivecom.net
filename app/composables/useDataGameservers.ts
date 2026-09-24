import type { Tables } from '@/types/database.overrides'
import type { Database } from '@/types/database.types'
import { ref } from 'vue'
import { useCache } from '@/composables/useCache'
import { useCacheModule } from '@/composables/useCacheModule'
import { CACHE_NAMESPACES } from '@/lib/cache/namespaces'

const CACHE_KEY = 'gameservers:all'

// Module-level singleton for cache invalidation from outside the composable.
const _gameserversCache = useCache(CACHE_NAMESPACES.gameservers)

export function invalidateGameserversCache(): void {
  _gameserversCache.delete(CACHE_KEY)
}

export type GameserverWithContainer = Tables<'network_gameservers'> & {
  container?: (Tables<'network_containers'> & {
    server?: {
      docker_control?: boolean | null
      accessible?: boolean | null
    } | null
  }) | null
  administrator?: string | null
}

/**
 * Public pages only. The admin panel fetches directly so it always sees live
 * container state, and must call `invalidate()` after writes.
 */
export function useDataGameservers() {
  const { withCache, cache, loading, error, onExternalInvalidation } = useCacheModule(CACHE_NAMESPACES.gameservers)
  const supabase = useSupabaseClient<Database>()

  const gameservers = ref<GameserverWithContainer[]>([])

  const _initialCached = cache.getInitial<GameserverWithContainer[]>(CACHE_KEY)
  if (_initialCached !== null)
    gameservers.value = _initialCached

  async function fetch(force = false): Promise<void> {
    const result = await withCache<GameserverWithContainer[]>(CACHE_KEY, async () => {
      const { data, error: fetchError } = await supabase
        .from('network_gameservers')
        .select(`
          *,
          container (
            name,
            running,
            healthy,
            reported_at,
            server (
              docker_control,
              accessible
            )
          ),
          administrator
        `)
        .order('name', { ascending: true })
      if (fetchError)
        throw fetchError

      return (data ?? []) as unknown as GameserverWithContainer[]
    }, { force })
    if (result !== null)
      gameservers.value = result
  }

  /** Returns null until the list has loaded. */
  function getById(id: number): GameserverWithContainer | null {
    return gameservers.value.find(gs => gs.id === id) ?? null
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
    gameservers,
    loading,
    error,
    getById,
    refresh,
    invalidate,
  }
}
