// Result cache plus in-flight dedupe, so two callers asking for the same key at
// once share one run instead of each doing the whole expensive job.
export function keyedAsyncCache<K, V>(run: (key: K) => Promise<V>) {
  const cache = new Map<K, V>()
  const inflight = new Map<K, Promise<V>>()

  return {
    async get(key: K): Promise<V> {
      const cached = cache.get(key)
      if (cached !== undefined)
        return cached

      const existing = inflight.get(key)
      if (existing)
        return existing

      const job = run(key)
      inflight.set(key, job)
      try {
        const result = await job
        cache.set(key, result)
        return result
      }
      finally {
        inflight.delete(key)
      }
    },
  }
}
