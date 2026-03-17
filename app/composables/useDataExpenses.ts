import type { Tables } from '@/types/database.overrides'
import type { Database } from '@/types/database.types'
import { computed, ref } from 'vue'
import { useCache } from './useCache'

const CACHE_KEY = 'expenses:all'
const CACHE_TTL = 60 * 60 * 1000 // 1 hour - expenses change infrequently

/**
 * Shared cached expenses composable.
 *
 * Previously fetched independently by multiple call sites:
 * - pages/community/funding.vue (all expenses, ordered by started_at)
 * - components/Community/FundingProgress.vue (active only: ended_at IS NULL + started_at <= now)
 * - components/Admin/KPIOverview.vue (admin side)
 * - components/Admin/Funding/FundingKPIs.vue (admin side)
 *
 * `activeExpenses` is derived client-side from the full list - no second query.
 * Admin write paths should call `invalidate()` after mutations.
 *
 * - TTL: 5 minutes
 * - `invalidate()` should be called after admin writes to the expenses table
 * - `refresh()` forces a cache-busting re-fetch
 */
export function useDataExpenses() {
  const cache = useCache()
  const supabase = useSupabaseClient<Database>()

  const expenses = ref<Tables<'expenses'>[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function fetch(force = false): Promise<void> {
    if (!force) {
      const cached = cache.get<Tables<'expenses'>[]>(CACHE_KEY)
      if (cached !== null) {
        expenses.value = cached
        return
      }
    }

    loading.value = true
    error.value = null

    try {
      const { data, error: fetchError } = await supabase
        .from('expenses')
        .select('*')
        .order('started_at', { ascending: false })

      if (fetchError)
        throw fetchError

      const result = data ?? []
      expenses.value = result
      cache.set(CACHE_KEY, result, CACHE_TTL)
    }
    catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to fetch expenses'
    }
    finally {
      loading.value = false
    }
  }

  /**
   * Active expenses: ended_at is null and started_at is in the past.
   * Derived from the cached full list - no additional query.
   */
  const activeExpenses = computed(() => {
    const now = new Date().toISOString()
    return expenses.value.filter(
      expense => expense.ended_at == null && expense.started_at <= now,
    )
  })

  /**
   * Total monthly expense amount in cents, derived from active expenses.
   */
  const totalActiveAmountCents = computed(() =>
    activeExpenses.value.reduce((sum, expense) => sum + expense.amount_cents, 0),
  )

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
    expenses,
    activeExpenses,
    totalActiveAmountCents,
    loading,
    error,
    refresh,
    invalidate,
  }
}
