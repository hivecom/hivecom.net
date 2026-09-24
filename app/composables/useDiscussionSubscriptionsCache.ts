/**
 * Caches each user's subscription list (with the discussion join) and a status
 * boolean per discussion. Subscriptions only change through the user, and the
 * apply* helpers patch both caches after every mutation, so a long TTL is safe.
 */

import { readonly } from 'vue'
import { CACHE_NAMESPACES } from '@/lib/cache/namespaces'
import { useCacheModule } from './useCacheModule'

// ---------------------------------------------------------------------------
// Shared type
// ------------------------------------------------------------------------
/**
 * The select every subscription fetch uses. Shared because all of them write
 * into the same cached list, so a select that drops a column would hand the
 * next reader a half-filled row.
 */
export const SUBSCRIPTION_SELECT = 'id, discussion_id, last_seen_at, discussion:discussions(title, slug, discussion_topic_id, last_activity_at, last_activity_by, profile_id, event_id, gameserver_id, project_id, referendum_id, theme_id)'

/**
 * Mirrors `SUBSCRIPTION_SELECT`. `last_seen_at` moves on every visit, so
 * "updated X ago" wants `last_activity_at`. Comparing the two is the unread
 * check, and `last_activity_by` keeps your own reply from dotting your own thread.
 */
export interface SubscriptionRow {
  id: string
  discussion_id: string
  last_seen_at: string
  discussion: {
    title: string
    slug: string | null
    discussion_topic_id: string | null
    last_activity_at: string
    last_activity_by: string | null
    profile_id: string | null
    event_id: number | null
    gameserver_id: number | null
    project_id: number | null
    referendum_id: number | null
    theme_id: string | null
  } | null
}

// ------------------------------------------------------------------------
const CACHE_TTL = 10 * 60 * 1000

function listKey(userId: string): string {
  return `discussion-subscriptions:list:${userId}`
}

function statusKey(userId: string, discussionId: string): string {
  return `discussion-subscriptions:status:${userId}:${discussionId}`
}

export function useDiscussionSubscriptionsCache() {
  const { cache, loading, error } = useCacheModule(CACHE_NAMESPACES.discussions)

  // ---------------------------------------------------------------------------
  // List cache
  // ------------------------------------------------------------------------
  function getList(userId: string): SubscriptionRow[] | null {
    return cache.get<SubscriptionRow[]>(listKey(userId))
  }

  /** Also marks every listed discussion as subscribed in the status cache. */
  function setList(userId: string, rows: SubscriptionRow[]): void {
    cache.set(listKey(userId), rows, CACHE_TTL)

    for (const row of rows) {
      cache.set(statusKey(userId, row.discussion_id), true, CACHE_TTL)
    }
  }

  function invalidateList(userId: string): void {
    cache.delete(listKey(userId))
  }

  // ---------------------------------------------------------------------------
  // Status cache
  // ------------------------------------------------------------------------
  function getStatus(userId: string, discussionId: string): boolean | null {
    return cache.get<boolean>(statusKey(userId, discussionId))
  }

  function setStatus(userId: string, discussionId: string, subscribed: boolean): void {
    cache.set(statusKey(userId, discussionId), subscribed, CACHE_TTL)
  }

  function invalidateStatus(userId: string, discussionId: string): void {
    cache.delete(statusKey(userId, discussionId))
  }

  // ---------------------------------------------------------------------------
  // Bulk invalidation
  // ------------------------------------------------------------------------
  /** Call on logout or after admin operations that affect the user's subscriptions. */
  function invalidateForUser(userId: string): void {
    cache.invalidateByPattern(`discussion-subscriptions:list:${userId}`)
    cache.invalidateByPattern(`discussion-subscriptions:status:${userId}:`)
  }

  function invalidateAll(): void {
    cache.invalidateByPattern('discussion-subscriptions:')
  }

  // ---------------------------------------------------------------------------
  // Mutation helpers
  // Cache-only. Callers own the DB write and call these after it succeeds.
  // ------------------------------------------------------------------------
  function applySubscribe(userId: string, row: SubscriptionRow): void {
    setStatus(userId, row.discussion_id, true)

    const list = getList(userId)
    if (list !== null) {
      const filtered = list.filter(s => s.discussion_id !== row.discussion_id)
      setList(userId, [row, ...filtered])
    }
  }

  function applyUnsubscribe(userId: string, subscriptionId: string, discussionId: string): void {
    setStatus(userId, discussionId, false)

    const list = getList(userId)
    if (list !== null) {
      setList(userId, list.filter(s => s.id !== subscriptionId))
    }
  }

  /** For a delete by user and discussion, when the subscription row ID isn't at hand. */
  function applyUnsubscribeByDiscussion(userId: string, discussionId: string): void {
    setStatus(userId, discussionId, false)

    const list = getList(userId)
    if (list !== null) {
      setList(userId, list.filter(s => s.discussion_id !== discussionId))
    }
  }

  function applyUnsubscribeAll(userId: string): void {
    invalidateList(userId)

    // Status keys can't be enumerated, so pattern-invalidate the user's whole status namespace.
    cache.invalidateByPattern(`discussion-subscriptions:status:${userId}:`)
  }

  function applyLastSeen(userId: string, discussionId: string, seenAt = new Date().toISOString()): void {
    const list = getList(userId)
    if (list === null)
      return

    const idx = list.findIndex(s => s.discussion_id === discussionId)
    if (idx === -1)
      return

    const updated = list.map((s, i) =>
      i === idx ? { ...s, last_seen_at: seenAt } : s,
    )

    // Re-sort by last_seen_at descending to match the DB order.
    updated.sort((a, b) => b.last_seen_at.localeCompare(a.last_seen_at))

    cache.set(listKey(userId), updated, CACHE_TTL)
  }

  // ------------------------------------------------------------------------
  return {
    loading,
    error: readonly(error),

    getList,
    setList,
    invalidateList,

    getStatus,
    setStatus,
    invalidateStatus,

    invalidateForUser,
    invalidateAll,

    applySubscribe,
    applyUnsubscribe,
    applyUnsubscribeByDiscussion,
    applyUnsubscribeAll,
    applyLastSeen,
  }
}
