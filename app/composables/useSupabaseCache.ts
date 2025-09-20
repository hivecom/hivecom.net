/**
 * Generic Supabase caching composable for better performance and reduced database load
 *
 * Features:
 * - Key-value caching for simple data
 * - Query signature caching for complex queries
 * - Automatic cache invalidation with TTL
 * - Cross-component cache sharing
 * - Memory-efficient with configurable size limits
 */

import type { Ref } from 'vue'
import type { Database } from '@/types/database.types'
import { computed, ref } from 'vue'

export interface CacheEntry<T = unknown> {
  data: T
  timestamp: number
  ttl: number // Time to live in milliseconds
}

export interface CacheConfig {
  ttl?: number // Default TTL in milliseconds (default: 5 minutes)
  maxSize?: number // Maximum number of entries (default: 1000)
  cleanupInterval?: number // Cleanup interval in milliseconds (default: 30 seconds)
}

export interface QueryCacheKey {
  table: keyof Database['public']['Tables']
  select?: string
  filters?: Record<string, unknown>
  filterOperators?: Record<string, 'eq' | 'ilike' | 'in' | 'is' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte'>
  orderBy?: Record<string, unknown>
  limit?: number
  single?: boolean
}

// Global cache stores
const keyValueCache = new Map<string, CacheEntry>()
const queryCache = new Map<string, CacheEntry>()

// Cache statistics for debugging
const cacheStats = ref({
  keyValueHits: 0,
  keyValueMisses: 0,
  queryHits: 0,
  queryMisses: 0,
  lastCleanup: 0,
})

let cleanupTimer: number | null = null

/**
 * Generate a consistent hash for query parameters
 */
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
          if (operator !== undefined) {
            acc[key] = operator
          }
          return acc
        }, {} as Record<string, string>)
      : {},
    orderBy: query.orderBy,
    limit: query.limit,
    single: query.single ?? false,
  }

  return btoa(JSON.stringify(normalizedQuery))
}

/**
 * Check if a cache entry is still valid
 */
function isEntryValid<T>(entry: CacheEntry<T>): boolean {
  return Date.now() - entry.timestamp < entry.ttl
}

/**
 * Clean up expired entries from cache
 */
function cleanupExpiredEntries() {
  const now = Date.now()

  // Clean key-value cache
  for (const [key, entry] of keyValueCache.entries()) {
    if (!isEntryValid(entry)) {
      keyValueCache.delete(key)
    }
  }

  // Clean query cache
  for (const [key, entry] of queryCache.entries()) {
    if (!isEntryValid(entry)) {
      queryCache.delete(key)
    }
  }

  cacheStats.value.lastCleanup = now
}

/**
 * Enforce cache size limits using LRU strategy
 */
function enforceCacheSizeLimit(cache: Map<string, CacheEntry>, maxSize: number) {
  if (cache.size <= maxSize)
    return

  // Convert to array and sort by timestamp (oldest first)
  const entries = Array.from(cache.entries()).sort((a, b) => a[1].timestamp - b[1].timestamp)

  // Remove oldest entries until we're under the limit
  const toRemove = cache.size - maxSize
  for (let i = 0; i < toRemove; i++) {
    const entry = entries[i]
    if (entry !== undefined) {
      cache.delete(entry[0])
    }
  }
}

/**
 * Initialize cleanup timer
 */
function initializeCleanup(interval: number) {
  if (cleanupTimer !== null)
    return

  // Only set up cleanup timer on the client side (not during SSR)
  if (typeof window !== 'undefined') {
    cleanupTimer = window.setInterval(() => {
      cleanupExpiredEntries()
    }, interval)
  }
}

/**
 * Main cache composable
 */
