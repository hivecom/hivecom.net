import type { Tables } from '@/types/database.overrides'
import type { Database } from '@/types/database.types'
import { ref } from 'vue'
import { useCache } from './useCache'

const CACHE_KEY = 'themes:all'
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

// Module-level refs so all composable instances share the same reactive state.
// Updating via refresh() in any instance (e.g. ThemeEditor) is immediately
// reflected in every other consumer (e.g. ThemeGallery) without re-fetching.
const themes = ref<Tables<'themes'>[]>([])
const loading = ref(false)
const error = ref<string | null>(null)

/**
 * Shared cached themes composable.
 *
 * Fetches all rows from public.themes (publicly readable via RLS).
 * Suitable for theme browsers, dropdowns, and the playground page.
 *
 * - TTL: 5 minutes
 * - `invalidate()` should be called after theme writes
 * - `refresh()` forces a cache-busting re-fetch
 * - `softDelete(id)` marks a theme as unmaintained without removing it
 */
export function useDataThemes() {
  const cache = useCache()
  const supabase = useSupabaseClient<Database>()

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

  /**
   * Soft-delete a theme by setting `is_unmaintained = true`.
   * Updates the local ref immediately for instant UI feedback, then
   * invalidates the cache so the next fetch picks up the DB state.
   * Returns an error string on failure, or null on success.
   */
  async function softDelete(id: string): Promise<string | null> {
    const { error: updateError } = await supabase
      .from('themes')
      .update({ is_unmaintained: true })
      .eq('id', id)

    if (updateError)
      return updateError.message

    // Optimistically update the local ref so all consumers react immediately
    const idx = themes.value.findIndex(t => t.id === id)

    if (idx !== -1) {
      themes.value[idx] = {
        ...themes.value[idx],
        is_unmaintained: true,
      } as Tables<'themes'>
    }

    invalidate()

    return null
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
    softDelete,
  }
}
