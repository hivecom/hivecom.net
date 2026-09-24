// localStorage-backed cache, shared across components and reloads. Client-only:
// on SSR every read returns null and writes are no-ops.

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

  /** Namespace prefix for localStorage keys, ending in ':'. Default: 'hivecom:cache:'. */
  storagePrefix?: string

  /** Entry budget for the kv namespace, enforced by LRU eviction. Default: 500. */
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

// storagePrefix to maxEntries, so the cleanup timer knows each prefix's budget.
const activeLocalStoragePrefixes = new Map<string, number>()

let cleanupTimer: number | null = null

interface StatsEntry {
  keyValueHits: number
  keyValueMisses: number
  queryHits: number
  queryMisses: number
  lastCleanup: number
}

const _statsPerPrefix = new Map<string, StatsEntry>()

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
// In memory only, so it resets on reload and LRU falls back to the entry's
// creation timestamp.

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
    // Quota exceeded: evict LRU down to 50% of the budget and retry once.
    evictLRU(prefix, Math.floor(maxEntries * 0.5))
    try {
      window.localStorage.setItem(fullKey, JSON.stringify(entry))
      touchEntry(fullKey)
    }
    catch {
      // localStorage unavailable (private mode, storage disabled). Reads just miss.
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

// Snapshotted up front so callers can mutate localStorage while iterating.
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
        // Corrupt entry, treat as oldest so it goes first.
        lastAccessed = 0
      }
    }

    candidates.push({ fullKey, lastAccessed })
  }

  if (candidates.length <= keepCount)
    return

  candidates.sort((a, b) => a.lastAccessed - b.lastAccessed)

  const toEvict = candidates.length - keepCount
  for (let i = 0; i < toEvict; i++) {
    const c = candidates[i]!
    window.localStorage.removeItem(c.fullKey)
    _accessTimes.delete(c.fullKey)
  }
}

// ── Cleanup ────────────────────────────────────────────────────────────────────

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
      keysToRemove.push(fullKey)
    }
  }

  keysToRemove.forEach((k) => {
    window.localStorage.removeItem(k)
    _accessTimes.delete(k)
  })

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

  activeLocalStoragePrefixes.set(storagePrefix, maxEntries)
  initializeCleanup(cleanupInterval)

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

  // Returns null while hydrating. The server never saw localStorage, so seeding a
  // ref from it on first render is a hydration mismatch. Pair with an onMounted fetch.
  function cacheGetInitial<T>(key: string): T | null {
    if (tryUseNuxtApp()?.isHydrating === true)
      return null

    return cacheGet<T>(key)
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
    set: cacheSet,
    get: cacheGet,
    getInitial: cacheGetInitial,
    has: cacheHas,
    delete: cacheDelete,

    cacheQuery,
    getCachedQuery,
    hasQuery,

    invalidateByPattern,
    invalidateTable,
    clearCache,

    dispose,

    getStats: getCacheStats,
  }
}

// A query that resolves to null means "not ready" and suppresses fetching like `enabled: false`.
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

  // Must mirror useCache's qPrefix so the storage listener matches only our keys.
  const _storagePrefix = cacheConfig.storagePrefix ?? LS_DEFAULT_PREFIX
  const _qPrefix = `${_storagePrefix}q:`

  const data = ref<T | null>(null) as Ref<T | null>
  const loading = ref(false)
  const error = ref<string | null>(null)

  // True only while we have nothing to show yet. Background refreshes keep
  // `loading` true but leave this false, so views can hold the current data
  // instead of flashing a placeholder and coming back with the same values.
  const initialLoading = computed(() => loading.value && data.value === null)

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

    // A forced refetch drops the inflight entry so joiners don't get data from
    // the previous request.
    if (force)
      _inflightQueries.delete(hash)

    // Joiners copy the result into their own ref. Only the original caller
    // writes the cache.
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
        // PostgrestError is a plain object, not an Error subclass, so check for
        // a message property too.
        const message
          = err instanceof Error
            ? err.message
            : (err !== null && typeof err === 'object' && 'message' in err && typeof (err as Record<string, unknown>).message === 'string')
                ? (err as Record<string, unknown>).message as string
                : 'Failed to fetch data'
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

  // Watch the stable hash so key ordering in filters/orderBy can't trigger a refetch.
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
    initialLoading,
    error: readonly(error),
    fetch,
    refetch,
    invalidate,
  }
}
