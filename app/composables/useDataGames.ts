import type { Tables } from '@/types/database.overrides'
import type { Database } from '@/types/database.types'
import { ref } from 'vue'
import { useCache } from '@/composables/useCache'
import { useCacheModule } from '@/composables/useCacheModule'
import { CACHE_NAMESPACES } from '@/lib/cache/namespaces'

const CACHE_KEY = 'games:all'

// Module-level so the cache can be invalidated from outside the composable.
const _gamesCache = useCache(CACHE_NAMESPACES.games)

export function invalidateGamesCache(): void {
  _gamesCache.delete(CACHE_KEY)
}

/**
 * Single-game lookups should go through getById() on the cached list instead of
 * a second query. Admin writes to the games table must call invalidate().
 */
export function useDataGames() {
  const { withCache, cache, loading, error, onExternalInvalidation } = useCacheModule(CACHE_NAMESPACES.games)
  const supabase = useSupabaseClient<Database>()

  const games = ref<Tables<'games'>[]>([])

  const _initialCached = cache.getInitial<Tables<'games'>[]>(CACHE_KEY)
  if (_initialCached !== null)
    games.value = _initialCached

  async function fetch(force = false): Promise<void> {
    const result = await withCache(CACHE_KEY, async () => {
      const { data, error: fetchError } = await supabase
        .from('games')
        .select('*')
        .order('name', { ascending: true })
      if (fetchError)
        throw fetchError

      return data ?? []
    }, { force })
    if (result !== null)
      games.value = result
  }

  // Also null while the list hasn't loaded yet.
  function getById(id: number): Tables<'games'> | null {
    return games.value.find(g => g.id === id) ?? null
  }

  function getByIds(ids: number[]): Tables<'games'>[] {
    const idSet = new Set(ids)
    return games.value.filter(g => idSet.has(g.id))
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
    games,
    loading,
    error,
    getById,
    getByIds,
    refresh,
    invalidate,
  }
}
