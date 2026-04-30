/**
 * Generic Supabase caching composable for better performance and reduced database load
 *
 * Features:
 * - Key-value caching for simple data
 * - Query signature caching for complex queries
 * - Automatic cache invalidation with TTL
 * - Cross-component and cross-reload cache sharing via localStorage
 * - LRU eviction with configurable entry limit
 * - Quota-error recovery (evict + retry on write failure)
 *
 * All entries are stored in localStorage and TTL-checked on every read.
 * A background cleanup timer sweeps expired entries and enforces the entry
 * budget periodically. On SSR (no window), all reads return null and writes
 * are no-ops — caching is a client-side optimisation only.
 */

import type { MaybeRefOrGetter, Ref } from 'vue'
import type { Database } from '@/types/database.types'
import { ref, toValue, watch } from 'vue'

export interface CacheEntry<T = unknown> {
  data: T
  timestamp: number
  ttl: number
}

export interface CacheConfig {
  /** Default TTL in milliseconds. Default: 5 minutes. */
  ttl?: number
  /** Cleanup interval in milliseconds. Default: 30 seconds. */
  cleanupInterval?: number
  /**
   * Namespace prefix for localStorage keys. Should end with ':'.
   * KV entries land at `${prefix}kv:${key}`, query entries at `${prefix}q:${hash}`.
   * Default: 'hivecom:cache:'.
   */
  storagePrefix?: string
  /**
   * Maximum number of entries allowed in the kv namespace.
   * When the limit is reached during cleanup, or when a write fails due to
   * quota exhaustion, the least-recently-used entries are evicted first.
   * Default: 500.
   */
  maxEntries?: number
}

export interface QueryCacheKey {
  table: keyof Database['public']['Tables']
  select?: string
  filters?: Record<string, unknown>
  filterOperators?: Record<string, 'eq' | 'ilike' | 'in' | 'is' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte'>
  orderBy?: Record<string, 'asc' | 'desc'>
  limit?: number
  single?: boolean
  maybeSingle?: boolean
}

// ── Shared module-level state ──────────────────────────────────────────────────

const LS_DEFAULT_PREFIX = 'hivecom:cache:'

/**
 * Maps storagePrefix → maxEntries so the cleanup timer knows each prefix's budget.
 * Using a Map rather than a Set so we can store the budget alongside the prefix.
 */
const activeLocalStoragePrefixes = new Map<string, number>()

let cleanupTimer: number | null = null

interface StatsEntry {
  keyValueHits: number
  keyValueMisses: number
  queryHits: number
  queryMisses: number
  lastCleanup: number
}

/** Per-namespace stats map, keyed by storagePrefix. */
const _statsPerPrefix = new Map<string, StatsEntry>()

/** Gets (or lazily creates) the stats object for a given storagePrefix. */
function getStats(prefix: string): StatsEntry {
  let entry = _statsPerPrefix.get(prefix)
  if (!entry) {
    entry = { keyValueHits: 0, keyValueMisses: 0, queryHits: 0, queryMisses: 0, lastCleanup: 0 }
    _statsPerPrefix.set(prefix, entry)
  }
  return entry
}

// ── In-memory access-time tracking ────────────────────────────────────────────
//
// Keyed by the full localStorage key (prefix + logical key).
// Updated on every valid cache read so LRU eviction prefers entries that
// haven't been touched recently. Resets on page reload; the entry's own
// `timestamp` (creation time) is used as a fallback for ordering.

const _accessTimes = new Map<string, number>()

// Tracks in-flight network requests by query hash so concurrent callers
// can join an existing request rather than firing duplicate network calls.
const _inflightQueries = new Map<string, Promise<{ data: unknown, error: string | null }>>()

function touchEntry(fullKey: string): void {
  _accessTimes.set(fullKey, Date.now())
}

function lastAccessedOf(fullKey: string, entry: CacheEntry): number {
  return _accessTimes.get(fullKey) ?? entry.timestamp
}

