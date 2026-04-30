import type { Tables } from '@/types/database.overrides'
import type { Database } from '@/types/database.types'
import { ref } from 'vue'
import { useCacheModule } from '@/composables/useCacheModule'
import { CACHE_NAMESPACES } from '@/lib/cache/namespaces'

const CACHE_KEY_ALL = 'monthly_funding:all'
const CACHE_KEY_LATEST = 'monthly_funding:latest'
const CACHE_TTL = 30 * 60 * 1000 // 30 minutes

/**
 * Shared cached monthly_funding composable.
 *
 * Previously fetched independently by 7 call sites with no coordination:
 * - KPIOverview (latest row)
 * - FundingKPIs (latest row x2 - current + count)
 * - IncomeChart (all rows, ascending)
 * - FundingTable (all rows, descending)
 * - FundingProgress (latest row)
 * - SupportCTA (latest row - patreon_count + donation_count)
 *
 * This composable owns both the full list and the derived latest entry so
 * all consumers get cache hits after the first fetch on any given page.
 *
 * - TTL: 30 minutes (funding data changes at most a few times per day)
 * - `invalidate()` should be called after admin writes to monthly_funding
 * - `refresh()` forces a cache-busting re-fetch
 */
export function useDataMonthlyFunding() {
  const { withCache, cache, loading, error, onExternalInvalidation } = useCacheModule(CACHE_NAMESPACES.community)
  const supabase = useSupabaseClient<Database>()

  const allFunding = ref<Tables<'monthly_funding'>[]>([])
  const latestFunding = ref<Tables<'monthly_funding'> | null>(null)

  async function fetch(force = false): Promise<void> {
    // Pre-check both keys - if the full list is cached, derive latest from the
    // separately-cached entry and return early without calling withCache.
    if (!force) {
      const cachedAll = cache.get<Tables<'monthly_funding'>[]>(CACHE_KEY_ALL)
      if (cachedAll !== null) {
        allFunding.value = cachedAll
        latestFunding.value = cache.get<Tables<'monthly_funding'>>(CACHE_KEY_LATEST)
        return
      }
    }

    const result = await withCache<Tables<'monthly_funding'>[]>(CACHE_KEY_ALL, async () => {
      const { data, error: fetchError } = await supabase
        .from('monthly_funding')
        .select('*')
        .order('month', { ascending: false })
      if (fetchError)
        throw fetchError
      const rows = data ?? []
      // Derive and cache the latest entry alongside the full list
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
    /** All monthly_funding rows ordered month descending */
    allFunding,
    /** Most recent monthly_funding row (first in descending order) */
    latestFunding,
    loading,
    error,
    refresh,
    invalidate,
  }
}
