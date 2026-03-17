import type { Tables } from '@/types/database.overrides'
import type { Database } from '@/types/database.types'
import { ref } from 'vue'
import { useCache } from './useCache'

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
 * - TTL: 10 minutes (funding data changes at most a few times per day)
 * - `invalidate()` should be called after admin writes to monthly_funding
 * - `refresh()` forces a cache-busting re-fetch
 */
export function useDataMonthlyFunding() {
  const cache = useCache()
  const supabase = useSupabaseClient<Database>()

  const allFunding = ref<Tables<'monthly_funding'>[]>([])
  const latestFunding = ref<Tables<'monthly_funding'> | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function fetch(force = false): Promise<void> {
    if (!force) {
      const cachedAll = cache.get<Tables<'monthly_funding'>[]>(CACHE_KEY_ALL)
      const cachedLatest = cache.get<Tables<'monthly_funding'> | null>(CACHE_KEY_LATEST)

      if (cachedAll !== null && cachedLatest !== undefined) {
        allFunding.value = cachedAll
        latestFunding.value = cachedLatest
        return
      }
    }

    loading.value = true
    error.value = null

    try {
      const { data, error: fetchError } = await supabase
        .from('monthly_funding')
        .select('*')
        .order('month', { ascending: false })

      if (fetchError)
        throw fetchError

      const result = data ?? []
      allFunding.value = result

      // Derive latest from the already-fetched list - no second round-trip needed
      const latest = result[0] ?? null
      latestFunding.value = latest

      cache.set(CACHE_KEY_ALL, result, CACHE_TTL)
      cache.set(CACHE_KEY_LATEST, latest, CACHE_TTL)
    }
    catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to fetch funding data'
    }
    finally {
      loading.value = false
    }
  }

  function invalidate(): void {
    cache.delete(CACHE_KEY_ALL)
    cache.delete(CACHE_KEY_LATEST)
  }

  async function refresh(): Promise<void> {
    await fetch(true)
  }

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
