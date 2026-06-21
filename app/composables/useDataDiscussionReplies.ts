import type { Comment, RawComment, ThreadNode } from '@/components/Discussions/Discussion.types'
import type { PageCursor, ReplyPage } from '@/composables/useDiscussionRepliesCache'
import type { Tables } from '@/types/database.overrides'
import type { Database } from '@/types/database.types'
import { useDataNotifications } from '@/composables/useDataNotifications'
import { useDiscussionCache } from '@/composables/useDiscussionCache'
import { PAGE_SIZE_COMMENT, PAGE_SIZE_FORUM, useDiscussionRepliesCache } from '@/composables/useDiscussionRepliesCache'
import { useDiscussionSubscriptionsCache } from '@/composables/useDiscussionSubscriptionsCache'

export interface ReplyGap {
  /** ID of the last item in the block that precedes the gap. */
  afterId: string
  /** Approximate number of replies sitting in the gap (not yet loaded). */
  count: number
  /** Cursor pointing to the first unloaded page inside the gap. */
  cursor: PageCursor
}

/**
 * Manages all comment data for a discussion: fetching pages via cursor-based
 * pagination, modelling into flat/threaded structures, off-topic toggling,
 * deletion, and the seen-marker.
 *
 * Pagination model:
 * - Forum (ascending): oldest first, "load more" appends at the bottom.
 * - Comment (descending): newest first, "load more" appends at the bottom
 *   (which is chronologically older).
 * - `comments` is the accumulated flat list across all loaded pages.
 * - `hasMore` indicates a next page is available.
 * - `loadMore()` fetches the next page and appends to `comments`.
 * - `navigateToComment(id)` resolves the page for a deep-linked comment,
 *   loads pages up to and including that page, then returns true when ready.
 *
 * Threading (threaded view):
 * - Only top-level (root) comments are paginated.
 * - Children are fetched lazily per-root via `loadChildren(rootId)`.
 * - Loaded children are stored in `childrenMap` keyed by parent id.
 */
