/**
 * Generic factory for badge-count composables.
 *
 * All three badge-count composables (discussion replies, discussions started,
 * party animal RSVPs) share identical scaffolding - the only thing that differs
 * between them is the Supabase query that produces the count.  This factory
 * captures the shared scaffold once and lets each concrete composable supply
 * only its query callback and default options.
 *
 * Usage:
 *
 *   const { count, loading, error, refresh, invalidate } = useBadgeCount(userId, {
 *     cacheKeyPrefix: 'user:badge:my_badge',
 *     fetchCount: async (supabase, profileId) => {
 *       const { count, error } = await supabase
 *         .from('some_table')
 *         .select('id', { count: 'exact', head: true })
 *         .eq('user_id', profileId)
 *       if (error) throw error
 *       return count ?? 0
 *     },
 *   })
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Ref } from 'vue'
import type { CacheConfig } from './useCache'
import type { Database } from '@/types/database.types'
import { computed, readonly, ref, unref, watch } from 'vue'
import { useCache } from './useCache'

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface BadgeCountConfig extends Omit<CacheConfig, 'ttl'> {
  /**
   * Async function that performs the Supabase query and returns the raw integer
   * count.  It MUST throw on error - the factory will catch and surface it.
   */
  fetchCount: (supabase: SupabaseClient<Database>, profileId: string) => Promise<number>

  /** Prefix used when building the cache key: `${cacheKeyPrefix}:${profileId}`. */
  cacheKeyPrefix: string

  /** Human-readable label used in error / debug messages. */
  badgeName?: string

  /** Cache TTL in ms.  Defaults to 10 minutes. */
  ttl?: number

  /** Whether this instance is currently active.  Defaults to true. */
  enabled?: Ref<boolean> | boolean
}

export interface BadgeCountResult {
  /** The latest count value (readonly). */
  count: Readonly<Ref<number>>
  /** True while a fetch is in flight. */
  loading: Readonly<Ref<boolean>>
  /** Non-null when the last fetch failed. */
  error: Readonly<Ref<string | null>>
  /**
   * Invalidates the cache entry for the current userId and re-fetches
   * immediately.
   */
  refresh: () => Promise<void>
  /**
   * Removes the cache entry for the given profileId without re-fetching.
   * Useful after a mutation that changes the count.
   */
  invalidate: (profileId: string | null | undefined) => void
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

const DEFAULT_CACHE_TTL = 10 * 60 * 1000 // 10 minutes

export function useBadgeCount(
  userId: Ref<string | null | undefined> | string | null | undefined,
  config: BadgeCountConfig,
): BadgeCountResult {
  const {
    fetchCount,
    cacheKeyPrefix,
    badgeName = cacheKeyPrefix,
    enabled = true,
    ttl = DEFAULT_CACHE_TTL,
    ...cacheConfig
  } = config

  const normalizedEnabled = computed(() => Boolean(unref(enabled)))
  const supabase = useSupabaseClient<Database>()
  const cache = useCache({ ttl, ...cacheConfig })

  const count = ref(0)
  const loading = ref(false)
  const error = ref<string | null>(null)

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  function getCacheKey(profileId: string): string {
    return `${cacheKeyPrefix}:${profileId}`
  }

  function hasValidProfileId(value: string | null | undefined): value is string {
    return typeof value === 'string' && value.trim() !== ''
  }

  // ---------------------------------------------------------------------------
  // Core fetch
  // ---------------------------------------------------------------------------

  async function loadCount(profileId: string, force = false): Promise<void> {
    const normalizedId = profileId.trim()
    if (normalizedId === '') {
      count.value = 0
      return
    }

    const cacheKey = getCacheKey(normalizedId)

    if (!force) {
      const cached = cache.get<number>(cacheKey)
      if (cached !== null) {
        count.value = cached
        return
      }
    }

    loading.value = true
    error.value = null

    try {
      const result = await fetchCount(supabase, normalizedId)
      cache.set(cacheKey, result, ttl)
      count.value = result
    }
    catch (err) {
      console.error(`Failed to fetch count for badge "${badgeName}"`, err)
      error.value = err instanceof Error ? err.message : `Failed to fetch count for ${badgeName}`
      count.value = 0
    }
    finally {
      loading.value = false
    }
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  function invalidate(profileId: string | null | undefined): void {
    if (!hasValidProfileId(profileId))
      return

    cache.delete(getCacheKey(profileId.trim()))
  }

  async function refresh(): Promise<void> {
    const profileId = unref(userId)
    if (!normalizedEnabled.value || !hasValidProfileId(profileId))
      return

    invalidate(profileId)
    await loadCount(profileId.trim(), true)
  }

  // ---------------------------------------------------------------------------
  // Reactivity
  // ---------------------------------------------------------------------------

  watch(
    [() => unref(userId), normalizedEnabled],
    ([profileId, isEnabled]) => {
      if (!isEnabled || !hasValidProfileId(profileId)) {
        count.value = 0
        return
      }

      void loadCount(profileId.trim())
    },
    { immediate: true },
  )

  return {
    count: readonly(count),
    loading: readonly(loading),
    error: readonly(error),
    refresh,
    invalidate,
  }
}
