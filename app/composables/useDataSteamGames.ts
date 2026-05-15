import type { Tables } from '@/types/database.overrides'
import type { Database } from '@/types/database.types'
import { computed, ref } from 'vue'
import { useCacheModule } from '@/composables/useCacheModule'
import { CACHE_NAMESPACES } from '@/lib/cache/namespaces'

const CACHE_KEY = 'steam_games:all'

/**
 * Cached composable for the data_steam_games catalogue.
 *
 * This table is a passive registry of every Steam app ID observed via rich
 * presence. It is not the same as the community `games` table - it may contain
 * games that are not officially tracked by the community.
 *
 * - TTL: 1 hour (the catalogue grows but existing entries rarely change)
 */
export function useDataSteamGames() {
  const { withCache, cache, loading, error } = useCacheModule(CACHE_NAMESPACES.steamGames)
  const supabase = useSupabaseClient<Database>()

  const steamGames = ref<Tables<'data_steam_games'>[]>([])

  const _initialCached = cache.get<Tables<'data_steam_games'>[]>(CACHE_KEY)
  if (_initialCached !== null)
    steamGames.value = _initialCached

  async function fetch(force = false): Promise<void> {
    const result = await withCache(CACHE_KEY, async () => {
      const { data, error: fetchError } = await supabase
        .from('data_steam_games')
        .select('*')
        .order('name', { ascending: true })
      if (fetchError)
        throw fetchError
      return data ?? []
    }, { force })
    if (result !== null)
      steamGames.value = result
  }

  /**
   * Map of Steam app ID (number) -> game name. Useful for label lookups.
   */
  const steamGameNameMap = computed(() => {
    const map = new Map<number, string>()
    for (const g of steamGames.value)
      map.set(g.steam_id, g.name)
    return map
  })

  /**
   * Map of Steam app ID (string) -> game name. Useful for metrics key lookups.
   */
  const steamGameNameMapStr = computed(() => {
    const map = new Map<string, string>()
    for (const g of steamGames.value)
      map.set(String(g.steam_id), g.name)
    return map
  })

  onMounted(() => {
    void fetch()
  })

  return {
    steamGames,
    steamGameNameMap,
    steamGameNameMapStr,
    loading,
    error,
    fetch,
  }
}
