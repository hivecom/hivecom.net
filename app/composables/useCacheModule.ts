import type { CacheConfig } from './useCache'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useCache } from './useCache'

/**
 * Module-level inflight registry. Separate from useCachedFetch's _inflightQueries -
 * these are keyed by full localStorage KV path (`${kvPrefix}${key}`) rather than
 * query hashes, matching the domain composable's key semantics.
 *
 * Shared across all useCacheModule instances so concurrent callers with the same
 * namespace + key deduplicate against each other even across component trees.
 */
const _moduleInflight = new Map<string, Promise<unknown>>()

/**
 * Composable for domain-specific cache modules.
 *
 * Eliminates the ~40 lines of boilerplate repeated across every `useData*` composable:
 * - Manual `loading` / `error` state management
 * - Manual `try/catch/finally`
 * - Manual cache-check-before-fetch pattern
 * - Inflight deduplication (absent from all manual cache composables)
 *
 * Accepts a `CacheConfig` from `./useCache`. Callers can pass a CacheConfig-compatible
 * namespace object directly, or construct a custom config object.
 *
 * @param config - CacheConfig forwarded to the underlying `useCache` instance.
 *
 * @example
 * ```ts
 * export function useDataThings() {
 *   const { withCache, cache, loading, error, onExternalInvalidation } =
 *     useCacheModule({ storagePrefix: 'hivecom:cache:things:' })
 *   const supabase = useSupabaseClient<Database>()
 *   const things = ref<Tables<'things'>[]>([])
 *
 *   async function fetch(force = false) {
 *     const result = await withCache('things:all', async () => {
 *       const { data, error } = await supabase.from('things').select('*')
 *       if (error) throw error
 *       return data ?? []
 *     }, { force })
 *     if (result !== null) things.value = result
 *   }
 *
 *   onExternalInvalidation((key) => {
 *     if (key === 'things:all') void fetch(true)
 *   })
 *
 *   onMounted(() => void fetch())
 *   return { things, loading, error, refresh: () => fetch(true), invalidate: () => cache.delete('things:all') }
 * }
 * ```
 */
export function useCacheModule(config: CacheConfig = {}) {
  const cache = useCache(config)

  const _loadingCount = ref(0)
  const loading = computed(() => _loadingCount.value > 0)
  const error = ref<string | null>(null)

  // Mirror the prefix resolution that useCache performs internally so inflight keys
  // are consistent with the actual localStorage keys used by cache.set/get.
  const storagePrefix = config.storagePrefix ?? 'hivecom:cache:'
  const kvPrefix = `${storagePrefix}kv:`

  /**
   * Fetch data with cache-check, inflight deduplication, and loading/error management.
   *
   * Execution order:
   * 1. Return cached value when available (skipped when `force` is true).
   * 2. Join an existing in-flight request for the same key (skipped when `force` is true).
   * 3. Fire `fetchFn`, cache a non-null result, and manage `loading` / `error` state.
   *
   * `loading` is a `ComputedRef<boolean>` that only goes false when ALL concurrent
   * `withCache` calls have settled - safe to call in parallel.
   *
   * @param key - Logical cache key; same string you would pass to `cache.get`/`cache.set`.
   * @param fetchFn - Async factory that fetches and returns the data. Throw on error.
   * @param fetchFn.force - Bypass cache and inflight dedup, forcing a fresh fetch. Default: false.
   * @param fetchFn.ttl - Per-call TTL override in milliseconds.
   * @returns The fetched (or cached) value, or `null` on error or empty result.
   */
  async function withCache<T>(
    key: string,
    fetchFn: () => Promise<T | null>,
    opts?: { force?: boolean, ttl?: number },
  ): Promise<T | null> {
    // 1. Cache hit
    if (!opts?.force) {
      const cached = cache.get<T>(key)
      if (cached !== null)
        return cached
    }

    // 2. Inflight key built from the same prefix useCache uses for kv entries
    const inflightKey = `${kvPrefix}${key}`

    // 3. Join existing in-flight - cast is safe because the map was populated by
    //    a withCache<T> call with the same key, so the resolved type matches.
    if (!opts?.force) {
      const existing = _moduleInflight.get(inflightKey)
      if (existing !== undefined) {
        return existing as Promise<T | null>
      }
    }

    // 4. New fetch - increment loading counter and clear any previous error
    _loadingCount.value++
    error.value = null

    // 5. Build promise: cache on success, capture error on failure, always decrement
    const promise: Promise<T | null> = fetchFn()
      .then((result: T | null) => {
        // Only cache non-null results - cache.get returns null for both miss and
        // expired entries, so storing null would be indistinguishable from a miss.
        if (result !== null) {
          cache.set(key, result, opts?.ttl)
        }
        return result
      })
      .catch((err: unknown) => {
        error.value = err instanceof Error ? err.message : `Failed to fetch ${key}`
        return null
      })
      .finally(() => {
        _loadingCount.value--
        _moduleInflight.delete(inflightKey)
      })

    // 6. Register before returning so concurrent callers join this promise
    _moduleInflight.set(inflightKey, promise)

    // 7. Return - async machinery flattens Promise<Promise<T|null>> to Promise<T|null>
    return promise
  }

  /**
   * Registers a handler that fires when another browser tab deletes a cache key
   * belonging to this module's KV namespace.
   *
   * Uses the native `storage` event, which only fires for cross-tab writes (not
   * same-tab). This is the correct primitive for cross-tab cache invalidation.
   *
   * The handler receives the **logical key** (prefix stripped), matching the key
   * format passed to `withCache`. Only deletions are reported (`newValue === null`).
   *
   * Registration is tied to the component lifecycle via `onMounted`/`onUnmounted`.
   *
   * @param handler - Called with the logical key whenever another tab deletes it.
   */
  function onExternalInvalidation(handler: (key: string) => void): void {
    function handleStorage(event: StorageEvent): void {
      // SSR safety guard - storage events only make sense on the client
      if (typeof window === 'undefined')
        return
      // Deletions only
      if (event.newValue !== null)
        return
      // Ignore unrelated keys
      if (event.key == null)
        return
      if (!event.key.startsWith(kvPrefix))
        return
      // Strip prefix so caller receives the same key they passed to withCache
      const logicalKey = event.key.slice(kvPrefix.length)
      handler(logicalKey)
    }

    onMounted(() => {
      if (typeof window === 'undefined')
        return
      window.addEventListener('storage', handleStorage)
    })

    onUnmounted(() => {
      if (typeof window === 'undefined')
        return
      window.removeEventListener('storage', handleStorage)
    })
  }

  return {
    /** Raw `useCache` instance - use for multi-key ops, direct get/set/delete. */
    cache,
    /** True while any `withCache` call is in flight. Stacks correctly across concurrent calls. */
    loading,
    /** Last error message from a `withCache` call. Cleared at the start of each new call. */
    error,
    withCache,
    onExternalInvalidation,
  }
}
