import type { Tables } from '@/types/database.overrides'
import type { Database } from '@/types/database.types'
import { ref } from 'vue'
import { useCacheModule } from '@/composables/useCacheModule'
import { CACHE_NAMESPACES } from '@/lib/cache/namespaces'

const CACHE_KEY_ALL = 'monthly_funding:all'
const CACHE_KEY_LATEST = 'monthly_funding:latest'
const CACHE_TTL = 30 * 60 * 1000

/** Call `invalidate()` after admin writes to funding_history. */
export function useDataMonthlyFunding() {
  const { withCache, cache, loading, error, onExternalInvalidation } = useCacheModule(CACHE_NAMESPACES.community)
  const supabase = useSupabaseClient<Database>()

  const allFunding = ref<Tables<'funding_history'>[]>([])
  const latestFunding = ref<Tables<'funding_history'> | null>(null)

  // Pre-populate synchronously from cache so the first render has data.
  const _initialAll = cache.getInitial<Tables<'funding_history'>[]>(CACHE_KEY_ALL)
  if (_initialAll !== null) {
    allFunding.value = _initialAll
    latestFunding.value = cache.get<Tables<'funding_history'>>(CACHE_KEY_LATEST)
  }

  async function fetch(force = false): Promise<void> {
    // With the full list cached, latest comes from its own key and withCache is skipped.
    if (!force) {
      const cachedAll = cache.get<Tables<'funding_history'>[]>(CACHE_KEY_ALL)
      if (cachedAll !== null) {
        allFunding.value = cachedAll
        latestFunding.value = cache.get<Tables<'funding_history'>>(CACHE_KEY_LATEST)
        return
      }
    }

    const result = await withCache<Tables<'funding_history'>[]>(CACHE_KEY_ALL, async () => {
      const { data, error: fetchError } = await supabase
        .from('funding_history')
        .select('*')
        .order('month', { ascending: false })
      if (fetchError)
        throw fetchError

      const rows = data ?? []

      cache.set(CACHE_KEY_LATEST, rows[0] ?? null, CACHE_TTL)
      return rows
    }, { force, ttl: CACHE_TTL })

    if (result !== null) {
      allFunding.value = result
      latestFunding.value = result[0] ?? null
    }
  }

  function invalidate(): void {
    cache.delete(CACHE_KEY_ALL)
    cache.delete(CACHE_KEY_LATEST)
  }

  async function refresh(): Promise<void> {
    await fetch(true)
  }

  onExternalInvalidation((key) => {
    if (key === CACHE_KEY_ALL || key === CACHE_KEY_LATEST)
      void fetch(true)
  })

  onMounted(() => {
    void fetch()
  })

  return {
    /** Newest month first. */
    allFunding,
    latestFunding,
    loading,
    error,
    refresh,
    invalidate,
  }
}
