/**
 * Per-discussion replies cache composable.
 *
 * Caches the flat list of `discussion_replies` rows for a given discussion ID
 * with a 3-minute TTL. This is intentionally short because replies can arrive
 * via realtime, be edited, or be soft/hard deleted at any time. The cache
 * exists purely to avoid redundant re-fetches within a short browsing session
 * (e.g. navigating away and back) rather than as a long-lived data store.
 *
 * Design notes:
 * - Keyed by `discussion-replies:${discussionId}` only. Replies are always
 *   fetched for a specific discussion, never looked up individually.
 * - `set()` writes the full list for a discussion - callers own the fetch and
 *   pass the result here as a side-effect write.
 * - `invalidate(discussionId)` removes the list so the next load fetches fresh.
 *   Called by useRealtimeDiscussion when INSERT/UPDATE/DELETE events arrive,
 *   ensuring realtime mutations always win over stale cached data.
 * - `invalidateAll()` pattern-matches on the `discussion-replies:` prefix,
 *   useful after bulk admin operations.
 *
 * TTL: 3 minutes - mirrors useCacheDiscussion. Short enough that stale data
 * is not a practical concern; long enough to make back-navigation free.
 *
 * Call sites:
 * - composables/useDataDiscussionReplies.ts (read + write after fetch)
 * - composables/useRealtimeDiscussion.ts (invalidate on realtime events)
 */

import type { RawComment } from '@/components/Discussions/Discussion.types'
import type { Database } from '@/types/database.types'
import { readonly, ref } from 'vue'
import { useCache } from './useCache'

const CACHE_TTL = 3 * 60 * 1000 // 3 minutes

function repliesKey(discussionId: string): string {
  return `discussion-replies:${discussionId}`
}

export function useCacheDiscussionReplies() {
  const cache = useCache({ ttl: CACHE_TTL })

  const loading = ref(false)
  const error = ref<string | null>(null)

  // ---------------------------------------------------------------------------
  // Cache primitives
  // ---------------------------------------------------------------------------

  /**
   * Read the cached reply list for a discussion. Returns null if cold or expired.
   */
  function get(discussionId: string): RawComment[] | null {
    return cache.get<RawComment[]>(repliesKey(discussionId))
  }

  /**
   * Populate (or replace) the cached reply list for a discussion.
   *
   * Call this as a side effect after fetching replies from Supabase so that
   * subsequent mounts of the same discussion don't re-fetch within the TTL.
   */
  function set(discussionId: string, replies: RawComment[]): void {
    cache.set(repliesKey(discussionId), replies, CACHE_TTL)
  }

  /**
   * Remove the cached reply list for a discussion.
   *
   * Should be called whenever a realtime event signals that the list has
   * changed (INSERT, UPDATE, DELETE) so the next load is authoritative.
   */
  function invalidate(discussionId: string): void {
    cache.delete(repliesKey(discussionId))
  }

  /**
   * Remove all reply cache entries (e.g. after a bulk admin operation or
   * when the user logs out).
   */
  function invalidateAll(): void {
    cache.invalidateByPattern('discussion-replies:')
  }

  // ---------------------------------------------------------------------------
  // Fetch helper
  // ---------------------------------------------------------------------------

  /**
   * Fetch replies for a discussion, consulting the cache first.
   *
   * @param discussionId - The discussion to load replies for
   * @param options   - Optional filter parameters
   * @param options.hash - When set, filters replies to only those matching this meta hash
   * @param options.ascending - Sort order for created_at; defaults to false (newest first)
   * @param force     - When true, skip cache and always fetch from Supabase
   */
  async function fetch(
    discussionId: string,
    options: {
      hash?: string
      ascending?: boolean
    } = {},
    force = false,
  ): Promise<RawComment[] | null> {
    const supabase = useSupabaseClient<Database>()
    if (!force) {
      const cached = get(discussionId)
      if (cached !== null)
        return cached
    }

    loading.value = true
    error.value = null

    try {
      const query = supabase
        .from('discussion_replies')
        .select('*')
        .eq('discussion_id', discussionId)

      if (options.hash != null) {
        query.eq('meta->>hash', options.hash)
      }

      const { data, error: fetchError } = await query.order('created_at', {
        ascending: options.ascending ?? false,
      })

      if (fetchError != null)
        throw fetchError

      if (data == null)
        return null

      const rows = data as RawComment[]
      set(discussionId, rows)
      return rows
    }
    catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to fetch replies'
      return null
    }
    finally {
      loading.value = false
    }
  }

  /**
   * Force a re-fetch, bypassing and replacing the cached entry.
   */
  async function refresh(
    discussionId: string,
    options: {
      hash?: string
      ascending?: boolean
    } = {},
  ): Promise<RawComment[] | null> {
    return fetch(discussionId, options, true)
  }

  // ---------------------------------------------------------------------------

  return {
    // State
    loading: readonly(loading),
    error: readonly(error),

    // Cache primitives
    get,
    set,
    invalidate,
    invalidateAll,

    // Fetch helpers
    fetch,
    refresh,
  }
}
