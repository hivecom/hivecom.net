import type { Tables } from '@/types/database.overrides'
import type { Database } from '@/types/database.types'
import { ref } from 'vue'
import { useCache } from './useCache'

const CACHE_KEY = 'gameservers:all'
const CACHE_TTL = 30 * 60 * 1000 // 30 minutes - public pages don't need live container state

/**
 * Shared cached gameservers composable.
 *
 * Previously fetched independently by 3+ call sites with no coordination:
 * - pages/servers/gameservers/index.vue (full join with container + server)
 * - pages/servers/gameservers/[id].vue (single with container)
 * - components/Shared/GameServerLink.vue (name only, per ID - now cached separately)
 *
 * The full list includes the container + server join needed by the index page.
 * Single-gameserver lookups should derive from the cached list via `getById()`
 * rather than issuing a second query when the full list is already loaded.
 *
 * NOTE: This composable is for public-facing pages only. The admin panel
 * (GameServerTable, ContainerTable) fetches gameservers and containers directly
 * without this cache so it always sees live container state (running, healthy, etc.).
 * Admin write paths should call `invalidate()` after mutations so the next public
 * page load picks up the change.
 *
 * - TTL: 30 minutes
 * - `invalidate()` should be called after admin writes to the gameservers table
 * - `refresh()` forces a cache-busting re-fetch
 */

export type GameserverWithContainer = Tables<'gameservers'> & {
  container?: (Tables<'containers'> & {
    server?: {
      docker_control?: boolean | null
      accessible?: boolean | null
    } | null
  }) | null
  administrator?: string | null
}

export function useDataGameservers() {
  const cache = useCache()
  const supabase = useSupabaseClient<Database>()

  const gameservers = ref<GameserverWithContainer[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function fetch(force = false): Promise<void> {
    if (!force) {
      const cached = cache.get<GameserverWithContainer[]>(CACHE_KEY)
      if (cached !== null) {
        gameservers.value = cached
        return
      }
    }

    loading.value = true
    error.value = null

    try {
      const { data, error: fetchError } = await supabase
        .from('gameservers')
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

      const result = (data ?? []) as unknown as GameserverWithContainer[]
      gameservers.value = result
      cache.set(CACHE_KEY, result, CACHE_TTL)
    }
    catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to fetch gameservers'
    }
    finally {
      loading.value = false
    }
  }

  /**
   * Look up a single gameserver from the cached list by numeric ID. Returns null
   * if not found or if the cache hasn't been populated yet (call `fetch()` first).
   */
  function getById(id: number): GameserverWithContainer | null {
    return gameservers.value.find(gs => gs.id === id) ?? null
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
    gameservers,
    loading,
    error,
    getById,
    refresh,
    invalidate,
  }
}