// ── localStorage primitives ────────────────────────────────────────────────────

function lsGet<T>(prefix: string, key: string): CacheEntry<T> | null {
  if (typeof window === 'undefined')
    return null
  try {
    const raw = window.localStorage.getItem(`${prefix}${key}`)
    if (raw == null)
      return null
    return JSON.parse(raw) as CacheEntry<T>
  }
  catch {
    return null
  }
}

/**
 * Write an entry to localStorage.
 * If the write fails (quota exceeded), evict LRU entries from the given
 * namespace down to `keepOnFail` entries and retry once.
 */
function lsSet<T>(
  prefix: string,
  key: string,
  entry: CacheEntry<T>,
  maxEntries: number,
): void {
  if (typeof window === 'undefined')
    return

  const fullKey = `${prefix}${key}`

  try {
    window.localStorage.setItem(fullKey, JSON.stringify(entry))
    touchEntry(fullKey)
  }
  catch {
    // Quota exceeded — evict LRU down to 50 % of the budget and retry once
    evictLRU(prefix, Math.floor(maxEntries * 0.5))
    try {
      window.localStorage.setItem(fullKey, JSON.stringify(entry))
      touchEntry(fullKey)
    }
    catch {
      // localStorage genuinely unavailable (private mode, storage disabled) —
      // silently skip; reads will just be cache misses
    }
  }
}

function lsDelete(prefix: string, key: string): boolean {
  if (typeof window === 'undefined')
    return false
  const fullKey = `${prefix}${key}`
  const had = window.localStorage.getItem(fullKey) != null
  window.localStorage.removeItem(fullKey)
  _accessTimes.delete(fullKey)
  return had
}

/**
 * Snapshot all logical keys (prefix stripped) under the given full prefix.
 * Snapshotted up-front so callers can safely mutate localStorage while iterating.
 */
function lsKeys(prefix: string): string[] {
  if (typeof window === 'undefined')
    return []
  const keys: string[] = []
  for (let i = 0; i < window.localStorage.length; i++) {
    const fullKey = window.localStorage.key(i)
    if (fullKey != null && fullKey.startsWith(prefix))
      keys.push(fullKey.slice(prefix.length))
  }
  return keys
}

function lsClearPrefix(prefix: string): void {
  if (typeof window === 'undefined')
    return
  const keysToRemove: string[] = []
  for (let i = 0; i < window.localStorage.length; i++) {
    const k = window.localStorage.key(i)
    if (k != null && k.startsWith(prefix))
      keysToRemove.push(k)
  }
  keysToRemove.forEach((k) => {
    window.localStorage.removeItem(k)
    _accessTimes.delete(k)
  })
}

function lsSize(prefix: string): number {
  if (typeof window === 'undefined')
    return 0
  let count = 0
  for (let i = 0; i < window.localStorage.length; i++) {
    const k = window.localStorage.key(i)
    if (k != null && k.startsWith(prefix))
      count++
  }
  return count
}

function isEntryValid<T>(entry: CacheEntry<T>): boolean {
  return Date.now() - entry.timestamp < entry.ttl
}

// ── LRU eviction ──────────────────────────────────────────────────────────────

/**
 * Evict entries under `prefix` until at most `keepCount` remain.
 * Entries are sorted by last-access time ascending (least recently used first).
 * Falls back to `entry.timestamp` (creation time) for entries not yet touched
 * in the current session.
 */
