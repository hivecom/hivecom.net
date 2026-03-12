/**
 * Cached "Forum Regular" discussion-started count for a given user.
 *
 * Thin wrapper around the generic `useCacheBadgeCount` factory.
 * Only counts pure forum threads (discussion_topic_id set, no entity FK
 * attached, not drafts).
 */

import type { Ref } from 'vue'
import type { CacheConfig } from './useCache'
import { useCacheBadgeCount } from './useCacheBadgeCount'

interface DiscussionStartedCountOptions extends Omit<CacheConfig, 'ttl'> {
  enabled?: Ref<boolean> | boolean
  ttl?: number
  cacheKeyPrefix?: string
}

export function useCacheBadgeDiscussionStartedCount(
  userId: Ref<string | null | undefined> | string | null | undefined,
  options: DiscussionStartedCountOptions = {},
) {
  const {
    cacheKeyPrefix = 'user:badge:discussion_started',
    ...rest
  } = options

  return useCacheBadgeCount(userId, {
    cacheKeyPrefix,
    badgeName: 'Forum Regular (discussions started)',
    ...rest,
    fetchCount: async (supabase, profileId) => {
      // Only count pure forum threads: must have a topic, must not be attached
      // to any entity (event, referendum, profile, project, gameserver), and
      // must not be a draft.
      const { count, error } = await supabase
        .from('discussions')
        .select('id', { count: 'exact', head: true })
        .eq('created_by', profileId)
        .eq('is_draft', false)
        .not('discussion_topic_id', 'is', null)
        .is('event_id', null)
        .is('referendum_id', null)
        .is('profile_id', null)
        .is('project_id', null)
        .is('gameserver_id', null)

      if (error)
        throw error

      return count ?? 0
    },
  })
}
