/**
 * Cached total discussion reply count for a given user - used for display
 * counters (e.g. "X replies" on a forum post author sidebar).
 *
 * Counts all non-deleted replies the user has posted across all discussions.
 * This is purely a display counter; badge threshold logic lives in the catalog.
 */

import type { Ref } from 'vue'
import type { Database } from '@/types/database.types'
import { ref, unref, watch } from 'vue'
import { CACHE_NAMESPACES } from '@/lib/cache/namespaces'
import { useCache } from './useCache'

const DEFAULT_CACHE_TTL = CACHE_NAMESPACES.badges.ttl

export function useDataUserReplyCount(
  userId: Ref<string | null | undefined> | string | null | undefined,
) {
  const supabase = useSupabaseClient<Database>()
  const cache = useCache({ ...CACHE_NAMESPACES.badges })

  const count = ref(0)
  const loading = ref(false)
  const error = ref<string | null>(null)

  const getCacheKey = (profileId: string) => `user:reply_count:${profileId}`

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
      const cached = cache.get<number>(cacheKey)
      if (cached !== null) {
        count.value = cached
        return
      }
    }

    loading.value = true
    error.value = null

    try {
      const { count: replyCount, error: supabaseError } = await supabase
        .from('discussion_replies')
        .select('id', { count: 'exact', head: true })
        .eq('created_by', normalizedId)
        .eq('is_deleted', false)

      if (supabaseError)
        throw supabaseError

      const finalCount = replyCount ?? 0
      cache.set(cacheKey, finalCount, DEFAULT_CACHE_TTL)
      count.value = finalCount
    }
    catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to fetch reply count'
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
    if (!hasValidProfileId(profileId))
      return
    invalidate(profileId)
    await loadCount(profileId.trim(), true)
  }

  watch(
    () => unref(userId),
    (profileId) => {
      if (!hasValidProfileId(profileId)) {
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
