/**
 * Per-discussion replies cache composable.
 *
 * Upgraded from a single-blob cache to a page-aware cursor cache.
 * Each page is keyed by (discussionId, ascending, cursorTime, cursorId)
 * so navigating back to a previously loaded page is free within the TTL.
 *
 * TTL: 3 minutes - short enough that stale data is not a practical concern
 * during a browsing session, long enough to make back-navigation free.
 *
 * Design notes:
 * - Pages are cached individually. `invalidate(discussionId)` wipes all pages
 *   for that discussion (pattern-matched by prefix) so realtime events still
 *   produce fresh data on next load.
 * - The `fetch` method wraps the `get_discussion_replies_page` RPC.
 * - The `getReplyPageCursor` method wraps the `get_discussion_reply_page_cursor` RPC,
 *   used by the front-end to resolve ?comment=<id> deep links.
 * - `legacyFetch` is kept for any callers (e.g. realtime) that still need
 *   the full flat list. It caches under a separate key prefix.
 *
 * Call sites:
 * - composables/useDataDiscussionReplies.ts (page reads + writes)
 * - composables/useRealtimeDiscussion.ts    (invalidate on realtime events)
 */

import type { RawComment } from '@/components/Discussions/Discussion.types'
import type { Database } from '@/types/database.types'
import { readonly, ref } from 'vue'
import { useCache } from './useCache'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CACHE_TTL = 3 * 60 * 1000 // 3 minutes

export const PAGE_SIZE_FORUM = 10
export const PAGE_SIZE_COMMENT = 50

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PageCursor {
  cursorTime: string // ISO timestamptz - created_at of the last row on the preceding page
  cursorId: string // uuid - id of the last row on the preceding page
}

export interface ReplyPage {
  rows: RawComment[]
  hasMore: boolean
  /** The cursor to pass to fetch the NEXT page after this one. */
  nextCursor: PageCursor | null
}

export interface ReplyPageCursorResult {
  pageIndex: number
  predecessorCount: number
  cursor: PageCursor | null // null when the target is on page 0
}

// Shape returned by get_discussion_reply_page_cursor RPC rows.
// cursor_time / cursor_id are nullable at runtime even though the generated
// schema omits `| null`; the SQL function returns NULL when the target reply
// is on the first page (no predecessor cursor needed).
interface RawCursorRow {
  page_index: number
  predecessor_count: number
  cursor_time: string | null
  cursor_id: string | null
}

// Shape returned by get_discussion_replies_tail RPC rows — derived from the
// generated database types so the function name and args are type-checked.
// eslint-disable-next-line unused-imports/no-unused-vars
type TailRow = Database['public']['Functions']['get_discussion_replies_tail']['Returns'][number]

// ---------------------------------------------------------------------------
// Cache key helpers
// ---------------------------------------------------------------------------

function tailKey(
  discussionId: string,
  rootOnly: boolean = false,
): string {
  const rootPart = rootOnly ? ':roots' : ''
  return `discussion-replies-tail:${discussionId}${rootPart}`
}

function pageKey(
  discussionId: string,
  ascending: boolean,
  cursor: PageCursor | null,
  rootOnly: boolean = false,
): string {
  const order = ascending ? 'asc' : 'desc'
  const cursorPart = cursor != null
    ? `${cursor.cursorTime}:${cursor.cursorId}`
    : 'first'
  const rootPart = rootOnly ? ':roots' : ''
  return `discussion-replies-page:${discussionId}:${order}:${cursorPart}${rootPart}`
}

function legacyKey(discussionId: string, ascending: boolean): string {
  return `discussion-replies:${discussionId}:${ascending ? 'asc' : 'desc'}`
}

// ---------------------------------------------------------------------------
// Composable
// ---------------------------------------------------------------------------

