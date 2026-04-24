/**
 * Discussion subscription cache composable.
 *
 * Caches two shapes of data per user:
 *
 *   1. `discussion-subscriptions:list:${userId}`
 *      The full `SubscriptionRow[]` as returned by `NotificationTabSubscriptions`.
 *      Used to avoid re-fetching the list every time the notification sheet opens.
 *
 *   2. `discussion-subscriptions:status:${userId}:${discussionId}`
 *      A `boolean` indicating whether the user is subscribed to a specific
 *      discussion. Used by `forum/[id].vue` to skip the per-visit status fetch.
 *
 * Design notes:
 * - TTL is 10 minutes. Subscriptions are user-driven - they only change when
 *   the user explicitly subscribes or unsubscribes - so a longer TTL is safe.
 *   All mutation helpers (`subscribe`, `unsubscribe`, `unsubscribeAll`,
 *   `updateLastSeen`) update both caches in-place so callers never need an
 *   extra round-trip after a mutation.
 * - The list cache stores the joined shape (with the nested `discussion` object)
 *   because that is what the notification UI needs. Status cache stores only
 *   the boolean that `forum/[id].vue` needs.
 * - `invalidateForUser(userId)` removes both key shapes for that user.
 *   Call this on logout or after any operation that makes the cached state
 *   untrustworthy (e.g. admin bulk deletion).
 *
 * TTL: 10 minutes - subscriptions are infrequently mutated and we patch caches
 * on every mutation, so staleness is not a practical concern.
 *
 * Call sites:
 * - components/Notifications/NotificationTabSubscriptions.vue (list read/write/invalidate)
 * - pages/forum/[id].vue (status read/write, subscribe/unsubscribe mutations)
 * - composables/useDataDiscussionReplies.ts (updateLastSeen after markDiscussionSeen)
 */

import { readonly, ref } from 'vue'
import { useCache } from './useCache'

// ---------------------------------------------------------------------------
// Shared type
// ---------------------------------------------------------------------------

/**
 * A single subscription row with its nested discussion join.
 *
 * Exported so callers don't need to redeclare the shape locally.
 * Mirrors the Supabase select:
 *   `id, discussion_id, last_seen_at, discussion:discussions(title, slug, profile_id, event_id, gameserver_id, project_id, referendum_id, theme_id)`
 */
export interface SubscriptionRow {
  id: string
  discussion_id: string
  last_seen_at: string
  discussion: {
    title: string
    slug: string | null
    profile_id: string | null
    event_id: number | null
    gameserver_id: number | null
    project_id: number | null
    referendum_id: number | null
    theme_id: string | null
  } | null
}

// ---------------------------------------------------------------------------

const CACHE_TTL = 10 * 60 * 1000 // 10 minutes

function listKey(userId: string): string {
  return `discussion-subscriptions:list:${userId}`
}

function statusKey(userId: string, discussionId: string): string {
  return `discussion-subscriptions:status:${userId}:${discussionId}`
}

