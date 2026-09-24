import type { Tables } from '@/types/database.overrides'
import type { Database } from '@/types/database.types'
import { computed, ref } from 'vue'
import { CACHE_NAMESPACES } from '@/lib/cache/namespaces'
import { useCache } from './useCache'

const CACHE_KEY = 'expenses:all'
const CACHE_TTL = 60 * 60 * 1000 // expenses change infrequently

// Admin writes to funding_expenses must call invalidate().
export function useDataExpenses() {
  const cache = useCache(CACHE_NAMESPACES.community)
  const supabase = useSupabaseClient<Database>()

  // Filled synchronously so funding progress is right on first render.
  const _initialCached = cache.getInitial<Tables<'funding_expenses'>[]>(CACHE_KEY)
  const expenses = ref<Tables<'funding_expenses'>[]>(_initialCached ?? [])
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function fetch(force = false): Promise<void> {
    if (!force) {
      const cached = cache.get<Tables<'funding_expenses'>[]>(CACHE_KEY)
      if (cached !== null) {
        expenses.value = cached
        return
      }
    }

    loading.value = true
    error.value = null

    try {
      const { data, error: fetchError } = await supabase
        .from('funding_expenses')
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

  const activeExpenses = computed(() => {
    const now = new Date().toISOString()
    return expenses.value.filter(
      expense => expense.ended_at == null && expense.started_at <= now,
    )
  })

  // Monthly total.
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