export function useSupabaseCache(config: CacheConfig = {}) {
  const {
    ttl = 5 * 60 * 1000, // 5 minutes default
    maxSize = 1000,
    cleanupInterval = 30 * 1000, // 30 seconds
  } = config

  // Initialize cleanup on first use
  initializeCleanup(cleanupInterval)

  /**
   * Cache data by key-value pair
   */
  function cacheSet<T>(key: string, data: T, customTtl?: number): void {
    const entry: CacheEntry<T> = {
      data,
      timestamp: Date.now(),
      ttl: customTtl ?? ttl,
    }

    keyValueCache.set(key, entry)
    enforceCacheSizeLimit(keyValueCache, maxSize)
  }

  /**
   * Get data by key
   */
  function cacheGet<T>(key: string): T | null {
    const entry = keyValueCache.get(key) as CacheEntry<T> | undefined

    if (!entry) {
      cacheStats.value.keyValueMisses++
      return null
    }

    if (!isEntryValid(entry)) {
      keyValueCache.delete(key)
      cacheStats.value.keyValueMisses++
      return null
    }

    cacheStats.value.keyValueHits++
    return entry.data
  }

  /**
   * Check if key exists and is valid
   */
  function cacheHas(key: string): boolean {
    const entry = keyValueCache.get(key)
    return entry ? isEntryValid(entry) : false
  }

  /**
   * Remove specific key from cache
   */
  function cacheDelete(key: string): boolean {
    return keyValueCache.delete(key)
  }

  /**
   * Cache a Supabase query result
   */
  function cacheQuery<T>(query: QueryCacheKey, data: T, customTtl?: number): void {
    const queryHash = generateQueryHash(query)
    const entry: CacheEntry<T> = {
      data,
      timestamp: Date.now(),
      ttl: customTtl ?? ttl,
    }

    queryCache.set(queryHash, entry)
    enforceCacheSizeLimit(queryCache, maxSize)
  }

  /**
   * Get cached query result
   */
  function getCachedQuery<T>(query: QueryCacheKey): T | null {
    const queryHash = generateQueryHash(query)
    const entry = queryCache.get(queryHash) as CacheEntry<T> | undefined

    if (!entry) {
      cacheStats.value.queryMisses++
      return null
    }

    if (!isEntryValid(entry)) {
      queryCache.delete(queryHash)
      cacheStats.value.queryMisses++
      return null
    }

    cacheStats.value.queryHits++
    return entry.data
  }

  /**
   * Check if query is cached and valid
   */
  function hasQuery(query: QueryCacheKey): boolean {
    const queryHash = generateQueryHash(query)
    const entry = queryCache.get(queryHash)
    return entry ? isEntryValid(entry) : false
  }

  /**
   * Invalidate cache entries by pattern or table
   */
  function invalidateByPattern(pattern: string | RegExp): number {
    let removed = 0

    // Invalidate key-value cache
    for (const key of keyValueCache.keys()) {
      if (typeof pattern === 'string' ? key.includes(pattern) : pattern.test(key)) {
        keyValueCache.delete(key)
        removed++
      }
    }

    return removed
  }

  /**
   * Invalidate all queries for a specific table
   */
  function invalidateTable(tableName: string): number {
    let removed = 0

    for (const [queryHash, _entry] of queryCache.entries()) {
      // Decode the hash to check the table name
      try {
        const queryData = JSON.parse(atob(queryHash)) as QueryCacheKey
        if (queryData.table === tableName) {
          queryCache.delete(queryHash)
          removed++
        }
      }
      catch {
        // If we can't decode the hash, it's probably corrupted, remove it
        queryCache.delete(queryHash)
        removed++
      }
    }

    return removed
  }

  /**
   * Clear all cache
   */
  function clearCache(): void {
    keyValueCache.clear()
    queryCache.clear()
    cacheStats.value = {
      keyValueHits: 0,
      keyValueMisses: 0,
      queryHits: 0,
      queryMisses: 0,
      lastCleanup: Date.now(),
    }
  }

  /**
   * Dispose of cleanup timer
   */
  function dispose(): void {
    if (cleanupTimer !== null && typeof window !== 'undefined') {
      window.clearInterval(cleanupTimer)
      cleanupTimer = null
    }
  }

  /**
   * Get cache statistics
   */
  const stats = computed(() => ({
    ...cacheStats.value,
    keyValueSize: keyValueCache.size,
    querySize: queryCache.size,
    keyValueHitRate: cacheStats.value.keyValueHits / (cacheStats.value.keyValueHits + cacheStats.value.keyValueMisses) || 0,
    queryHitRate: cacheStats.value.queryHits / (cacheStats.value.queryHits + cacheStats.value.queryMisses) || 0,
  }))

  return {
    // Key-value cache methods
    set: cacheSet,
    get: cacheGet,
    has: cacheHas,
    delete: cacheDelete,

    // Query cache methods
    cacheQuery,
    getCachedQuery,
    hasQuery,

    // Invalidation methods
    invalidateByPattern,
    invalidateTable,
    clearCache,

    // Cleanup
    dispose,

    // Statistics
    stats,
  }
}

