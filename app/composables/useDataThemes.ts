import type { Tables } from '@/types/database.overrides'
import type { Database } from '@/types/database.types'
import { ref } from 'vue'
import { useCache } from './useCache'

const CACHE_KEY = 'themes:all'
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

/**
 * Shared cached themes composable.
 *
 * Fetches all rows from public.themes (publicly readable via RLS).
 * Suitable for theme browsers, dropdowns, and the playground page.
 *
 * - TTL: 5 minutes
 * - `invalidate()` should be called after theme writes
 * - `refresh()` forces a cache-busting re-fetch
 */
export function useDataThemes() {
  const cache = useCache()
  const supabase = useSupabaseClient<Database>()

  const themes = ref<Tables<'themes'>[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function fetch(force = false): Promise<void> {
    if (!force) {
      const cached = cache.get<Tables<'themes'>[]>(CACHE_KEY)
      if (cached !== null) {
        themes.value = cached
        return
      }
    }

    loading.value = true
    error.value = null

    try {
      const { data, error: fetchError } = await supabase
        .from('themes')
        .select('*')
        .order('name', { ascending: true })

      if (fetchError)
        throw fetchError

      const result = data ?? []
      themes.value = result
      cache.set(CACHE_KEY, result, CACHE_TTL)
    }
    catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to fetch themes'
    }
    finally {
      loading.value = false
    }
  }

  function getById(id: string): Tables<'themes'> | null {
    return themes.value.find(t => t.id === id) ?? null
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
    themes,
    loading,
    error,
    getById,
    refresh,
    invalidate,
  }
}
