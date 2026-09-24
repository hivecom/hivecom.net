import type { Comment, RawComment, ThreadNode } from '@/components/Discussions/Discussion.types'
import type { PageCursor, ReplyPage } from '@/composables/useDiscussionRepliesCache'
import type { Tables } from '@/types/database.overrides'
import type { Database } from '@/types/database.types'
import { useDataNotifications } from '@/composables/useDataNotifications'
import { useDiscussionCache } from '@/composables/useDiscussionCache'
import { PAGE_SIZE_COMMENT, PAGE_SIZE_FORUM, useDiscussionRepliesCache } from '@/composables/useDiscussionRepliesCache'
import { useDiscussionSubscriptionsCache } from '@/composables/useDiscussionSubscriptionsCache'

export interface ReplyGap {
  /** Last loaded item before the gap. */
  afterId: string

  /** Approximate, the gap isn't loaded. */
  count: number

  /** First unloaded page inside the gap. */
  cursor: PageCursor
}

/**
 * Forum replies load ascending (oldest first), the comment model descending
 * (newest first). Either way "load more" appends at the bottom. Threaded view
 * paginates roots only and loads children lazily per root.
 */
export function useDataDiscussionReplies(
  props: {
    id: string
    type: string
    model: 'comment' | 'forum'
    hash?: string
    viewMode?: Ref<'flat' | 'threaded'>
    /** Page controls instead of infinite scroll + gap. Doesn't change ordering. */
    paginated?: Ref<boolean>
    /**
     * From a ?comment= deep link. Read once per discussion change: the initial
     * load jumps straight to its page and skips page 1.
     */
    initialCommentId?: Ref<string | undefined>
    /**
     * Epoch ms from the link's ?ts= param. In ascending flat forum view positions
     * never shift, so the target block can be fetched without the page-lookup RPC.
     */
    initialCommentAnchorTs?: Ref<number | undefined>
    /** ?page=N to restore in paginated mode. Ignored when a ?comment= link is present. */
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

  const paginated = computed(() => props.paginated?.value ?? (props.model === 'comment'))
  const pageSize = computed(() => props.model === 'forum' ? PAGE_SIZE_FORUM : PAGE_SIZE_COMMENT)

  // Threaded mode paginates roots only. Deep links ignore this and resolve with
  // rootOnly=false so child replies stay reachable.
  const rootOnly = computed(() => props.viewMode?.value === 'threaded')

  // null before the first fetch or once there are no more pages.
  const nextCursor = ref<PageCursor | null>(null)
  const hasMore = ref(false)

  // Numbered pagination state, used whenever `paginated` is on.
  // cursorHistory[0] = null (page 1 has no predecessor cursor),
  // cursorHistory[n] = cursor needed to fetch page n+1.
  const currentPage = ref(1)
  const cursorHistory = ref<Array<PageCursor | null>>([null])

  // Pagination total in threaded view. reply_count includes children and would
  // invent phantom pages that fetch empty.
  const rootCount = ref(0)
  const rootCountLoaded = ref(false)

  // Until the root count loads, fall back to reply_count (an overcount). 0 would
  // collapse totalPages to 1 and loadPage would clamp navigation to page 1.
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

  // The late block: the tail page or the deep-linked target page. Gap loads
  // splice pages in before it so it stays pinned at the end.
  const _tailBlock = ref<RawComment[]>([])

  // Realtime rows appended after a deep link loaded a tail block. Cursor pages
  // go in before them to keep chronological order.
  const _realtimeAppended = ref<RawComment[]>([])

  // Bumped when a navigation resets the gap. Gap loads bail if it changed during
  // their fetch, so a stale page can't land in the wrong position.
  let _gapGeneration = 0

  // Bumped when the list resets. loadMore drops its page if this changed
  // mid-fetch, otherwise old rows would land after the tail block.
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

    if (!hasMore.value)
      return 0

    // The gap has its own banner, so it's left out here.
    const total = discussion.value?.reply_count ?? 0
    return Math.max(0, total - comments.value.length - (gap.value?.count ?? 0))
  })

  // ── Data loading ────────────────────────────────────────────────────────────

  // Mirrors the pagination RPC's filters and includes soft-deleted roots, so the
  // count matches what the pages return.
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

    currentPage.value = 1
    cursorHistory.value = [null]

    applyPage(page, true)
  }

  /**
   * Load a specific page by number (1-based).
   * Walks the cursor history forwards as needed, caching each cursor so
   * subsequent back/forward navigations don't re-fetch already-seen pages.
   */
  async function loadPage(page: number): Promise<void> {
    if (!discussion.value || loadingMore.value)
      return

    const targetPage = Math.max(1, Math.min(page, totalPages.value))

    loadingMore.value = true

    // An explicit page replaces the visible set, so a deep-link gap no longer applies.
    gap.value = null
    try {
      // Fill in missing cursors up to the target. Page N needs cursorHistory[N-1].
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

      // The list was reset while this was in flight.
      if (_listGeneration !== myGeneration)
        return

      applyPage(page, false)
    }
    finally {
      loadingMore.value = false
    }
  }

  function applyPage(page: ReplyPage, reset: boolean): void {
    if (reset) {
      comments.value = page.rows
      _realtimeAppended.value = []
    }
    else {
      // Realtime may have already added some of these rows.
      const existingIds = new Set(comments.value.map(c => c.id))
      const fresh = page.rows.filter(r => !existingIds.has(r.id))

      // Realtime rows are always newer than cursor-fetched ones, so cursor pages
      // go in before them.
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
   * Anchored chronological deep link: page 1 and the target block load in
   * parallel with no page-lookup RPC on the critical path. The gap count starts
   * as an estimate so the banner doesn't pop in and shift layout, then the cursor
   * RPC refines it in the background. Returns false when the anchor misses.
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

      // A newer navigation started mid-fetch, so leave its result.
      if (_listGeneration !== myGeneration)
        return true

      const firstIds = new Set(firstPage.rows.map(r => r.id))

      if (firstIds.has(targetId)) {
        applyPage(firstPage, true)
        return true
      }

      // Anchor missed (stale link or deleted reply). Fall back to the RPC path.
      if (!targetBlock.rows.some(r => r.id === targetId))
        return false

      const fresh = targetBlock.rows.filter(r => !firstIds.has(r.id))
      _tailBlock.value = fresh
      comments.value = [...firstPage.rows, ...fresh]
      hasMore.value = targetBlock.hasMore
      nextCursor.value = targetBlock.nextCursor

      // Seed the gap from reply_count, then refine it from the RPC's count of
      // replies strictly before the target.
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
   * Loads page 1 and the target's page together with a gap between them. Uses
   * rootOnly=false so child replies can be deep-linked in either view. Returns
   * false when the reply can't be found (deleted, wrong discussion, or RLS).
   */
  async function navigateToComment(targetId: string, options?: { soft?: boolean, anchorTs?: number }): Promise<boolean> {
    if (!discussion.value)
      return false

    const discussionId = discussion.value.id

    if (comments.value.some(c => c.id === targetId))
      return true

    // Positions never shift in ascending flat forum view, so an anchored link can
    // skip the page-lookup RPC. Falls through to the RPC path if the anchor misses.
    if (options?.anchorTs != null && ascending.value && !paginated.value && props.model !== 'comment' && props.viewMode?.value !== 'threaded') {
      const ok = await navigateViaAnchor(targetId, options.anchorTs, options)
      if (ok)
        return true
    }

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

    // Re-check: navigateViaAnchor or a concurrent nav may have filled the list
    // while the RPC was in flight.
    if (comments.value.some(c => c.id === targetId))
      return true

    // Paginated mode jumps straight to the target page, no gap.
    if (paginated.value) {
      // result's page index counts all replies, threaded pages count roots only,
      // so re-resolve there. A child reply has no root page: bail rather than
      // land on a clamped, wrong page.
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

      // Page N-1 loads too when prevCursor exists, so there's a page of context
      // before the target.
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
        // Tail block is the prevPage rows plus the target page rows, deduped.
        const firstPageIds = new Set(firstPage.rows.map(r => r.id))
        const prevRows = prevPage?.rows.filter(r => !firstPageIds.has(r.id)) ?? []
        const prevIds = new Set(prevRows.map(r => r.id))
        const freshTarget = targetPage.rows.filter(r => !firstPageIds.has(r.id) && !prevIds.has(r.id))

        const tailRows = [...prevRows, ...freshTarget]
        _tailBlock.value = tailRows
        comments.value = [...firstPage.rows, ...tailRows]

        // The gap runs from the end of page 1 to the first tail page: N-1 when
        // prevCursor exists, N otherwise.
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
   * Defaults to the last reply at or before the date. findFirst picks the first
   * reply at or after it instead, so a timeline segment click lands on the start
   * of that block. Returns the reply id, or null on any failure.
   */
  async function navigateToDate(date: Date, { findFirst = false }: { findFirst?: boolean } = {}): Promise<string | null> {
    if (!discussion.value)
      return null

    // Resolve locally only in infinite mode, where !hasMore means the whole
    // thread is loaded. In paginated mode it only means this is the last page.
    if (!paginated.value && !hasMore.value && gap.value == null && comments.value.length > 0) {
      const targetMs = date.getTime()

      if (findFirst) {
        // Ceiling: first reply at or after the target.
        const sorted = [...comments.value].sort((a, b) => {
          const diff = new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
          return ascending.value ? diff : -diff
        })
        const ceil = sorted.find(c => new Date(c.created_at).getTime() >= targetMs)

        // Nothing at or after the target, clamp to the last reply.
        return (ceil ?? sorted.at(-1)!).id
      }
      else {
        // Floor: clicking March 6 means what was latest as of March 6, not the
        // closest timestamp in either direction.
        let floor: typeof comments.value[0] | null = null

        for (const c of comments.value) {
          const ms = new Date(c.created_at).getTime()
          if (ms <= targetMs) {
            if (floor == null || ms > new Date(floor.created_at).getTime()) {
              floor = c
            }
          }
        }

        // Nothing at or before the target, clamp to the first reply.
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
   * Narrow the gap between the early block and the tail block by loading one
   * page forward from the top of the gap. The gap banner sits between the last
   * early item and the first item of `_tailBlock`.
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

      if (_gapGeneration !== myGeneration)
        return

      // The bottom page arrives reversed.
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

      // The reverse page ran out of rows, so it hit the early block.
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
   * Fetch direct children for a root comment (threaded view). Results go in
   * `childrenMap` only and stay out of the flat `comments` list.
   *
   * Uses a simple ascending query - children are always a small, bounded set
   * so cursor pagination is not needed here.
   */
  async function loadChildren(rootId: string): Promise<void> {
    if (!discussion.value)
      return

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

      // View and pagination mode come from async user settings. Loading before
      // they're in runs the deep link in the default mode, and the later flip
      // resets it to the wrong page. Skipped when ready (back-nav) so the sync
      // cache fast path below still avoids a skeleton flash.
      if (!isSessionReady())
        await waitForSessionReady()

      // Captured up front so they're stable across awaits.
      const initialTargetId = props.initialCommentId?.value
      const initialAnchorTs = props.initialCommentAnchorTs?.value
      const initialPage = props.initialPage?.value

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
      // With the discussion and first page already in localStorage, fill state
      // without setting loading, so back-navigation has no skeleton flash.
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

      // Forum deep links load the target's page first with no page-1 load. soft
      // leaves loading set so the skeleton stays until the target is in place.
      const wantsDeepLink = initialTargetId != null && props.model !== 'comment'

      if (wantsDeepLink) {
        const found = await navigateToComment(initialTargetId, { soft: true, anchorTs: initialAnchorTs })

        // Target not found and the fast path left the list empty: load page 1 so
        // the thread still renders.
        if (!found && !fastPathComplete)
          await loadFirstPage(fetchedDiscussion.id)
      }
      else if (paginated.value && initialPage != null && initialPage > 1) {
        // loadPage clamps, so a stale ?page= falls back to the last real page.
        await loadPage(initialPage)
      }
      else if (!fastPathComplete) {
        await loadFirstPage(fetchedDiscussion.id)
      }

      // Reply counts aren't needed for first paint. Background it so the
      // recursive RPC never blocks rendering.
      void fetchReplyCountMap(fetchedDiscussion.id)

      if (rootOnly.value)
        void fetchRootCount(fetchedDiscussion.id)

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

  // The page cache is keyed by rootOnly, so switching back is instant within the TTL.
  if (props.viewMode != null) {
    watch(props.viewMode, async () => {
      if (!discussion.value)
        return

      nextCursor.value = null
      hasMore.value = false
      childrenMap.value = new Map()

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

  // Children from loadChildren stay out of the flat list, where they'd render as
  // top-level items. They're attached here from childrenMap instead.
  const threadNodeMap = computed((): Map<string, ThreadNode> => {
    const data = modelledComments.value
    const lookup = new Map<string, Comment>(data.map(c => [c.id, c]))
    const nodeMap = new Map<string, ThreadNode>(
      data.map(c => [c.id, { comment: c, children: [] }]),
    )

    // First pass: reply relationships within the flat list.
    for (const comment of data) {
      if (comment.reply_to_id != null && lookup.has(comment.reply_to_id)) {
        nodeMap.get(comment.reply_to_id)!.children.push(nodeMap.get(comment.id)!)
      }
    }

    // Second pass: lazily fetched children of expanded roots.
    for (const [rootId, children] of childrenMap.value) {
      const rootNode = nodeMap.get(rootId)
      if (rootNode == null)
        continue

      for (const child of children) {
        // Already wired up from the flat list.
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
   * Ascending: tracked in _realtimeAppended so later cursor pages land before
   * them. Descending: prepended, since they're always the newest.
   */
  function pushRealtimeReplies(newReplies: RawComment[], ascendingOrder: boolean): void {
    if (newReplies.length === 0)
      return

    const existingIds = new Set(comments.value.map(c => c.id))
    const fresh = newReplies.filter(r => !existingIds.has(r.id))
    if (fresh.length === 0)
      return

    if (ascendingOrder) {
      _realtimeAppended.value = [..._realtimeAppended.value, ...fresh]
      comments.value = [...comments.value, ...fresh]
    }
    else {
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
