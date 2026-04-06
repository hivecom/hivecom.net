import type { Ref } from 'vue'
import { refDebounced } from '@vueuse/core'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type SearchType
  = | 'discussion_topic'
    | 'discussion'
    | 'profile'
    | 'event'
    | 'gameserver'
    | 'project'

export interface SearchResult {
  id: string
  result_type: SearchType
  title: string
  subtitle: string | null
  url: string
  score: number
}

// Cast helper - search_global won't be in generated types until `supabase gen
// types` is re-run after the migration. Route through `unknown` to avoid `any`.
type UnknownRpc = (
  name: string,
  args?: Record<string, unknown>,
) => PromiseLike<{ data: unknown, error: { message: string } | null }>

// ─────────────────────────────────────────────────────────────────────────────
// Composable
// ─────────────────────────────────────────────────────────────────────────────

const DEBOUNCE_MS = 300
const MIN_QUERY_LENGTH = 2
const DEFAULT_LIMIT = 20

export function useDataSearch(query: Ref<string>, scope: Ref<SearchType[] | null>) {
  const supabase = useSupabaseClient()

  const results = ref<SearchResult[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  const debouncedQuery = refDebounced(query, DEBOUNCE_MS)

  async function runSearch(q: string) {
    const trimmed = q.trim()

    if (trimmed.length < MIN_QUERY_LENGTH) {
      results.value = []
      return
    }

    loading.value = true
    error.value = null

    try {
      const { data, error: rpcError } = await (supabase.rpc as unknown as UnknownRpc)(
        'search_global',
        {
          p_query: trimmed,
          p_types: scope.value ?? null,
          p_limit: DEFAULT_LIMIT,
        },
      )

      if (rpcError != null) {
        console.error('[useDataSearch] RPC error:', rpcError.message)
        error.value = rpcError.message
        results.value = []
      }
      else {
        results.value = (data as SearchResult[] | null) ?? []
      }
    }
    catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      console.error('[useDataSearch] Unexpected error:', message)
      error.value = message
      results.value = []
    }
    finally {
      loading.value = false
    }
  }

  // Re-run when the debounced query changes.
  watch(debouncedQuery, (q) => {
    void runSearch(q)
  })

  // Clear results immediately when the scope changes so stale results from a
  // different scope don't flash while the new search is in-flight.
  watch(scope, () => {
    results.value = []
    // Re-trigger if there's already a live query.
    if (debouncedQuery.value.trim().length >= MIN_QUERY_LENGTH) {
      void runSearch(debouncedQuery.value)
    }
  })

  return { results, loading, error }
}