export function useDataDiscussionReplies(
  props: {
    id: string
    type: string
    model: 'comment' | 'forum'
    hash?: string
    viewMode?: Ref<'flat' | 'threaded'>
    /**
     * Whether replies load via traditional pagination (page controls + loadPage)
     * rather than infinite scroll + gap. Always true for the comment model;
     * driven by a user setting for the forum model. Ordering is unaffected -
     * forum stays ascending regardless. Defaults to (model === 'comment').
     */
    paginated?: Ref<boolean>
    /**
     * Comment id from a ?comment=<id> deep link present on initial mount.
     * When set, the initial load jumps straight to the page containing this
     * comment instead of loading page 1 first (which would be dead time for a
     * deep link). Read once per discussion-id change, at the start of the load.
     */
    initialCommentId?: Ref<string | undefined>
    /**
     * `created_at` (epoch ms) of the deep-linked comment, from a `?ts=` param on
     * the link. In ascending (chronological forum) view a reply's position never
     * shifts, so this timestamp lets the initial load fetch the target block
     * directly - skipping the page-lookup RPC that the deep link otherwise needs.
     * Ignored in threaded/comment views where positions are not stable.
     */
    initialCommentAnchorTs?: Ref<number | undefined>
    /**
     * Page number from a `?page=N` param, used in paginated mode to restore a
     * specific page on initial load (reload / shared link). Read once at the
     * start of the load; ignored when a `?comment=` deep link is present (the
     * deep link resolves its own page) or in infinite mode.
     */
    initialPage?: Ref<number | undefined>
  },
  comments: Ref<RawComment[]>,
  discussion: Ref<Tables<'discussions'> | undefined>,
  userId: Ref<string | null | undefined>,
  onLoaded: (discussionId: string) => void,
  onDeleted?: (id: string) => void,
) {
  const supabase = useSupabaseClient<Database>()
  const discussionCache = useDiscussionCache()
  const repliesCache = useDiscussionRepliesCache()
  const subscriptionsCache = useDiscussionSubscriptionsCache()
  const notifications = useDataNotifications()
  const { waitForSessionReady, isSessionReady } = useSessionReady()

  const loading = ref(false)
  const loadingMore = ref(false)
  const loadingChildren = ref(false)
  const error = ref<string>()
  const offtopicCount = computed(() => comments.value.filter(c => c.is_offtopic).length)

  const ascending = computed(() => props.model !== 'comment')
  // Pagination vs infinite-scroll/gap loading. Independent of ordering: the
  // forum stays ascending whether or not it paginates. Comment model is always
  // paginated; the forum model follows the user's setting (passed in).
  const paginated = computed(() => props.paginated?.value ?? (props.model === 'comment'))
  const pageSize = computed(() => props.model === 'forum' ? PAGE_SIZE_FORUM : PAGE_SIZE_COMMENT)
  // Threaded mode paginates root replies only; flat mode paginates all replies.
  // navigateToComment always uses rootOnly=false so deep links work regardless of mode.
  const rootOnly = computed(() => props.viewMode?.value === 'threaded')

  // The cursor for the next page. null = first page not yet fetched or no more pages.
  const nextCursor = ref<PageCursor | null>(null)
  const hasMore = ref(false)

  // Traditional pagination state (comment model only).
  // cursorHistory[0] = null (page 1 has no predecessor cursor),
  // cursorHistory[n] = cursor needed to fetch page n+1.
  const currentPage = ref(1)
  const cursorHistory = ref<Array<PageCursor | null>>([null])
  // Count of top-level (root) replies. Used as the pagination total in threaded
  // view, where reply_count (which includes children) would invent phantom pages
  // that fetch empty. Populated asynchronously by fetchRootCount.
  const rootCount = ref(0)
  const rootCountLoaded = ref(false)
  // Items the pagination control pages through: every reply in flat view, only
  // top-level entries in threaded view. Until the exact root count loads, fall
  // back to reply_count (an overcount) rather than 0 - otherwise totalPages would
  // collapse to 1 and clamp deep-link / page navigation to page 1 before the
  // count is in (loadPage clamps to totalPages).
  const paginationTotal = computed(() => {
    if (!rootOnly.value)
      return discussion.value?.reply_count ?? 0
    return rootCountLoaded.value ? rootCount.value : (discussion.value?.reply_count ?? 0)
  })
  const totalPages = computed(() => {
    const total = paginationTotal.value
    if (total <= 0)
      return 1
    return Math.max(1, Math.ceil(total / pageSize.value))
  })

  // Children loaded for threaded view, keyed by root comment id.
  const childrenMap = ref<Map<string, RawComment[]>>(new Map())
  const replyCountMap = ref<Map<string, number>>(new Map())

  // Pinned reply fetched independently so the pinned banner works even when
  // the reply lives on a page that hasn't been loaded yet.
  const fetchedPinnedReply = ref<RawComment | null>(null)

  // ── Gap / tail state ────────────────────────────────────────────────────────

  // The "late block" rows: either the tail page (forum initial load) or the
  // deep-linked target page. Tracked so loadGap can splice pages in before
  // them while they remain pinned at the end.
  const _tailBlock = ref<RawComment[]>([])

  // Realtime-appended rows that arrived after a deep-link navigation loaded a
  // tail block. Tracked so applyPage (loadMore) can insert cursor-fetched
  // pages before them, preserving chronological order.
  const _realtimeAppended = ref<RawComment[]>([])

  // Incremented each time navigateToComment resets gap/tailBlock state.
  // loadGapFromTop and loadGapFromBottom capture this before their async
  // fetch and bail if it has changed by the time the fetch returns, preventing
  // a stale gap-page insert from landing in the wrong position.
  let _gapGeneration = 0

  // Incremented each time the comment list is reset (loadFirstPage or navigateToComment).
  // loadMore captures this before its async fetch and discards the result if it has
  // changed - prevents a stale page from being appended after a navigation reset,
  // which would insert old items after the tail block and break chronological order.
  let _listGeneration = 0

  const gap = ref<ReplyGap | null>(null)
  const loadingGapTop = ref(false)
  const loadingGapBottom = ref(false)
  const loadingGap = computed(() => loadingGapTop.value || loadingGapBottom.value)

  /** Approximate number of replies that remain after the current loaded end. */
  const remainingCount = computed((): number => {
    // Threaded mode: reply_count includes children, so the number is misleading.
    if (rootOnly.value)
      return 0
    // Gap exists: the "remaining" for the load-more strip is items after the
    // late block end, not the gap itself (the gap has its own banner).
    if (!hasMore.value)
      return 0
    const total = discussion.value?.reply_count ?? 0
    return Math.max(0, total - comments.value.length - (gap.value?.count ?? 0))
  })

  // ── Data loading ────────────────────────────────────────────────────────────

  // Count top-level replies for threaded-view pagination markers. Index-only
  // count via the roots partial index, mirroring the pagination RPC's filters
  // (discussion_id, optional vote hash, reply_to_id IS NULL). Includes
  // soft-deleted roots, matching what the paginated fetch returns.
  async function fetchRootCount(discussionId: string): Promise<void> {
    const query = supabase
      .from('discussion_replies')
      .select('id', { count: 'exact', head: true })
      .eq('discussion_id', discussionId)
      .is('reply_to_id', null)
    if (props.hash != null)
      query.eq('meta->>hash', props.hash)
    const { count, error: countError } = await query
    if (countError == null) {
      rootCount.value = count ?? 0
      rootCountLoaded.value = true
    }
  }

  async function fetchDiscussion(): Promise<Tables<'discussions'> | null> {
    let fetched: Tables<'discussions'> | null = null

    if (props.type === 'discussion') {
      fetched = await discussionCache.fetchById(props.id)
    }
    else {
      fetched = await discussionCache.fetchByEntity(props.type, props.id)
    }

    return fetched
  }

  /**
   * Load the first page of replies for the current discussion.
   * Loads the first page of replies and sets hasMore/nextCursor normally.
   * Resets the comment list and cursor state.
   */
  async function loadFirstPage(discussionId: string): Promise<void> {
    gap.value = null
    _tailBlock.value = []
    _realtimeAppended.value = []
    _listGeneration++

    const page = await repliesCache.fetchPage(discussionId, {
      ascending: ascending.value,
      pageSize: pageSize.value,
      hash: props.hash,
      rootOnly: rootOnly.value,
      cursor: null,
    })

    if (page == null)
      return

    // Reset pagination history on a fresh first-page load.
    currentPage.value = 1
    cursorHistory.value = [null]

    applyPage(page, true)
  }

  /**
   * Load a specific page by number (1-based). Comment model only.
   * Walks the cursor history forwards as needed, caching each cursor so
   * subsequent back/forward navigations don't re-fetch already-seen pages.
   */
  async function loadPage(page: number): Promise<void> {
    if (!discussion.value || loadingMore.value)
      return

    const targetPage = Math.max(1, Math.min(page, totalPages.value))

    loadingMore.value = true
    // Jumping to an explicit page replaces the visible set, so any deep-link gap
    // (from infinite/anchor navigation) no longer applies.
    gap.value = null
    try {
      // Walk forward through any missing cursors up to the target page.
      // cursorHistory[i] is the cursor needed to start fetching page i+1.
      // So to fetch page N we need cursorHistory[N-1].
      while (cursorHistory.value.length < targetPage) {
        const cursorIdx = cursorHistory.value.length - 1
        const cursor = cursorHistory.value[cursorIdx]!
        const fetched = await repliesCache.fetchPage(discussion.value.id, {
          ascending: ascending.value,
          cursor,
          pageSize: pageSize.value,
          hash: props.hash,
          rootOnly: rootOnly.value,
        })
        if (fetched == null)
          break
        if (cursorHistory.value.length <= cursorIdx + 1 && fetched.nextCursor != null)
          cursorHistory.value.push(fetched.nextCursor)
        else
          break
      }

      const cursor = cursorHistory.value[targetPage - 1] ?? null
      const result = await repliesCache.fetchPage(discussion.value.id, {
        ascending: ascending.value,
        cursor,
        pageSize: pageSize.value,
        hash: props.hash,
        rootOnly: rootOnly.value,
      })

      if (result == null)
        return

      // Store the next cursor in history if we don't have it yet.
      if (result.nextCursor != null && cursorHistory.value.length <= targetPage)
        cursorHistory.value.push(result.nextCursor)

      currentPage.value = targetPage
      // Clear childrenMap so re-opening a reply sheet after a page change
      // re-fetches rather than using stale entries that are no longer in comments.
      childrenMap.value = new Map()
      applyPage(result, true)
    }
    finally {
      loadingMore.value = false
    }
  }

  /**
   * Append the next page of replies to the current list.
   * No-op when `hasMore` is false or a fetch is already in flight.
   */
  async function loadMore(): Promise<void> {
    if (!hasMore.value || loadingMore.value || !discussion.value)
      return

    loadingMore.value = true
    const myGeneration = _listGeneration

    try {
      const page = await repliesCache.fetchPage(
        discussion.value.id,
        {
          ascending: ascending.value,
          cursor: nextCursor.value,
          pageSize: pageSize.value,
          hash: props.hash,
          rootOnly: rootOnly.value,
        },
      )

      if (page == null)
        return

      // Discard result if the list was reset (navigateToComment or loadFirstPage
      // ran while we were waiting) - appending a stale page would place older
      // items after the tail block and break chronological order.
      if (_listGeneration !== myGeneration)
        return

      applyPage(page, false)
    }
    finally {
      loadingMore.value = false
    }
  }

  /**
   * Apply a fetched page to the comment list.
   * @param page - The fetched page to apply.
   * @param reset - When true, replaces the list; when false, appends.
   */
  function applyPage(page: ReplyPage, reset: boolean): void {
    if (reset) {
      comments.value = page.rows
      _realtimeAppended.value = []
    }
    else {
      // De-duplicate: realtime may have already added some of these rows
      const existingIds = new Set(comments.value.map(c => c.id))
      const fresh = page.rows.filter(r => !existingIds.has(r.id))

      // If realtime replies were appended after the tail block, insert cursor
      // pages before them to maintain chronological order. Realtime items are
      // always newer than anything fetched via the DB cursor, so they must
      // remain at the very end of the list.
      if (_realtimeAppended.value.length > 0 && fresh.length > 0) {
        const firstRealtimeId = _realtimeAppended.value[0]!.id
        const insertPoint = comments.value.findIndex(c => c.id === firstRealtimeId)
        if (insertPoint !== -1) {
          comments.value = [
            ...comments.value.slice(0, insertPoint),
            ...fresh,
            ...comments.value.slice(insertPoint),
          ]
        }
        else {
          comments.value = [...comments.value, ...fresh]
        }
      }
      else {
        comments.value = [...comments.value, ...fresh]
      }
    }
    hasMore.value = page.hasMore
    nextCursor.value = page.nextCursor
  }

  /**
   * Fast path for an anchored chronological deep link. Fetches page 1 and the
   * target block (anchored on the comment's own timestamp) in parallel, with no
   * page-lookup RPC on the critical path. The exact "hidden replies" gap count
   * does need the comment's absolute position, so we seed an estimate (keeps the
   * gap banner from popping in and shifting layout) and refine it from the cursor
   * RPC in the background. Returns false when the anchor misses so the caller can
   * fall back to the authoritative RPC path.
   */
  async function navigateViaAnchor(targetId: string, anchorTs: number, options?: { soft?: boolean }): Promise<boolean> {
    if (!discussion.value)
      return false

    const discussionId = discussion.value.id

    if (!options?.soft)
      loading.value = true
    gap.value = null
    _tailBlock.value = []
    _realtimeAppended.value = []
    _gapGeneration++
    _listGeneration++
    const myGeneration = _listGeneration

    try {
      const fetchOpts = { ascending: ascending.value, pageSize: pageSize.value, hash: props.hash, rootOnly: false }

      // Cursor positioned immediately before the target: same created_at, lowest
      // possible uuid. fetchPage returns rows strictly greater than the cursor,
      // so the target comment is the first qualifying row of the block.
      const anchorCursor = {
        cursorTime: new Date(anchorTs).toISOString(),
        cursorId: '00000000-0000-0000-0000-000000000000',
      }

      const [firstPage, targetBlock] = await Promise.all([
        repliesCache.fetchPage(discussionId, { ...fetchOpts, cursor: null }),
        repliesCache.fetchPage(discussionId, { ...fetchOpts, cursor: anchorCursor }),
      ])

      if (firstPage == null || targetBlock == null)
        return false

      // A newer navigation started while we were fetching - leave its result.
      if (_listGeneration !== myGeneration)
        return true

      const firstIds = new Set(firstPage.rows.map(r => r.id))

      // Target is actually on page 1.
      if (firstIds.has(targetId)) {
        applyPage(firstPage, true)
        return true
      }

      // Anchor missed (stale link / deleted) - bail to the RPC path.
      if (!targetBlock.rows.some(r => r.id === targetId))
        return false

      const fresh = targetBlock.rows.filter(r => !firstIds.has(r.id))
      _tailBlock.value = fresh
      comments.value = [...firstPage.rows, ...fresh]
      hasMore.value = targetBlock.hasMore
      nextCursor.value = targetBlock.nextCursor

      // Gap between page 1 and the target block. Seed an estimate from the total
      // reply count, then refine to the exact count from the cursor RPC's
      // predecessor count (replies strictly before the target) in the background.
      if (firstPage.nextCursor != null && firstPage.rows.length > 0) {
        const totalReplies = discussion.value.reply_count ?? 0
        const estimate = Math.max(1, totalReplies - firstPage.rows.length - fresh.length)
        gap.value = { afterId: firstPage.rows.at(-1)!.id, count: estimate, cursor: firstPage.nextCursor }

        const gapGen = _gapGeneration
        void repliesCache.getReplyPageCursor(discussionId, targetId, fetchOpts).then((res) => {
          // Discard if a newer navigation replaced the gap in the meantime.
          if (res == null || gap.value == null || _gapGeneration !== gapGen)
            return
          const exact = res.predecessorCount - firstPage.rows.length
          gap.value = exact > 0 ? { ...gap.value, count: exact } : null
        })
      }

      return true
    }
    finally {
      if (!options?.soft)
        loading.value = false
    }
  }

  /**
   * Resolve a deep-linked comment id by loading page 1 and the target page
   * simultaneously. A gap is established between them when the target is not
   * on page 1. Returns true when the target is present in the loaded set.
   *
   * Always uses rootOnly=false so child replies can be deep-linked regardless
   * of the current view mode.
   *
   * Returns false when the target reply cannot be found (deleted, wrong
   * discussion, or RLS-filtered).
   */
  async function navigateToComment(targetId: string, options?: { soft?: boolean, anchorTs?: number }): Promise<boolean> {
    if (!discussion.value)
      return false

    const discussionId = discussion.value.id

    // Already loaded - nothing to do. Checked before any fetch so a no-op
    // navigation (target already on screen) costs nothing.
    if (comments.value.some(c => c.id === targetId))
      return true

    // Fast path: an anchored deep link in chronological (ascending flat forum)
    // view. Positions never shift there, so the comment's own timestamp lets us
    // fetch the target block directly and skip the page-lookup RPC - one round
    // trip instead of two (RPC then target fetch). Falls through to the RPC path
    // below if the anchor misses (stale link, deleted reply, or an edge case).
    if (options?.anchorTs != null && ascending.value && !paginated.value && props.model !== 'comment' && props.viewMode?.value !== 'threaded') {
      const ok = await navigateViaAnchor(targetId, options.anchorTs, options)
      if (ok)
        return true
    }

    // Deep-link cursor lookup always uses the full (non-root-only) set so
    // child replies can be targeted even in threaded mode.
    const result = await repliesCache.getReplyPageCursor(
      discussionId,
      targetId,
      {
        ascending: ascending.value,
        pageSize: pageSize.value,
        hash: props.hash,
        rootOnly: false,
      },
    )

    if (result == null)
      return false

    // Already loaded - re-checked: navigateViaAnchor (or a concurrent nav) may
    // have populated the list while the RPC was in flight.
    if (comments.value.some(c => c.id === targetId))
      return true

    // Paginated mode (comment model, or forum with pagination on): jump straight
    // to the target page via loadPage, no gap mechanism.
    if (paginated.value) {
      // The page index must be in the same space the pages use. `result` was
      // resolved with rootOnly:false (so child replies can be targeted), which
      // matches flat pagination. Threaded paginates top-level entries only, so
      // re-resolve there. A child reply has no root page of its own - bail so the
      // caller falls back rather than landing on the wrong (clamped) page.
      let pageIndex = result.pageIndex
      if (rootOnly.value) {
        const rootResult = await repliesCache.getReplyPageCursor(discussionId, targetId, {
          ascending: ascending.value,
          pageSize: pageSize.value,
          hash: props.hash,
          rootOnly: true,
        })
        if (rootResult == null)
          return false
        pageIndex = rootResult.pageIndex
      }
      if (!options?.soft)
        loading.value = true
      try {
        await loadPage(pageIndex + 1)
      }
      finally {
        if (!options?.soft)
          loading.value = false
      }
      return comments.value.some(c => c.id === targetId)
    }

    if (!options?.soft)
      loading.value = true
    gap.value = null
    _tailBlock.value = []
    _realtimeAppended.value = []
    _gapGeneration++
    _listGeneration++

    try {
      const fetchOpts = { ascending: ascending.value, pageSize: pageSize.value, hash: props.hash, rootOnly: false }

      // Fetch page 1, an optional context page (page N-1), and the target
      // page in parallel. When the target is on page N >= 2 and prevCursor is
      // available, we also load page N-1 so the user always sees at least one
      // page of context immediately before the target comment.
      const [firstPage, prevPage, targetPage] = await Promise.all([
        repliesCache.fetchPage(discussionId, { ...fetchOpts, cursor: null }),
        result.prevCursor != null
          ? repliesCache.fetchPage(discussionId, { ...fetchOpts, cursor: result.prevCursor })
          : Promise.resolve(null),
        result.pageIndex === 0
          ? Promise.resolve(null) // target is on page 1, no second fetch needed
          : repliesCache.fetchPage(discussionId, { ...fetchOpts, cursor: result.cursor }),
      ])

      if (firstPage == null)
        return false

      if (targetPage == null) {
        // Target is on page 1.
        applyPage(firstPage, true)
      }
      else {
        // Page 1 + target page (and optionally page N-1) loaded.
        // Tail block = [prevPage rows] + [target page rows], deduped.
        const firstPageIds = new Set(firstPage.rows.map(r => r.id))
        const prevRows = prevPage?.rows.filter(r => !firstPageIds.has(r.id)) ?? []
        const prevIds = new Set(prevRows.map(r => r.id))
        const freshTarget = targetPage.rows.filter(r => !firstPageIds.has(r.id) && !prevIds.has(r.id))

        const tailRows = [...prevRows, ...freshTarget]
        _tailBlock.value = tailRows
        comments.value = [...firstPage.rows, ...tailRows]

        // Gap sits between the end of page 1 and the start of the first tail
        // page (page N-1 when prevCursor was available, page N otherwise).
        //
        // When prevPage is loaded: gap ends at page N-1 start, so:
        //   gapCount = (pageIndex - 1) * pageSize - firstPage.rows.length
        // When no prevPage: gap ends at page N start, so:
        //   gapCount = pageIndex * pageSize - firstPage.rows.length
        const tailStartPageIndex = result.prevCursor != null ? result.pageIndex - 1 : result.pageIndex
        const gapCount = tailStartPageIndex * pageSize.value - firstPage.rows.length

        if (gapCount > 0 && firstPage.nextCursor != null) {
          gap.value = {
            afterId: firstPage.rows.at(-1)!.id,
            count: gapCount,
            cursor: firstPage.nextCursor,
          }
        }

        hasMore.value = targetPage.hasMore
        nextCursor.value = targetPage.nextCursor
      }
    }
    finally {
      if (!options?.soft)
        loading.value = false
    }

    return comments.value.some(c => c.id === targetId)
  }

  /**
   * Navigate to the reply closest to a given date. Resolves the nearest reply
   * id via RPC then delegates to navigateToComment.
   *
   * If all replies are already loaded (hasMore is false and no gap exists),
   * the nearest reply is resolved locally without an RPC round-trip.
   *
   * Options:
   *   findFirst - when true, uses ceiling semantics: finds the FIRST reply
   *     at or after the target time (for ascending mode). This is used by
   *     timeline segment clicks so that clicking a block always navigates to
   *     the start of that activity block rather than its end.
   *     Default is false (floor semantics: last reply at or before target).
   *
   * Returns the resolved reply id on success (caller can use it to scroll),
   * null on RPC error, no replies found, or navigation failure.
   */
  async function navigateToDate(date: Date, { findFirst = false }: { findFirst?: boolean } = {}): Promise<string | null> {
    if (!discussion.value)
      return null

    // Short-circuit: if every reply is already in memory, resolve locally. Only
    // valid for infinite loading, where `!hasMore` means the whole thread is
    // loaded. In paginated mode `!hasMore` just means we're on the last page, so
    // resolving locally would clamp to that page and skip the loadPage that
    // updates the current page - always go through the RPC path there instead.
    if (!paginated.value && !hasMore.value && gap.value == null && comments.value.length > 0) {
      const targetMs = date.getTime()

      if (findFirst) {
        // Ceiling semantics: first reply at or after the target.
        // Sort ascending and find the earliest reply >= target.
        const sorted = [...comments.value].sort((a, b) => {
          const diff = new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
          return ascending.value ? diff : -diff
        })
        const ceil = sorted.find(c => new Date(c.created_at).getTime() >= targetMs)
        // Nothing at or after the target - clamp to the last reply in sort order.
        return (ceil ?? sorted.at(-1)!).id
      }
      else {
        // Floor semantics: the last post at or before the target date.
        // "I clicked March 6" means "show me what was most recently posted as of
        // March 6", not "find whatever timestamp is closest in either direction."
        let floor: typeof comments.value[0] | null = null

        for (const c of comments.value) {
          const ms = new Date(c.created_at).getTime()
          if (ms <= targetMs) {
            if (floor == null || ms > new Date(floor.created_at).getTime()) {
              floor = c
            }
          }
        }

        // Nothing at or before the target - clamp to the first reply.
        return (floor ?? comments.value[0]!).id
      }
    }

    const { data: rows, error: rpcError } = (await supabase.rpc('get_discussion_reply_nearest_to_date', {
      p_discussion_id: discussion.value.id,
      p_target_time: date.toISOString(),
      p_ascending: ascending.value,
      p_hash: props.hash ?? undefined,
      p_root_only: false,
      p_find_first: findFirst,
    })) as { data: Array<{ id: string }> | null, error: { message: string } | null }
    if (rpcError != null || rows == null || rows.length === 0)
      return null

    const nearestId = rows[0]!.id
    const found = await navigateToComment(nearestId, { soft: true })
    return found ? nearestId : null
  }

  /**
   * Fill the gap between the early block and the late block by loading one
   * page from the TOP of the gap and one page from the BOTTOM simultaneously.
   *
   * This binary-split approach means a 250-reply gap takes O(log N) clicks
   * rather than O(N/pageSize) clicks to fully bridge. Each click roughly
   * halves the remaining gap by consuming pages from both ends.
   *
   * The _tailBlock tracks items pinned at the end (originally the tail page,
   * then extended with each bottom-page fetch). The gap banner sits between
   * the last early item and the first tail item.
   */
  async function loadGapFromTop(): Promise<void> {
    if (gap.value == null || !discussion.value || loadingGap.value)
      return

    loadingGapTop.value = true

    try {
      const tailIds = new Set(_tailBlock.value.map(r => r.id))
      const discussionId = discussion.value.id
      const fetchOpts = {
        ascending: ascending.value,
        pageSize: pageSize.value,
        hash: props.hash,
        rootOnly: rootOnly.value,
      }
      const myGeneration = _gapGeneration

      const forwardPage = await repliesCache.fetchPage(discussionId, { ...fetchOpts, cursor: gap.value.cursor })

      if (forwardPage == null)
        return

      // navigateToComment reset state during our fetch - discard stale result.
      if (_gapGeneration !== myGeneration)
        return

      const firstTailId = _tailBlock.value[0]?.id
      const insertPoint = firstTailId != null
        ? comments.value.findIndex(c => c.id === firstTailId)
        : -1
      const splice = insertPoint >= 0 ? insertPoint : comments.value.length

      const existingIds = new Set(comments.value.map(c => c.id))
      const freshForward = forwardPage.rows.filter(r => !existingIds.has(r.id))

      if (freshForward.length > 0) {
        comments.value = [
          ...comments.value.slice(0, splice),
          ...freshForward,
          ...comments.value.slice(splice),
        ]
      }

      const reachedTail = forwardPage.rows.some(r => tailIds.has(r.id))
      const gapClosed = reachedTail || !forwardPage.hasMore || forwardPage.nextCursor == null

      if (gapClosed) {
        gap.value = null
        _tailBlock.value = []
        _realtimeAppended.value = []
        if (forwardPage.hasMore && !reachedTail && forwardPage.nextCursor != null) {
          hasMore.value = true
          nextCursor.value = forwardPage.nextCursor
        }
      }
      else {
        gap.value = {
          afterId: freshForward.at(-1)?.id ?? gap.value.afterId,
          count: Math.max(0, gap.value.count - freshForward.length),
          cursor: forwardPage.nextCursor!,
        }
      }
    }
    finally {
      loadingGapTop.value = false
    }
  }

  async function loadGapFromBottom(): Promise<void> {
    if (gap.value == null || !discussion.value || loadingGap.value)
      return

    loadingGapBottom.value = true

    try {
      const firstTailItem = _tailBlock.value[0]
      if (firstTailItem == null) {
        loadingGapBottom.value = false
        return
      }

      const discussionId = discussion.value.id
      const fetchOpts = {
        ascending: ascending.value,
        pageSize: pageSize.value,
        hash: props.hash,
        rootOnly: rootOnly.value,
      }
      const myGeneration = _gapGeneration

      const bottomPage = await repliesCache.fetchPage(discussionId, {
        ...fetchOpts,
        ascending: !ascending.value,
        cursor: { cursorTime: firstTailItem.created_at, cursorId: firstTailItem.id },
      })

      if (bottomPage == null)
        return

      // navigateToComment reset state during our fetch - discard stale result.
      if (_gapGeneration !== myGeneration)
        return

      // Bottom page arrives in reverse order - flip back to ascending.
      const bottomRows = [...bottomPage.rows].reverse()

      const firstTailId = _tailBlock.value[0]?.id
      const insertPoint = firstTailId != null
        ? comments.value.findIndex(c => c.id === firstTailId)
        : -1
      const splice = insertPoint >= 0 ? insertPoint : comments.value.length

      const existingIds = new Set(comments.value.map(c => c.id))
      const freshBottom = bottomRows.filter(r => !existingIds.has(r.id))

      if (freshBottom.length > 0) {
        comments.value = [
          ...comments.value.slice(0, splice),
          ...freshBottom,
          ...comments.value.slice(splice),
        ]
      }

      // Gap is closed when the reverse page ran out of rows (hit the early block boundary).
      const gapClosed = !bottomPage.hasMore || freshBottom.length === 0

      if (gapClosed) {
        gap.value = null
        _tailBlock.value = []
        _realtimeAppended.value = []
      }
      else {
        _tailBlock.value = [...freshBottom, ..._tailBlock.value]
        gap.value = {
          afterId: gap.value.afterId,
          count: Math.max(0, gap.value.count - freshBottom.length),
          cursor: gap.value.cursor,
        }
      }
    }
    finally {
      loadingGapBottom.value = false
    }
  }

  // ── Threaded view: lazy child loading ──────────────────────────────────────

  /**
   * Fetch direct children for a root comment (threaded view).
   * Results are stored in `childrenMap` and also appended to `comments`
   * so that the flat-mode computed properties continue to work correctly
   * without a full re-fetch.
   *
   * Uses a simple ascending query - children are always a small, bounded set
   * so cursor pagination is not needed here.
   */
  async function loadChildren(rootId: string): Promise<void> {
    if (!discussion.value)
      return

    // Already fetched - avoid duplicate network calls.
    if (childrenMap.value.has(rootId))
      return

    loadingChildren.value = true

    try {
      const { data, error: fetchError } = await supabase
        .from('discussion_replies')
        .select('*')
        .eq('discussion_id', discussion.value.id)
        .eq('reply_to_id', rootId)
        .order('created_at', { ascending: true })
        .limit(200)

      if (fetchError != null || data == null)
        return

      const children = data as RawComment[]

      childrenMap.value = new Map(childrenMap.value).set(rootId, children)
    }
    finally {
      loadingChildren.value = false
    }
  }

  async function fetchReplyCountMap(discussionId: string): Promise<void> {
    const { data, error } = await supabase
      .rpc('get_discussion_reply_counts', { p_discussion_id: discussionId })

    if (error != null || data == null)
      return

    const map = new Map<string, number>()
    for (const row of data)
      map.set(row.comment_id, row.descendant_count)
    replyCountMap.value = map
  }

  // ── Initial load ────────────────────────────────────────────────────────────

  watch(
    () => props.id,
    async () => {
      error.value = undefined

      // The view/pagination mode comes from user settings, which load async. If we
      // decide how to load before they're in, the deep-link runs in the default
      // (infinite/flat) mode and a later mode flip resets it - producing the
      // inconsistent "stuck on page 1 / all comments / wrong page" behaviour. Wait
      // for the session so paginated/threaded are settled first. Skip the await
      // when already ready (back-nav) so the synchronous cache fast-path below
      // still applies without a skeleton flash.
      if (!isSessionReady())
        await waitForSessionReady()

      // Deep-link target present on this load? Captured once up-front so it's
      // stable across awaits. When set (forum model only), we jump straight to
      // the page containing the target instead of loading page 1 first - the
      // page-1 load is pure dead time for a deep link.
      const initialTargetId = props.initialCommentId?.value
      const initialAnchorTs = props.initialCommentAnchorTs?.value
      const initialPage = props.initialPage?.value

      // Reset pagination state on discussion change.
      nextCursor.value = null
      hasMore.value = false
      currentPage.value = 1
      cursorHistory.value = [null]
      childrenMap.value = new Map()
      fetchedPinnedReply.value = null
      gap.value = null
      _tailBlock.value = []
      _realtimeAppended.value = []
      rootCount.value = 0
      rootCountLoaded.value = false

      // ── Synchronous cache fast-path ─────────────────────────────────────────
      // If the discussion meta AND the first reply page are already in
      // localStorage, populate state immediately without setting loading = true.
      // This prevents the skeleton flash on back-navigation.
      const _asc = ascending.value
      const _ro = rootOnly.value

      const quickDiscussion = props.type === 'discussion'
        ? discussionCache.getById(props.id)
        : discussionCache.getByEntity(props.type, props.id)

      let fastPathComplete = false

      if (quickDiscussion != null) {
        const quickPage = repliesCache.getPage(quickDiscussion.id, _asc, null, _ro)

        if (quickPage != null) {
          discussion.value = quickDiscussion
          currentPage.value = 1
          cursorHistory.value = [null]
          applyPage(quickPage, true)
          fastPathComplete = true
        }
      }

      if (!fastPathComplete)
        loading.value = true

      const fetchedDiscussion = await fetchDiscussion()

      if (discussionCache.error.value != null) {
        loading.value = false
        error.value = discussionCache.error.value
        return
      }

      if (fetchedDiscussion == null) {
        loading.value = false
        comments.value = []
        return
      }

      discussion.value = fetchedDiscussion

      void markDiscussionSeen(fetchedDiscussion.id)

      // Deep-link jump (forum model): go straight to the page containing the
      // target comment as the initial content. The cursor RPC only needs the
      // discussion id + target id + page size (all known now), so we don't wait
      // for - or run - the page-1 load. navigateToComment establishes the gap
      // and tail block itself. soft:true keeps loading=true (already set above)
      // so the skeleton stays until the target content is in place.
      const wantsDeepLink = initialTargetId != null && props.model !== 'comment'

      if (wantsDeepLink) {
        // If the fast-path already loaded page 1 and it happens to contain the
        // target, navigateToComment short-circuits (returns immediately).
        const found = await navigateToComment(initialTargetId, { soft: true, anchorTs: initialAnchorTs })
        // Target not found (deleted / RLS-filtered) and the fast-path didn't
        // already populate the list: fall back to a normal page-1 load so the
        // thread still renders instead of showing an empty list.
        if (!found && !fastPathComplete)
          await loadFirstPage(fetchedDiscussion.id)
      }
      else if (paginated.value && initialPage != null && initialPage > 1) {
        // Restore a specific page from ?page= (paginated mode, no deep link).
        // loadPage replaces the list with that page and clamps to the available
        // range, so a stale/too-large page falls back to the last real page.
        await loadPage(initialPage)
      }
      else if (!fastPathComplete) {
        await loadFirstPage(fetchedDiscussion.id)
      }

      // Reply counts (threaded view) are not needed for first paint - fetch in
      // the background so the recursive RPC never blocks rendering comments.
      void fetchReplyCountMap(fetchedDiscussion.id)

      // Threaded pagination markers need the top-level count; fetch in the
      // background (only relevant in threaded view).
      if (rootOnly.value)
        void fetchRootCount(fetchedDiscussion.id)

      // Independently fetch the pinned reply if page 1 didn't include it.
      // This ensures the pinned banner works even when the reply is on a later page.
      const pinnedId = fetchedDiscussion.pinned_reply_id
      if (pinnedId != null) {
        const fromPage = comments.value.find(c => c.id === pinnedId)
        if (fromPage != null) {
          fetchedPinnedReply.value = fromPage
        }
        else {
          const { data: pinnedRows } = await supabase
            .from('discussion_replies')
            .select('*')
            .eq('id', pinnedId)
            .limit(1)
          if (pinnedRows != null && pinnedRows.length > 0)
            fetchedPinnedReply.value = pinnedRows[0] as RawComment
        }
      }

      loading.value = false
      onLoaded(fetchedDiscussion.id)
    },
    { immediate: true },
  )

  // ── View mode reload ────────────────────────────────────────────────────────

  // When the user switches between flat and threaded view, the rootOnly flag
  // changes so we need to re-fetch page 1 for the new mode. The cache keyed
  // by rootOnly means switching back is instant within the TTL.
  if (props.viewMode != null) {
    watch(props.viewMode, async () => {
      if (!discussion.value)
        return
      nextCursor.value = null
      hasMore.value = false
      childrenMap.value = new Map()
      // Refresh the top-level count when entering threaded view (paginates roots).
      if (rootOnly.value)
        void fetchRootCount(discussion.value.id)
      await loadFirstPage(discussion.value.id)
    })
  }

  // ── Seen marker ─────────────────────────────────────────────────────────────

  async function markDiscussionSeen(discussionId: string) {
    if (userId.value == null)
      return

    subscriptionsCache.applyLastSeen(userId.value, discussionId)

    const pendingNotification = notifications.discussionNotifications.value.find(
      n => n.source_id === discussionId,
    )

    const isSubscribed = subscriptionsCache.getStatus(userId.value, discussionId)

    const ops: PromiseLike<unknown>[] = []

    if (isSubscribed !== false) {
      ops.push(
        supabase
          .from('discussion_subscriptions')
          .update({ last_seen_at: new Date().toISOString() })
          .eq('user_id', userId.value)
          .eq('discussion_id', discussionId),
      )
    }

    if (pendingNotification != null) {
      ops.push(
        supabase
          .from('user_notifications')
          .update({ is_read: true })
          .eq('user_id', userId.value)
          .eq('source', 'discussion_reply')
          .eq('source_id', discussionId)
          .eq('is_read', false),
      )
      notifications.markRead(pendingNotification.id)
    }

    await Promise.allSettled(ops)
  }

  // ── Comment modelling ───────────────────────────────────────────────────────

  /**
   * Flat list of comments with their `reply` object resolved.
   */
  const modelledComments = computed((): Comment[] => {
    const data = comments.value ?? []

    const lookup = new Map<string | number, RawComment>(
      data.map(item => [item.id, item]),
    )

    return data.map((item): Comment => {
      const foundReply = item.reply_to_id != null
        ? lookup.get(item.reply_to_id)
        : null

      return {
        ...item,
        reply: foundReply ?? null,
      }
    })
  })

  /**
   * Build a node map from the flat `modelledComments` list.
   * Maps comment.id → ThreadNode (comment + direct children).
   *
   * Children fetched via loadChildren() live in childrenMap and are NOT merged
   * into the flat comments list (to prevent them rendering as top-level items).
   * Instead, we pull them in here directly from childrenMap so the sheet and
   * threaded view both stay consistent without polluting the flat list.
   */
  const threadNodeMap = computed((): Map<string, ThreadNode> => {
    const data = modelledComments.value
    const lookup = new Map<string, Comment>(data.map(c => [c.id, c]))
    const nodeMap = new Map<string, ThreadNode>(
      data.map(c => [c.id, { comment: c, children: [] }]),
    )

    // First pass: wire up reply relationships within the already-loaded flat list.
    for (const comment of data) {
      if (comment.reply_to_id != null && lookup.has(comment.reply_to_id)) {
        nodeMap.get(comment.reply_to_id)!.children.push(nodeMap.get(comment.id)!)
      }
    }

    // Second pass: attach lazily-fetched children from childrenMap for any root
    // that has been expanded. These rows are not in the flat list so we create
    // lightweight ThreadNodes for them on the fly.
    for (const [rootId, children] of childrenMap.value) {
      const rootNode = nodeMap.get(rootId)
      if (rootNode == null)
        continue
      for (const child of children) {
        // Skip if already wired up from the flat list to avoid duplicates.
        if (nodeMap.has(child.id))
          continue
        const childComment: Comment = { ...child, reply: null }
        const childNode: ThreadNode = { comment: childComment, children: [] }
        nodeMap.set(child.id, childNode)
        rootNode.children.push(childNode)
      }
    }

    return nodeMap
  })

  /**
   * Top-level thread roots for threaded view.
   * Only root comments (no parent in this discussion) are included here.
   * Children are loaded lazily via `loadChildren()`.
   */
  const threadRoots = computed((): ThreadNode[] => {
    const data = modelledComments.value
    const lookup = new Map<string, Comment>(data.map(c => [c.id, c]))
    return data
      .filter(c => c.reply_to_id == null || !lookup.has(c.reply_to_id))
      .map(c => threadNodeMap.value.get(c.id)!)
  })

  // ── Off-topic ───────────────────────────────────────────────────────────────

  async function toggleOfftopic(comment: Comment) {
    const nextValue = !comment.is_offtopic

    const { error: updateError } = await supabase
      .from('discussion_replies')
      .update({ is_offtopic: nextValue })
      .eq('id', comment.id)

    if (updateError)
      return

    const descendantIds = collectDescendantIds(comment.id)
    for (const c of comments.value) {
      if (c.id === comment.id || descendantIds.has(c.id)) {
        c.is_offtopic = nextValue
      }
    }

    // Bust the page cache so a reload fetches fresh data with the updated
    // is_offtopic values instead of serving the stale cached pages.
    repliesCache.invalidate(props.id)
  }

  function collectDescendantIds(parentId: string): Set<string> {
    const result = new Set<string>()
    const queue = [parentId]
    while (queue.length > 0) {
      const current = queue.shift()!
      for (const c of comments.value) {
        if (c.reply_to_id === current) {
          result.add(c.id)
          queue.push(c.id)
        }
      }
    }
    return result
  }

  // ── Deletion ────────────────────────────────────────────────────────────────

  async function deleteComment(id: string): Promise<void> {
    const res = await supabase
      .from('discussion_replies')
      .update({ is_deleted: true, markdown: '' })
      .eq('id', id)

    if (res.error) {
      throw new Error(res.error.message)
    }

    if (discussion.value != null)
      void fetchReplyCountMap(discussion.value.id)

    const comment = comments.value.find(c => c.id === id)
    if (comment) {
      comment.is_deleted = true
      comment.markdown = ''
    }

    if (discussion.value?.pinned_reply_id === id) {
      const { error: pinError } = await supabase
        .from('discussions')
        .update({ pinned_reply_id: null })
        .eq('id', discussion.value.id)

      if (!pinError) {
        discussion.value.pinned_reply_id = null
      }
    }

    onDeleted?.(id)
  }

  async function forceDeleteComment(id: string): Promise<void> {
    const res = await supabase
      .from('discussion_replies')
      .delete()
      .eq('id', id)

    if (res.error) {
      throw new Error(res.error.message)
    }

    if (discussion.value != null)
      void fetchReplyCountMap(discussion.value.id)

    comments.value = comments.value.filter(c => c.id !== id)

    if (discussion.value?.pinned_reply_id === id) {
      const { error: pinError } = await supabase
        .from('discussions')
        .update({ pinned_reply_id: null })
        .eq('id', discussion.value.id)

      if (!pinError) {
        discussion.value.pinned_reply_id = null
      }
    }

    onDeleted?.(id)
  }

  /**
   * Append realtime-delivered replies to the comment list.
   *
   * For the forum model (ascending), if cursor-based pagination is still in
   * flight (hasMore or _tailBlock active), we track the realtime items
   * separately so applyPage (loadMore) can insert cursor pages before them,
   * keeping the list in chronological order.
   *
   * For the comment model (descending), new replies are prepended - they are
   * always the newest and belong at the top.
   */
  function pushRealtimeReplies(newReplies: RawComment[], ascendingOrder: boolean): void {
    if (newReplies.length === 0)
      return

    const existingIds = new Set(comments.value.map(c => c.id))
    const fresh = newReplies.filter(r => !existingIds.has(r.id))
    if (fresh.length === 0)
      return

    if (ascendingOrder) {
      // Track these as realtime-appended so loadMore can insert cursor pages
      // before them.
      _realtimeAppended.value = [..._realtimeAppended.value, ...fresh]
      comments.value = [...comments.value, ...fresh]
    }
    else {
      // Descending (comment model): prepend newest replies at the top.
      comments.value = [...fresh, ...comments.value]
    }
  }

  return {
    loading,
    loadingMore,
    loadingChildren,
    loadingGap,
    loadingGapTop,
    loadingGapBottom,
    error,
    hasMore,
    gap,
    remainingCount,
    fetchedPinnedReply,
    modelledComments,
    threadNodeMap,
    threadRoots,
    childrenMap,
    replyCountMap,
    currentPage,
    totalPages,
    paginationTotal,
    loadMore,
    loadPage,
    loadGapFromTop,
    loadGapFromBottom,
    navigateToComment,
    navigateToDate,
    loadChildren,
    toggleOfftopic,
    deleteComment,
    forceDeleteComment,
    offtopicCount,
    pushRealtimeReplies,
  }
}
