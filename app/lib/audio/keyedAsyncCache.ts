// The cache + in-flight dedupe pattern decode.ts and waveform.ts both run:
// return the cached result for a key, else join the in-flight job for that key,
// else run the job once, cache it, and let everyone awaiting it share the one
// result. Without the in-flight map two callers asking for the same key at the
// same time (the waveform and the spectrum mount together) would each do the
// whole expensive job.
//
// Pulled out so a module just declares one of these per key space instead of
// hand-rolling two Maps and the try/finally each time.
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