export function useDiscussionRepliesCache() {
  const cache = useCache({ ttl: CACHE_TTL })

  const loading = ref(false)
  const error = ref<string | null>(null)

  // ── Page cache primitives ──────────────────────────────────────────────────

  function getTail(
    discussionId: string,
    rootOnly: boolean = false,
  ): RawComment[] | null {
    return cache.get<RawComment[]>(tailKey(discussionId, rootOnly))
  }

  function getPage(
    discussionId: string,
    ascending: boolean,
    cursor: PageCursor | null,
    rootOnly: boolean = false,
  ): ReplyPage | null {
    return cache.get<ReplyPage>(pageKey(discussionId, ascending, cursor, rootOnly))
  }

  function setPage(
    discussionId: string,
    ascending: boolean,
    cursor: PageCursor | null,
    page: ReplyPage,
    rootOnly: boolean = false,
  ): void {
    cache.set(pageKey(discussionId, ascending, cursor, rootOnly), page, CACHE_TTL)
  }

  /**
   * Invalidate all cached pages for a discussion (both orderings, all cursors).
   * Also clears legacy full-list entries for the same discussion.
   */
  function invalidate(discussionId: string): void {
    cache.invalidateByPattern(`discussion-replies-page:${discussionId}:`)
    cache.invalidateByPattern(`discussion-replies-tail:${discussionId}`)
    cache.invalidateByPattern(`discussion-replies:${discussionId}:`)
  }

  /**
   * Invalidate all cached reply data across all discussions.
   */
  function invalidateAll(): void {
    cache.invalidateByPattern('discussion-replies-page:')
    cache.invalidateByPattern('discussion-replies-tail:')
    cache.invalidateByPattern('discussion-replies:')
  }

  // ── Page fetch (cursor-based RPC) ──────────────────────────────────────────

  /**
   * Fetch a single page of discussion replies via the `get_discussion_replies_page`
   * RPC. Consults the page cache first; pass `force = true` to bypass.
   *
   * @param discussionId - The discussion to paginate
   * @param options - Optional fetch parameters
   * @param options.ascending - true = forum order (oldest first), false = newest first
   * @param options.cursor - Composite cursor from the previous page; null for page 1
   * @param options.pageSize - Rows per page (default: model-appropriate constant)
   * @param options.hash - Optional meta hash filter for vote discussions
   * @param options.rootOnly - When true, only top-level replies (reply_to_id IS NULL) are fetched; used for threaded-mode pagination
   * @param force - Skip cache and always hit the DB
   */
  async function fetchPage(
    discussionId: string,
    options: {
      ascending?: boolean
      cursor?: PageCursor | null
      pageSize?: number
      hash?: string
      rootOnly?: boolean
    } = {},
    force = false,
  ): Promise<ReplyPage | null> {
    const supabase = useSupabaseClient<Database>()

    const ascending = options.ascending ?? true
    const cursor = options.cursor ?? null
    const pageSize = options.pageSize ?? (ascending ? PAGE_SIZE_FORUM : PAGE_SIZE_COMMENT)
    const rootOnly = options.rootOnly ?? false

    if (!force) {
      const cached = getPage(discussionId, ascending, cursor, rootOnly)
      if (cached !== null)
        return cached
    }

    loading.value = true
    error.value = null

    try {
      const { data, error: rpcError } = await supabase.rpc(
        'get_discussion_replies_page',
        {
          p_discussion_id: discussionId,
          p_limit: pageSize,
          p_ascending: ascending,
          p_cursor_time: cursor?.cursorTime ?? undefined,
          p_cursor_id: cursor?.cursorId ?? undefined,
          p_hash: options.hash ?? undefined,
          p_root_only: rootOnly,
        },
      )

      if (rpcError != null)
        throw rpcError

      if (data == null)
        return null

      const rows = data
      const hasMore = rows.length > 0 && (rows.at(-1)!.has_more)

      // Strip the synthetic has_more column before storing rows
      const cleanRows: RawComment[] = rows.map(({ has_more: _hm, ...rest }) => rest as unknown as RawComment)

      // The next-page cursor is the (created_at, id) of the last row on this page
      const lastRow = cleanRows.at(-1)
      const nextCursor: PageCursor | null = hasMore && lastRow != null
        ? { cursorTime: lastRow.created_at, cursorId: lastRow.id }
        : null

      const page: ReplyPage = { rows: cleanRows, hasMore, nextCursor }
      setPage(discussionId, ascending, cursor, page, rootOnly)
      return page
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
   * Force a re-fetch of a page, bypassing and replacing the cached entry.
   */
  async function refreshPage(
    discussionId: string,
    options: {
      ascending?: boolean
      cursor?: PageCursor | null
      pageSize?: number
      hash?: string
    } = {},
  ): Promise<ReplyPage | null> {
    return fetchPage(discussionId, options, true)
  }

  // ── Deep-link cursor lookup (RPC) ──────────────────────────────────────────

  /**
   * Given a target reply id, returns the page index and the cursor needed to
   * fetch the page that contains that reply.
   *
   * Returns null when the target reply is not found (deleted, RLS-filtered,
   * or wrong discussionId).
   */
  async function getReplyPageCursor(
    discussionId: string,
    targetId: string,
    options: {
      ascending?: boolean
      pageSize?: number
      hash?: string
      rootOnly?: boolean
    } = {},
  ): Promise<ReplyPageCursorResult | null> {
    const supabase = useSupabaseClient<Database>()

    const ascending = options.ascending ?? true
    const pageSize = options.pageSize ?? (ascending ? PAGE_SIZE_FORUM : PAGE_SIZE_COMMENT)
    const rootOnly = options.rootOnly ?? false

    try {
      const { data, error: rpcError } = await supabase.rpc(
        'get_discussion_reply_page_cursor',
        {
          p_discussion_id: discussionId,
          p_target_id: targetId,
          p_limit: pageSize,
          p_ascending: ascending,
          p_hash: options.hash ?? undefined,
          p_root_only: rootOnly,
        },
      )

      if (rpcError != null)
        throw rpcError

      const rows = data as unknown as RawCursorRow[]

      if (rows == null || rows.length === 0)
        return null

      const row = rows[0]!

      const cursor: PageCursor | null
        = row.cursor_time != null && row.cursor_id != null
          ? { cursorTime: row.cursor_time, cursorId: row.cursor_id }
          : null

      return {
        pageIndex: row.page_index,
        predecessorCount: row.predecessor_count,
        cursor,
      }
    }
    catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to locate reply'
      return null
    }
  }

  // ── Tail fetch (last N rows, ascending) ───────────────────────────────────

  /**
   * Fetch the last p_limit rows for a discussion in ascending order via the
   * `get_discussion_replies_tail` RPC. Used to always show the newest content
   * alongside page 1, with a gap indicator in between when applicable.
   *
   * Results are cached under a dedicated tail key (separate from page keys).
   *
   * @param discussionId - The discussion to query
   * @param options - Optional fetch parameters
   * @param options.pageSize - Number of tail rows to fetch
   * @param options.hash - Optional meta hash filter for vote discussions
   * @param options.rootOnly - When true, only top-level replies are fetched
   * @param force - Skip cache and always hit the DB
   */
  async function fetchTail(
    discussionId: string,
    options: {
      pageSize?: number
      hash?: string
      rootOnly?: boolean
    } = {},
    force = false,
  ): Promise<RawComment[] | null> {
    const supabase = useSupabaseClient<Database>()

    const pageSize = options.pageSize ?? PAGE_SIZE_FORUM
    const rootOnly = options.rootOnly ?? false
    const key = tailKey(discussionId, rootOnly)

    if (!force) {
      const cached = cache.get<RawComment[]>(key)
      if (cached !== null)
        return cached
    }

    loading.value = true
    error.value = null

    try {
      const { data, error: rpcError } = await supabase.rpc(
        'get_discussion_replies_tail',
        {
          p_discussion_id: discussionId,
          p_limit: pageSize,
          p_hash: options.hash ?? undefined,
          p_root_only: rootOnly,
        },
      )

      if (rpcError != null)
        throw rpcError

      if (data == null)
        return null

      const rows = data
      cache.set(key, rows as unknown as RawComment[], CACHE_TTL)
      return rows as unknown as RawComment[]
    }
    catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to fetch tail replies'
      return null
    }
    finally {
      loading.value = false
    }
  }

  // ── Legacy full-list fetch (kept for realtime patch-back) ──────────────────

  /**
   * Fetches the complete flat reply list for a discussion without pagination.
   * Used by useRealtimeDiscussion when it needs to build the full set to
   * patch changes back into. The result is cached under the legacy key.
   *
   * @deprecated Prefer fetchPage for new call sites. This exists for
   * backward-compatibility with useRealtimeDiscussion's patch-back logic.
   */
  async function legacyFetch(
    discussionId: string,
    options: {
      hash?: string
      ascending?: boolean
    } = {},
    force = false,
  ): Promise<RawComment[] | null> {
    const supabase = useSupabaseClient<Database>()
    const ascending = options.ascending ?? false
    const key = legacyKey(discussionId, ascending)

    if (!force) {
      const cached = cache.get<RawComment[]>(key)
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

      if (options.hash != null)
        query.eq('meta->>hash', options.hash)

      const { data, error: fetchError } = await query.order('created_at', {
        ascending,
      })

      if (fetchError != null)
        throw fetchError

      if (data == null)
        return null

      const rows = data as RawComment[]
      cache.set(key, rows, CACHE_TTL)
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

  function legacySet(discussionId: string, replies: RawComment[], ascending: boolean): void {
    cache.set(legacyKey(discussionId, ascending), replies, CACHE_TTL)
  }

  function legacyGet(discussionId: string, ascending: boolean): RawComment[] | null {
    return cache.get<RawComment[]>(legacyKey(discussionId, ascending))
  }

  // ── Public surface ─────────────────────────────────────────────────────────

  return {
    // State
    loading: readonly(loading),
    error: readonly(error),

    // Page cache primitives
    getTail,
    getPage,
    setPage,
    invalidate,
    invalidateAll,

    // Cursor-based fetch
    fetchPage,
    refreshPage,

    // Tail fetch (last N rows, for showing newest content alongside page 1)
    fetchTail,

    // Deep-link lookup
    getReplyPageCursor,

    // Legacy full-list (for realtime patch-back compatibility)
    legacyFetch,
    legacySet,
    legacyGet,
  }
}
