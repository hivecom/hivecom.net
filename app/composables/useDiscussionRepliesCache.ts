/**
 * Cursor page cache for discussion replies. Pages are cached individually, so
 * going back to a loaded page is free within the TTL. invalidate() wipes every
 * page for a discussion so realtime events get fresh data on the next load.
 */

import type { RawComment } from '@/components/Discussions/Discussion.types'
import type { Database } from '@/types/database.types'
import { readonly, ref } from 'vue'
import { useCacheModule } from '@/composables/useCacheModule'
import { CACHE_NAMESPACES } from '@/lib/cache/namespaces'

// ---------------------------------------------------------------------------
// Constants
// ------------------------------------------------------------------------
const CACHE_TTL = 3 * 60 * 1000

export const PAGE_SIZE_FORUM = 10
export const PAGE_SIZE_COMMENT = 10

// ---------------------------------------------------------------------------
// Types
// ------------------------------------------------------------------------
export interface PageCursor {
  cursorTime: string // ISO created_at of the last row on the preceding page
  cursorId: string // id of the last row on the preceding page
}

export interface ReplyPage {
  rows: RawComment[]
  hasMore: boolean
  nextCursor: PageCursor | null
}

export interface ReplyPageCursorResult {
  pageIndex: number
  predecessorCount: number
  cursor: PageCursor | null // null when the target is on page 0

  /** Page N-1's cursor. Non-null only when pageIndex >= 2. */
  prevCursor: PageCursor | null
}

// The RPC returns NULL cursors when the target is on the first page, even though
// the generated schema doesn't mark them nullable.
interface RawCursorRow {
  page_index: number
  predecessor_count: number
  cursor_time: string | null
  cursor_id: string | null
  prev_cursor_time: string | null
  prev_cursor_id: string | null
}

// Derived from the generated types so the RPC name stays type-checked.
// eslint-disable-next-line unused-imports/no-unused-vars
type TailRow = Database['public']['Functions']['get_discussion_replies_tail']['Returns'][number]

// ---------------------------------------------------------------------------
// Cache key helpers
// ------------------------------------------------------------------------
function pageKey(
  discussionId: string,
  ascending: boolean,
  cursor: PageCursor | null,
  rootOnly: boolean = false,
  hash?: string,
): string {
  const order = ascending ? 'asc' : 'desc'
  const cursorPart = cursor != null
    ? `${cursor.cursorTime}:${cursor.cursorId}`
    : 'first'
  const rootPart = rootOnly ? ':roots' : ''
  const hashPart = hash != null ? `:h:${hash}` : ''
  return `discussion-replies-page:${discussionId}:${order}:${cursorPart}${rootPart}${hashPart}`
}

function legacyKey(discussionId: string, ascending: boolean): string {
  return `discussion-replies:${discussionId}:${ascending ? 'asc' : 'desc'}`
}

// ---------------------------------------------------------------------------
// Composable
// ------------------------------------------------------------------------
export function useDiscussionRepliesCache() {
  const { cache } = useCacheModule(CACHE_NAMESPACES.replies)

  const loading = ref(false)
  const error = ref<string | null>(null)

  // ── Page cache primitives ──────────────────────────────────────────────────

  function getPage(
    discussionId: string,
    ascending: boolean,
    cursor: PageCursor | null,
    rootOnly: boolean = false,
    hash?: string,
  ): ReplyPage | null {
    return cache.get<ReplyPage>(pageKey(discussionId, ascending, cursor, rootOnly, hash))
  }

  function setPage(
    discussionId: string,
    ascending: boolean,
    cursor: PageCursor | null,
    page: ReplyPage,
    rootOnly: boolean = false,
    hash?: string,
  ): void {
    cache.set(pageKey(discussionId, ascending, cursor, rootOnly, hash), page, CACHE_TTL)
  }

  // Every ordering and cursor, plus the tail and legacy entries.
  function invalidate(discussionId: string): void {
    cache.invalidateByPattern(`discussion-replies-page:${discussionId}:`)
    cache.invalidateByPattern(`discussion-replies-tail:${discussionId}`)
    cache.invalidateByPattern(`discussion-replies:${discussionId}:`)
  }

  function invalidateAll(): void {
    cache.invalidateByPattern('discussion-replies-page:')
    cache.invalidateByPattern('discussion-replies-tail:')
    cache.invalidateByPattern('discussion-replies:')
  }

  // ── Page fetch (cursor-based RPC) ──────────────────────────────────────────

  /**
   * ascending is forum order, oldest first. cursor is null for page 1. hash
   * filters vote discussions. rootOnly fetches top-level replies only, for
   * threaded pagination. force skips the cache.
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
      const cached = getPage(discussionId, ascending, cursor, rootOnly, options.hash)
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

      // has_more is a synthetic RPC column, not part of the row.
      const cleanRows: RawComment[] = rows.map(({ has_more: _hm, ...rest }) => rest as unknown as RawComment)

      const lastRow = cleanRows.at(-1)
      const nextCursor: PageCursor | null = hasMore && lastRow != null
        ? { cursorTime: lastRow.created_at, cursorId: lastRow.id }
        : null

      const page: ReplyPage = { rows: cleanRows, hasMore, nextCursor }
      setPage(discussionId, ascending, cursor, page, rootOnly, options.hash)
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

  // ── Deep-link cursor lookup (RPC) ──────────────────────────────────────────

  // null when the target isn't found (deleted, RLS-filtered, or wrong discussion).
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

      const prevCursor: PageCursor | null
        = row.prev_cursor_time != null && row.prev_cursor_id != null
          ? { cursorTime: row.prev_cursor_time, cursorId: row.prev_cursor_id }
          : null

      return {
        pageIndex: row.page_index,
        predecessorCount: row.predecessor_count,
        cursor,
        prevCursor,
      }
    }
    catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to locate reply'
      return null
    }
  }

  // ── Legacy full-list fetch (kept for realtime patch-back) ──────────────────

  function legacySet(discussionId: string, replies: RawComment[], ascending: boolean): void {
    cache.set(legacyKey(discussionId, ascending), replies, CACHE_TTL)
  }

  // ── Public surface ─────────────────────────────────────────────────────────

  return {
    // State
    loading: readonly(loading),
    error: readonly(error),

    // Page cache primitives
    getPage,
    setPage,
    invalidate,
    invalidateAll,

    // Cursor-based fetch
    fetchPage,

    // Deep-link lookup
    getReplyPageCursor,

    // Legacy full list
    legacySet,
  }
}