function evictLRU(prefix: string, keepCount: number): void {
  if (typeof window === 'undefined' || keepCount < 0)
    return

  const candidates: { fullKey: string, lastAccessed: number }[] = []

  for (let i = 0; i < window.localStorage.length; i++) {
    const fullKey = window.localStorage.key(i)
    if (fullKey == null || !fullKey.startsWith(prefix))
      continue

    const raw = window.localStorage.getItem(fullKey)
    let lastAccessed = 0

    if (raw != null) {
      try {
        const entry = JSON.parse(raw) as CacheEntry
        lastAccessed = lastAccessedOf(fullKey, entry)
      }
      catch {
        // Corrupt entry — treat as oldest so it gets evicted first
        lastAccessed = 0
      }
    }

    candidates.push({ fullKey, lastAccessed })
  }

  if (candidates.length <= keepCount)
    return

  // Sort ascending — LRU (least recently used) first
  candidates.sort((a, b) => a.lastAccessed - b.lastAccessed)

  const toEvict = candidates.length - keepCount
  for (let i = 0; i < toEvict; i++) {
    const c = candidates[i]!
    window.localStorage.removeItem(c.fullKey)
    _accessTimes.delete(c.fullKey)
  }
}

// ── Cleanup ────────────────────────────────────────────────────────────────────

/**
 * Remove expired entries under the given prefix, then enforce the entry
 * budget via LRU eviction if the kv sub-namespace is still over budget.
 */
function cleanupPrefix(storagePrefix: string, maxEntries: number): void {
  if (typeof window === 'undefined')
    return

  const now = Date.now()
  const keysToRemove: string[] = []

  for (let i = 0; i < window.localStorage.length; i++) {
    const fullKey = window.localStorage.key(i)
    if (fullKey == null || !fullKey.startsWith(storagePrefix))
      continue

    const raw = window.localStorage.getItem(fullKey)
    if (raw == null) {
      keysToRemove.push(fullKey)
      continue
    }

    try {
      const entry = JSON.parse(raw) as CacheEntry
      if (now - entry.timestamp >= entry.ttl)
        keysToRemove.push(fullKey)
    }
    catch {
      // Corrupt entry — evict
      keysToRemove.push(fullKey)
    }
  }

  keysToRemove.forEach((k) => {
    window.localStorage.removeItem(k)
    _accessTimes.delete(k)
  })

  // After TTL cleanup, enforce maxEntries on the kv sub-namespace via LRU
  const kvPrefix = `${storagePrefix}kv:`
  if (lsSize(kvPrefix) > maxEntries)
    evictLRU(kvPrefix, Math.floor(maxEntries * 0.8))
}

function cleanupAll(): void {
  const now = Date.now()
  for (const [prefix, maxEntries] of activeLocalStoragePrefixes) {
    cleanupPrefix(prefix, maxEntries)
    getStats(prefix).lastCleanup = now
  }
}

function initializeCleanup(interval: number): void {
  if (cleanupTimer !== null)
    return
  if (typeof window !== 'undefined') {
    cleanupTimer = window.setInterval(cleanupAll, interval)
  }
}

// ── Query hash ─────────────────────────────────────────────────────────────────

function generateQueryHash(query: QueryCacheKey): string {
  const normalizedQuery = {
    table: query.table,
    select: query.select ?? '*',
    filters: query.filters
      ? Object.keys(query.filters).sort().reduce((acc, key) => {
          acc[key] = query.filters![key]
          return acc
        }, {} as Record<string, unknown>)
      : {},
    filterOperators: query.filterOperators
      ? Object.keys(query.filterOperators).sort().reduce((acc, key) => {
          const operator = query.filterOperators![key]
          if (operator !== undefined)
            acc[key] = operator
          return acc
        }, {} as Record<string, string>)
      : {},
    orderBy: query.orderBy
      ? Object.keys(query.orderBy).sort().reduce((acc, key) => {
          acc[key] = query.orderBy![key]!
          return acc
        }, {} as Record<string, 'asc' | 'desc'>)
      : undefined,
    limit: query.limit,
    single: query.single ?? false,
    maybeSingle: query.maybeSingle ?? false,
  }
  // encodeURIComponent ensures non-Latin1 characters (emoji, Unicode usernames
  // in filter values) are ASCII-safe before btoa encodes the string.
  return btoa(encodeURIComponent(JSON.stringify(normalizedQuery)))
}

// ── Main composable ────────────────────────────────────────────────────────────

