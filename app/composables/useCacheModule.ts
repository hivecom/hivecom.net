import type { CacheConfig } from './useCache'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useCache } from './useCache'

// Shared by every instance so concurrent callers with the same namespace and key
// dedupe across component trees. Keyed by the full localStorage KV path.
const _moduleInflight = new Map<string, Promise<unknown>>()

// Cache-checked fetches with inflight dedup and loading/error state, for the
// useData* composables.
export function useCacheModule(config: CacheConfig = {}) {
  const cache = useCache(config)

  const _loadingCount = ref(0)
  const loading = computed(() => _loadingCount.value > 0)
  const error = ref<string | null>(null)

  // Mirrors useCache's prefix resolution so inflight keys match the real
  // localStorage keys.
  const storagePrefix = config.storagePrefix ?? 'hivecom:cache:'
  const kvPrefix = `${storagePrefix}kv:`

  /**
   * force skips both the cache and inflight dedup. ttl is in ms. fetchFn should
   * throw on error. Returns null on error or an empty result.
   */
  async function withCache<T>(
    key: string,
    fetchFn: () => Promise<T | null>,
    opts?: { force?: boolean, ttl?: number },
  ): Promise<T | null> {
    if (!opts?.force) {
      const cached = cache.get<T>(key)
      if (cached !== null)
        return cached
    }

    const inflightKey = `${kvPrefix}${key}`

    // The cast is safe: the entry came from a withCache<T> call with the same key.
    if (!opts?.force) {
      const existing = _moduleInflight.get(inflightKey)
      if (existing !== undefined) {
        return existing as Promise<T | null>
      }
    }

    _loadingCount.value++
    error.value = null

    const promise: Promise<T | null> = fetchFn()
      .then((result: T | null) => {
        // cache.get returns null for a miss, so a stored null would read as one.
        if (result !== null) {
          cache.set(key, result, opts?.ttl)
        }
        return result
      })
      .catch((err: unknown) => {
        // PostgrestError is a plain object, not an Error, so check for a message.
        const message
          = err instanceof Error
            ? err.message
            : (err !== null && typeof err === 'object' && 'message' in err && typeof (err as Record<string, unknown>).message === 'string')
                ? (err as Record<string, unknown>).message as string
                : `Failed to fetch ${key}`
        error.value = message
        return null
      })
      .finally(() => {
        _loadingCount.value--
        _moduleInflight.delete(inflightKey)
      })

    // Register before returning so concurrent callers join this promise.
    _moduleInflight.set(inflightKey, promise)

    return promise
  }

  /**
   * Fires when another tab deletes a key in this namespace. The storage event
   * never fires for same-tab writes. The handler gets the key without its prefix.
   */
  function onExternalInvalidation(handler: (key: string) => void): void {
    function handleStorage(event: StorageEvent): void {
      if (typeof window === 'undefined')
        return

      // A null newValue means the key was deleted.
      if (event.newValue !== null)
        return

      if (event.key == null)
        return
      if (!event.key.startsWith(kvPrefix))
        return

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
    cache,
    loading,
    /** Cleared at the start of each withCache call. */
    error,
    withCache,
    onExternalInvalidation,
  }
}
