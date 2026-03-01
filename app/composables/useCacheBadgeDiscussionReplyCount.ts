/**
 * Shared helper to load and cache "Chatterbox" discussion-reply counts per user.
 * Counts all non-deleted replies a user has made across all discussions.
 * Reduces duplicate Supabase queries when the same profile is shown repeatedly.
 */

import type { Ref } from 'vue'
import type { CacheConfig } from './useCache'
import type { Database } from '@/types/database.types'
import { computed, readonly, ref, unref, watch } from 'vue'
import { useCache } from './useCache'

interface DiscussionReplyCountOptions extends Omit<CacheConfig, 'ttl'> {
  enabled?: Ref<boolean> | boolean
  ttl?: number
  cacheKeyPrefix?: string
}

const DEFAULT_CACHE_TTL = 10 * 60 * 1000 // 10 minutes

export function useCacheBadgeDiscussionReplyCount(
  userId: Ref<string | null | undefined> | string | null | undefined,
  options: DiscussionReplyCountOptions = {},
) {
  const {
    enabled = true,
    ttl = DEFAULT_CACHE_TTL,
    cacheKeyPrefix = 'user:badge:discussion_replies',
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
      // Count all non-deleted replies the user has made across all discussions.
      const { count: replyCount, error: supabaseError } = await supabase
        .from('discussion_replies')
        .select('id', { count: 'exact', head: true })
        .eq('created_by', normalizedId)
        .eq('is_deleted', false)

      if (supabaseError)
        throw supabaseError

      const finalCount = replyCount ?? 0
      cache.set(cacheKey, finalCount, ttl)
      count.value = finalCount
    }
    catch (err) {
      console.error('Failed to fetch discussion-reply count for Chatterbox badge', err)
      error.value = err instanceof Error ? err.message : 'Failed to fetch discussion-reply count'
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
  }
}
