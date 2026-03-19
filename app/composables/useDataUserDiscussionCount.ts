/**
 * Cached total discussion count for a given user - used for display counters
 * (e.g. "X discussions" on a profile card).
 *
 * ## Distinction from `useCacheBadgeDiscussionStartedCount`
 *
 * | Composable                           | Counts                                              | Used for              |
 * |--------------------------------------|-----------------------------------------------------|-----------------------|
 * | `useDataUserDiscussionCount`         | ALL non-draft discussions, any context except profile wall | Display counter  |
 * | `useBadgeDiscussionStartedCount`     | Pure forum threads only (topic set, no entity FKs, not draft) | Badge threshold |
 *
 * These look similar but query different predicates and serve different consumers.
 * Do NOT merge them - the badge composable is intentionally stricter.
 */

import type { Ref } from 'vue'
import type { CacheConfig } from './useCache'
import type { Database } from '@/types/database.types'
import { computed, readonly, ref, unref, watch } from 'vue'
import { useCache } from './useCache'

interface UserDiscussionCountOptions extends Omit<CacheConfig, 'ttl'> {
  enabled?: Ref<boolean> | boolean
  ttl?: number
  cacheKeyPrefix?: string
}

const DEFAULT_CACHE_TTL = 10 * 60 * 1000 // 10 minutes

export function useDataUserDiscussionCount(
  userId: Ref<string | null | undefined> | string | null | undefined,
  options: UserDiscussionCountOptions = {},
) {
  const {
    enabled = true,
    ttl = DEFAULT_CACHE_TTL,
    cacheKeyPrefix = 'user:discussion_count',
    ...cacheConfig
  } = options

  const normalizedEnabled = computed(() => Boolean(unref(enabled)))
  const supabase = useSupabaseClient<Database>()
  const cache = useCache({ ttl, ...cacheConfig })

  const count = ref(0)
  const loading = ref(false)
  const error = ref<string | null>(null)

  const getCacheKey = (profileId: string) => `${cacheKeyPrefix}:${profileId}`

  function hasValidProfileId(value: string | null | undefined): value is string {
    return typeof value === 'string' && value.trim() !== ''
  }

  async function loadCount(profileId: string, force = false) {
    const normalizedId = profileId.trim()
    if (normalizedId === '') {
      count.value = 0
      return
    }

    const cacheKey = getCacheKey(normalizedId)

    if (!force) {
      const cachedCount = cache.get<number>(cacheKey)
      if (cachedCount !== null) {
        count.value = cachedCount
        return
      }
    }

    loading.value = true
    error.value = null

    try {
      // Count all non-draft discussions the user has created, across all contexts,
      // excluding profile discussions (e.g. the user's own profile wall posts).
      const { count: discussionCount, error: supabaseError } = await supabase
        .from('discussions')
        .select('id', { count: 'exact', head: true })
        .eq('created_by', normalizedId)
        .eq('is_draft', false)
        .is('profile_id', null)

      if (supabaseError)
        throw supabaseError

      const finalCount = discussionCount ?? 0
      cache.set(cacheKey, finalCount, ttl)
      count.value = finalCount
    }
    catch (err) {
      console.error('Failed to fetch total discussion count for user', err)
      error.value = err instanceof Error ? err.message : 'Failed to fetch discussion count'
      count.value = 0
    }
    finally {
      loading.value = false
    }
  }

  function invalidate(profileId: string | null | undefined) {
    if (!hasValidProfileId(profileId))
      return

    cache.delete(getCacheKey(profileId.trim()))
  }

  async function refresh() {
    const profileId = unref(userId)
    if (!normalizedEnabled.value || !hasValidProfileId(profileId))
      return

    invalidate(profileId)
    await loadCount(profileId.trim(), true)
  }

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
