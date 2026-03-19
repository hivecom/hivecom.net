/**
 * Cached "Chatterbox" discussion-reply count for a given user.
 *
 * Thin wrapper around the generic `useBadgeCount` factory.
 * Only counts non-deleted replies a user has made across all discussions.
 */

import type { Ref } from 'vue'
import type { CacheConfig } from './useCache'
import { useBadgeCount } from './useBadgeCount'

interface DiscussionReplyCountOptions extends Omit<CacheConfig, 'ttl'> {
  enabled?: Ref<boolean> | boolean
  ttl?: number
  cacheKeyPrefix?: string
}

export function useBadgeDiscussionReplyCount(
  userId: Ref<string | null | undefined> | string | null | undefined,
  options: DiscussionReplyCountOptions = {},
) {
  const {
    cacheKeyPrefix = 'user:badge:discussion_replies',
    ...rest
  } = options

  return useBadgeCount(userId, {
    cacheKeyPrefix,
    badgeName: 'Chatterbox (discussion replies)',
    ...rest,
    fetchCount: async (supabase, profileId) => {
      const { count, error } = await supabase
        .from('discussion_replies')
        .select('id', { count: 'exact', head: true })
        .eq('created_by', profileId)
        .eq('is_deleted', false)

      if (error)
        throw error

      return count ?? 0
    },
  })
}
