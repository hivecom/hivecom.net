import type { Database } from '@/types/database.types'
import { ref } from 'vue'
import { useCache } from '@/composables/useCache'
import { CACHE_NAMESPACES } from '@/lib/cache/namespaces'

const CACHE_KEY = 'supporters:ids'
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

// Module-level cache instance for external invalidation.
const _supportersCache = useCache(CACHE_NAMESPACES.community)

export function invalidateSupportersCache(): void {
  _supportersCache.delete(CACHE_KEY)
}

/**
 * Shared cached supporters composable.
 *
 * Fetches IDs of all lifetime + patreon supporters (non-banned).
 * Used by SupportCTA and funding.vue - both previously fetched independently.
 *
 * - TTL: 5 minutes
 * - Namespace: community (shared with funding/expenses/metrics)
 */
export function useDataSupporters() {
  const cache = useCache(CACHE_NAMESPACES.community)
  const supabase = useSupabaseClient<Database>()

  // Pre-populate synchronously from cache to avoid loading flash on warm nav.
  const _initialCached = cache.get<string[]>(CACHE_KEY)
  const supporterIds = ref<string[]>(_initialCached ?? [])
  const loading = ref(_initialCached === null)
  const error = ref<string | null>(null)

  async function fetch(force = false): Promise<void> {
    if (!force) {
      const cached = cache.get<string[]>(CACHE_KEY)
      if (cached !== null) {
        supporterIds.value = cached
        loading.value = false
        return
      }
    }

    loading.value = true
    error.value = null

    try {
      const { data, error: fetchError } = await supabase
        .from('profiles')
        .select('id')
        .or('supporter_lifetime.eq.true,supporter_patreon.eq.true')
        .eq('banned', false)
        .order('created_at', { ascending: true })

      if (fetchError)
        throw fetchError

      const ids = (data ?? []).map(r => r.id)
      supporterIds.value = ids
      cache.set(CACHE_KEY, ids, CACHE_TTL)
    }
    catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to load supporters'
    }
    finally {
      loading.value = false
    }
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
    supporterIds,
    loading,
    error,
    refresh,
    invalidate,
  }
}