export function useCache(config: CacheConfig = {}) {
  const {
    ttl = 5 * 60 * 1000,
    cleanupInterval = 30 * 1000,
    storagePrefix = LS_DEFAULT_PREFIX,
    maxEntries = 500,
  } = config

  const kvPrefix = `${storagePrefix}kv:`
  const qPrefix = `${storagePrefix}q:`

  // Register/update this prefix so the cleanup timer knows its budget
  activeLocalStoragePrefixes.set(storagePrefix, maxEntries)
  initializeCleanup(cleanupInterval)

  // Auto-dispose when the owning scope (component, composable) is torn down
  if (getCurrentScope())
    onScopeDispose(dispose)

  // ── Key-value cache ──────────────────────────────────────────────────────────

  function cacheSet<T>(key: string, data: T, customTtl?: number): void {
    lsSet(kvPrefix, key, { data, timestamp: Date.now(), ttl: customTtl ?? ttl }, maxEntries)
  }

  function cacheGet<T>(key: string): T | null {
    const entry = lsGet<T>(kvPrefix, key)
    if (entry == null) {
      getStats(storagePrefix).keyValueMisses++
      return null
    }
    if (!isEntryValid(entry)) {
      lsDelete(kvPrefix, key)
      getStats(storagePrefix).keyValueMisses++
      return null
    }
    touchEntry(`${kvPrefix}${key}`)
    getStats(storagePrefix).keyValueHits++
    return entry.data
  }

  function cacheHas(key: string): boolean {
    const entry = lsGet(kvPrefix, key)
    if (entry == null)
      return false
    if (!isEntryValid(entry)) {
      lsDelete(kvPrefix, key)
      return false
    }
    touchEntry(`${kvPrefix}${key}`)
    return true
  }

  function cacheDelete(key: string): boolean {
    return lsDelete(kvPrefix, key)
  }

  // ── Query cache ──────────────────────────────────────────────────────────────

  function cacheQuery<T>(query: QueryCacheKey, data: T, customTtl?: number): void {
    const hash = generateQueryHash(query)
    // Query entries tend to be small; evict at a generous cap if quota is hit
    lsSet(qPrefix, hash, { data, timestamp: Date.now(), ttl: customTtl ?? ttl }, maxEntries)
  }

  function getCachedQuery<T>(query: QueryCacheKey): T | null {
    const hash = generateQueryHash(query)
    const entry = lsGet<T>(qPrefix, hash)
    if (entry == null) {
      getStats(storagePrefix).queryMisses++
      return null
    }
    if (!isEntryValid(entry)) {
      lsDelete(qPrefix, hash)
      getStats(storagePrefix).queryMisses++
      return null
    }
    touchEntry(`${qPrefix}${hash}`)
    getStats(storagePrefix).queryHits++
    return entry.data
  }

  function hasQuery(query: QueryCacheKey): boolean {
    const hash = generateQueryHash(query)
    const entry = lsGet(qPrefix, hash)
    if (entry == null)
      return false
    if (!isEntryValid(entry)) {
      lsDelete(qPrefix, hash)
      return false
    }
    touchEntry(`${qPrefix}${hash}`)
    return true
  }

  // ── Invalidation ─────────────────────────────────────────────────────────────

  function invalidateByPattern(pattern: string | RegExp): number {
    let removed = 0
    for (const key of lsKeys(kvPrefix)) {
      const matches = typeof pattern === 'string' ? key.includes(pattern) : pattern.test(key)
      if (matches) {
        lsDelete(kvPrefix, key)
        removed++
      }
    }
    return removed
  }

  function invalidateTable(tableName: string): number {
    let removed = 0
    for (const hash of lsKeys(qPrefix)) {
      try {
        const queryData = JSON.parse(decodeURIComponent(atob(hash))) as QueryCacheKey
        if (queryData.table === tableName) {
          lsDelete(qPrefix, hash)
          removed++
        }
      }
      catch {
        lsDelete(qPrefix, hash)
        removed++
      }
    }
    return removed
  }

  function clearCache(): void {
    lsClearPrefix(kvPrefix)
    lsClearPrefix(qPrefix)
    const stats = getStats(storagePrefix)
    stats.keyValueHits = 0
    stats.keyValueMisses = 0
    stats.queryHits = 0
    stats.queryMisses = 0
    stats.lastCleanup = Date.now()
  }

  function dispose(): void {
    activeLocalStoragePrefixes.delete(storagePrefix)
    if (activeLocalStoragePrefixes.size === 0 && cleanupTimer !== null && typeof window !== 'undefined') {
      window.clearInterval(cleanupTimer)
      cleanupTimer = null
    }
  }

  function getCacheStats() {
    const stats = getStats(storagePrefix)
    return {
      ...stats,
      keyValueSize: lsSize(kvPrefix),
      querySize: lsSize(qPrefix),
      keyValueHitRate: stats.keyValueHits / (stats.keyValueHits + stats.keyValueMisses) || 0,
      queryHitRate: stats.queryHits / (stats.queryHits + stats.queryMisses) || 0,
    }
  }

  return {
    // Key-value
    set: cacheSet,
    get: cacheGet,
    has: cacheHas,
    delete: cacheDelete,

    // Query
    cacheQuery,
    getCachedQuery,
    hasQuery,

    // Invalidation
    invalidateByPattern,
    invalidateTable,
    clearCache,

    // Cleanup
    dispose,

    // Statistics
    getStats: getCacheStats,
  }
}