export function useDiscussionSubscriptionsCache() {
  const cache = useCache({ ttl: CACHE_TTL })

  const loading = ref(false)
  const error = ref<string | null>(null)

  // ---------------------------------------------------------------------------
  // List cache
  // ---------------------------------------------------------------------------

  /**
   * Read the cached subscription list for a user.
   * Returns null if cold or expired.
   */
  function getList(userId: string): SubscriptionRow[] | null {
    return cache.get<SubscriptionRow[]>(listKey(userId))
  }

  /**
   * Write the full subscription list into the cache.
   * Also populates status cache for every entry in the list as a bonus.
   */
  function setList(userId: string, rows: SubscriptionRow[]): void {
    cache.set(listKey(userId), rows, CACHE_TTL)

    for (const row of rows) {
      cache.set(statusKey(userId, row.discussion_id), true, CACHE_TTL)
    }
  }

  /**
   * Remove the cached list for a user.
   */
  function invalidateList(userId: string): void {
    cache.delete(listKey(userId))
  }

  // ---------------------------------------------------------------------------
  // Status cache
  // ---------------------------------------------------------------------------

  /**
   * Read the cached subscription status for a user + discussion pair.
   * Returns null if cold or expired (caller should fetch).
   */
  function getStatus(userId: string, discussionId: string): boolean | null {
    return cache.get<boolean>(statusKey(userId, discussionId))
  }

  /**
   * Write the subscription status for a user + discussion pair.
   */
  function setStatus(userId: string, discussionId: string, subscribed: boolean): void {
    cache.set(statusKey(userId, discussionId), subscribed, CACHE_TTL)
  }

  /**
   * Remove the status cache entry for a user + discussion pair.
   */
  function invalidateStatus(userId: string, discussionId: string): void {
    cache.delete(statusKey(userId, discussionId))
  }

  // ---------------------------------------------------------------------------
  // Bulk invalidation
  // ---------------------------------------------------------------------------

  /**
   * Remove all cached subscription data for a user (list + all status entries).
   * Call on logout or after admin operations that affect the user's subscriptions.
   */
  function invalidateForUser(userId: string): void {
    cache.invalidateByPattern(`discussion-subscriptions:list:${userId}`)
    cache.invalidateByPattern(`discussion-subscriptions:status:${userId}:`)
  }

  /**
   * Remove all subscription cache entries for all users.
   */
  function invalidateAll(): void {
    cache.invalidateByPattern('discussion-subscriptions:')
  }

  // ---------------------------------------------------------------------------
  // Mutation helpers
  // Update caches in-place so callers don't need a re-fetch after a mutation.
  // These are cache-only - they do not touch Supabase. Callers own the DB write.
  // ---------------------------------------------------------------------------

  /**
   * Record a new subscription in both caches.
   *
   * @param userId       - The subscribing user
   * @param row          - The newly created subscription row (with discussion join)
   */
  function applySubscribe(userId: string, row: SubscriptionRow): void {
    // Update status cache
    setStatus(userId, row.discussion_id, true)

    // Prepend to list cache if present
    const list = getList(userId)
    if (list !== null) {
      // Avoid duplicates - remove any stale entry for the same discussion first
      const filtered = list.filter(s => s.discussion_id !== row.discussion_id)
      setList(userId, [row, ...filtered])
    }
  }

  /**
   * Remove a subscription from both caches by subscription ID.
   *
   * @param userId           - The user whose subscription is being removed
   * @param subscriptionId   - The `id` of the subscription row to remove
   * @param discussionId     - The discussion the subscription was for
   */
  function applyUnsubscribe(userId: string, subscriptionId: string, discussionId: string): void {
    // Update status cache
    setStatus(userId, discussionId, false)

    // Remove from list cache if present
    const list = getList(userId)
    if (list !== null) {
      setList(userId, list.filter(s => s.id !== subscriptionId))
    }
  }

  /**
   * Remove a subscription from both caches by discussion ID only.
   *
   * Use this when you performed a `DELETE WHERE user_id + discussion_id` and
   * don't have the subscription row ID available (e.g. `forum/[id].vue` toggle).
   *
   * @param userId       - The user whose subscription is being removed
   * @param discussionId - The discussion the subscription was for
   */
  function applyUnsubscribeByDiscussion(userId: string, discussionId: string): void {
    // Update status cache
    setStatus(userId, discussionId, false)

    // Remove from list cache if present
    const list = getList(userId)
    if (list !== null) {
      setList(userId, list.filter(s => s.discussion_id !== discussionId))
    }
  }

  /**
   * Clear all subscriptions from both caches (mirrors a clearAll / DELETE WHERE user_id = ...).
   *
   * @param userId - The user whose subscriptions were cleared
   */
  function applyUnsubscribeAll(userId: string): void {
    // Wipe the list cache
    invalidateList(userId)

    // Wipe all status keys for this user - we can't enumerate them, so
    // pattern-invalidate the entire status namespace for the user
    cache.invalidateByPattern(`discussion-subscriptions:status:${userId}:`)
  }

  /**
   * Update `last_seen_at` for a specific discussion subscription in the list cache.
   * No-op if the list is not cached or the discussion is not in the list.
   *
   * @param userId       - The user
   * @param discussionId - The discussion that was just visited
   * @param seenAt       - ISO timestamp (defaults to now)
   */
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

    // Re-sort by last_seen_at descending to match the DB order
    updated.sort((a, b) => b.last_seen_at.localeCompare(a.last_seen_at))

    cache.set(listKey(userId), updated, CACHE_TTL)
  }

  // ---------------------------------------------------------------------------

  return {
    // State
    loading: readonly(loading),
    error: readonly(error),

    // List cache
    getList,
    setList,
    invalidateList,

    // Status cache
    getStatus,
    setStatus,
    invalidateStatus,

    // Bulk invalidation
    invalidateForUser,
    invalidateAll,

    // Mutation helpers (cache-only, no DB writes)
    applySubscribe,
    applyUnsubscribe,
    applyUnsubscribeByDiscussion,
    applyUnsubscribeAll,
    applyLastSeen,
  }
}