/**
 * Cached Supabase query composable
 * Automatically handles caching for Supabase queries
 */
export function useCachedSupabaseQuery<T = unknown>(
  query: QueryCacheKey,
  config: CacheConfig & {
    enabled?: Ref<boolean> | boolean
    refetchOnMount?: boolean
  } = {},
) {
  const {
    enabled = ref(true),
    refetchOnMount = true,
    ...cacheConfig
  } = config

  const cache = useSupabaseCache(cacheConfig)
  const supabase = useSupabaseClient<Database>()

  const data = ref<T | null>(null) as Ref<T | null>
  const loading = ref(false)
  const error = ref<string | null>(null)

  /**
   * Execute the Supabase query
   */
  async function executeQuery(): Promise<T | null> {
    try {
      let queryBuilder = supabase.from(query.table).select(query.select ?? '*')

      // Apply filters
      if (query.filters) {
        for (const [key, value] of Object.entries(query.filters)) {
          const operator = query.filterOperators?.[key] ?? 'eq'

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
                if (Array.isArray(value)) {
                  queryBuilder = queryBuilder.in(key, value)
                }
                break
              case 'is':
                if (value === null || typeof value === 'boolean') {
                  queryBuilder = queryBuilder.is(key, value)
                }
                break
              default:
                queryBuilder = queryBuilder.eq(key, value)
            }
          }
        }
      }

      // Apply ordering
      if (query.orderBy) {
        for (const [column, direction] of Object.entries(query.orderBy)) {
          queryBuilder = queryBuilder.order(column, {
            ascending: direction === 'asc',
          })
        }
      }

      // Apply limit
      if (query.limit !== null && query.limit !== undefined && query.limit > 0) {
        queryBuilder = queryBuilder.limit(query.limit)
      }

      // Execute query
      const result = query.single
        ? await queryBuilder.single()
        : await queryBuilder

      if (result.error) {
        throw result.error
      }

      return result.data as T
    }
    catch (err) {
      console.error('Query execution error:', err)
      throw err
    }
  }

  /**
   * Fetch data with caching
   */
  async function fetch(force = false): Promise<void> {
    if (!unref(enabled))
      return

    // Check cache first unless forced
    if (!force) {
      const cachedResult = cache.getCachedQuery<T>(query)
      if (cachedResult !== null) {
        data.value = cachedResult
        return
      }
    }

    loading.value = true
    error.value = null

    try {
      const result = await executeQuery()
      data.value = result

      // Cache the result
      cache.cacheQuery(query, result)
    }
    catch (err) {
      console.error('Error fetching data:', err)
      error.value = err instanceof Error ? err.message : 'Failed to fetch data'
      data.value = null
    }
    finally {
      loading.value = false
    }
  }

  /**
   * Refetch data (bypasses cache)
   */
  async function refetch(): Promise<void> {
    await fetch(true)
  }

  // Auto-fetch on mount if enabled
  if (refetchOnMount) {
    onMounted(() => {
      void fetch()
    })
  }

  // Watch for enabled changes
  watch(() => unref(enabled), (newEnabled) => {
    if (newEnabled && refetchOnMount) {
      void fetch()
    }
  })

  return {
    data: readonly(data),
    loading: readonly(loading),
    error: readonly(error),
    fetch,
    refetch,
    invalidate: () => cache.invalidateTable(query.table),
  }
}