/**
 * Reactive cached Supabase query composable.
 *
 * Accepts a reactive query (MaybeRefOrGetter) so filter values derived from
 * props, route params, or other reactive state are always reflected correctly.
 * Passing `null` as the resolved query value is treated as "not ready" and
 * suppresses fetching the same way `enabled: false` does.
 */
export function useCachedFetch<T = unknown>(
  query: MaybeRefOrGetter<QueryCacheKey | null>,
  config: CacheConfig & {
    enabled?: MaybeRefOrGetter<boolean>
    refetchOnMount?: boolean
  } = {},
) {
  const {
    enabled = true,
    refetchOnMount = true,
    ...cacheConfig
  } = config

  const cache = useCache(cacheConfig)
  const supabase = useSupabaseClient<Database>()

  // Derived prefix mirrors the internal qPrefix used by useCache so the
  // storage event listener can match only relevant localStorage keys.
  const _storagePrefix = cacheConfig.storagePrefix ?? LS_DEFAULT_PREFIX
  const _qPrefix = `${_storagePrefix}q:`

  const data = ref<T | null>(null) as Ref<T | null>
  const loading = ref(false)
  const error = ref<string | null>(null)

  function resolvedQuery(): QueryCacheKey | null {
    return toValue(query)
  }

  function isEnabled(): boolean {
    return toValue(enabled)
  }

  async function executeQuery(q: QueryCacheKey): Promise<T | null> {
    let queryBuilder = supabase.from(q.table).select(q.select ?? '*')

    if (q.filters) {
      for (const [key, value] of Object.entries(q.filters)) {
        const operator = q.filterOperators?.[key] ?? 'eq'

        if (Array.isArray(value)) {
          queryBuilder = queryBuilder.in(key, value)
        }
        else if (value === null) {
          queryBuilder = queryBuilder.is(key, null)
        }
        else if (value !== undefined) {
          switch (operator) {
            case 'eq':
              queryBuilder = queryBuilder.eq(key, value)
              break
            case 'ilike':
              queryBuilder = queryBuilder.ilike(key, value as string)
              break
            case 'neq':
              queryBuilder = queryBuilder.neq(key, value)
              break
            case 'gt':
              queryBuilder = queryBuilder.gt(key, value)
              break
            case 'gte':
              queryBuilder = queryBuilder.gte(key, value)
              break
            case 'lt':
              queryBuilder = queryBuilder.lt(key, value)
              break
            case 'lte':
              queryBuilder = queryBuilder.lte(key, value)
              break
            case 'in':
              if (Array.isArray(value))
                queryBuilder = queryBuilder.in(key, value)
              break
            case 'is':
              if (value === null || typeof value === 'boolean')
                queryBuilder = queryBuilder.is(key, value)
              break
            default:
              queryBuilder = queryBuilder.eq(key, value)
          }
        }
      }
    }

    if (q.orderBy) {
      for (const [column, direction] of Object.entries(q.orderBy)) {
        queryBuilder = queryBuilder.order(column, { ascending: direction === 'asc' })
      }
    }

    if (q.limit != null && q.limit > 0)
      queryBuilder = queryBuilder.limit(q.limit)

    const result = q.single
      ? await queryBuilder.single()
      : q.maybeSingle
        ? await queryBuilder.maybeSingle()
        : await queryBuilder

    if (result.error)
      throw result.error

    return result.data as T
  }

  async function fetch(force = false): Promise<void> {
    const q = resolvedQuery()
    if (q === null || !isEnabled())
      return

    if (!force) {
      const cached = cache.getCachedQuery<T>(q)
      if (cached !== null) {
        data.value = cached
        return
      }
    }

    const hash = generateQueryHash(q)

    // On a forced refetch, drop any stale inflight entry so joiners don't
    // receive data from the previous in-progress request.
    if (force)
      _inflightQueries.delete(hash)

    // Join an existing in-flight request rather than firing a duplicate query.
    // Joiners await the same promise; the original caller populates the cache
    // and sets data.value — joiners copy the resolved value into their own ref.
    if (_inflightQueries.has(hash)) {
      const { data: result, error: joinError } = await (_inflightQueries.get(hash) as Promise<{ data: T | null, error: string | null }>)
      if (result !== null)
        data.value = result
      if (joinError !== null)
        error.value = joinError
      return
    }

    loading.value = true
    error.value = null

    const promise: Promise<{ data: T | null, error: string | null }> = executeQuery(q)
      .then((result) => {
        data.value = result
        cache.cacheQuery(q, result)
        return { data: result, error: null }
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : 'Failed to fetch data'
        error.value = message
        data.value = null
        return { data: null, error: message }
      })
      .finally(() => {
        loading.value = false
        _inflightQueries.delete(hash)
      })

    _inflightQueries.set(hash, promise)
    await promise
  }

  async function refetch(): Promise<void> {
    await fetch(true)
  }

  if (refetchOnMount) {
    onMounted(() => {
      void fetch()
    })
  }

  // Use the stable query hash as the watch key — avoids spurious refetches
  // caused by object key ordering differences in filters/orderBy.
  watch(
    () => {
      const q = resolvedQuery()
      return q !== null ? generateQueryHash(q) : null
    },
    () => {
      if (isEnabled())
        void fetch()
    },
  )

  watch(
    () => isEnabled(),
    (nowEnabled) => {
      if (nowEnabled)
        void fetch()
    },
  )

  function invalidate(): number {
    const q = resolvedQuery()
    return q ? cache.invalidateTable(q.table) : 0
  }

  // ── Cross-tab invalidation ───────────────────────────────────────────────────
  // When another tab removes a matching query entry from localStorage, refetch
  // so both tabs stay coherent without an explicit invalidation call.
  function handleStorageEvent(event: StorageEvent): void {
    if (event.newValue !== null)
      return
    if (!event.key?.startsWith(_qPrefix))
      return
    const q = resolvedQuery()
    if (!q || !isEnabled())
      return
    if (event.key === `${_qPrefix}${generateQueryHash(q)}`)
      void fetch(true)
  }

  onMounted(() => {
    window.addEventListener('storage', handleStorageEvent)
  })

  onUnmounted(() => {
    window.removeEventListener('storage', handleStorageEvent)
  })

  return {
    data: readonly(data),
    loading: readonly(loading),
    error: readonly(error),
    fetch,
    refetch,
    invalidate,
  }
}
