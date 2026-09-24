import type { Tables } from '@/types/database.overrides'
import type { Database } from '@/types/database.types'
import { computed, ref } from 'vue'
import { useCacheModule } from '@/composables/useCacheModule'
import { CACHE_NAMESPACES } from '@/lib/cache/namespaces'

const CACHE_KEY = 'steam_games:all'

/**
 * data_steam_games is a passive registry of every Steam app id seen through
 * rich presence. It isn't the community games table and holds games the
 * community doesn't track.
 */
export function useDataSteamGames() {
  const { withCache, cache, loading, error } = useCacheModule(CACHE_NAMESPACES.steamGames)
  const supabase = useSupabaseClient<Database>()

  const steamGames = ref<Tables<'data_steam_games'>[]>([])

  const _initialCached = cache.getInitial<Tables<'data_steam_games'>[]>(CACHE_KEY)
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

  const steamGameNameMap = computed(() => {
    const map = new Map<number, string>()
    for (const g of steamGames.value)
      map.set(g.steam_id, g.name)
    return map
  })

  // String keys for metrics lookups.
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
