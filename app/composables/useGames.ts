import type { Tables } from '@/types/database.overrides'
import type { Database } from '@/types/database.types'
import { ref } from 'vue'
import { useCache } from './useCache'

const CACHE_KEY = 'games:all'
const CACHE_TTL = 30 * 60 * 1000 // 30 minutes - games are slow-changing reference data

/**
 * Shared cached games composable.
 *
 * Previously fetched independently by 7+ call sites with no coordination:
 * - pages/servers/gameservers/index.vue (full list)
 * - pages/servers/gameservers/[id].vue (single by ID)
 * - pages/events/[id].vue (by IDs array)
 * - components/Shared/GameDetailsModal.vue (single by ID)
 * - components/Admin/Events/EventDetails.vue (full list for picker)
 * - components/Admin/Events/EventForm.vue (full list for picker)
 * - components/Admin/Network/GameServerForm.vue (full list for picker)
 *
 * Single-game lookups should derive from the cached list via `getById()` rather
 * than issuing a second query. Admin write paths should call `invalidate()` after
 * mutations so the next consumer gets a fresh list.
 *
 * - TTL: 20 minutes (games are effectively configuration data)
 * - `invalidate()` should be called after admin writes to the games table
 * - `refresh()` forces a cache-busting re-fetch
 */
export function useGames() {
  const cache = useCache()
  const supabase = useSupabaseClient<Database>()

  const games = ref<Tables<'games'>[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function fetch(force = false): Promise<void> {
    if (!force) {
      const cached = cache.get<Tables<'games'>[]>(CACHE_KEY)
      if (cached !== null) {
        games.value = cached
        return
      }
    }

    loading.value = true
    error.value = null

    try {
      const { data, error: fetchError } = await supabase
        .from('games')
        .select('*')
        .order('name', { ascending: true })

      if (fetchError)
        throw fetchError

      const result = data ?? []
      games.value = result
      cache.set(CACHE_KEY, result, CACHE_TTL)
    }
    catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to fetch games'
    }
    finally {
      loading.value = false
    }
  }

  /**
   * Look up a single game from the cached list. Returns null if not found or
   * if the cache hasn't been populated yet (call `fetch()` first).
   */
  function getById(id: number): Tables<'games'> | null {
    return games.value.find(g => g.id === id) ?? null
  }

  /**
   * Look up multiple games by ID array from the cached list.
   */
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
