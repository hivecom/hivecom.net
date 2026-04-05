import type { Comment, RawComment, ThreadNode } from '@/components/Discussions/Discussion.types'
import type { PageCursor, ReplyPage } from '@/composables/useDiscussionRepliesCache'
import type { Tables } from '@/types/database.overrides'
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
  },
  comments: Ref<RawComment[]>,
  discussion: Ref<Tables<'discussions'> | undefined>,
  userId: Ref<string | null | undefined>,
  onLoaded: (discussionId: string) => void,
  onDeleted?: (id: string) => void,
) {
  const supabase = useSupabaseClient()
  const discussionCache = useDiscussionCache()
  const repliesCache = useDiscussionRepliesCache()
  const subscriptionsCache = useDiscussionSubscriptionsCache()
  const notifications = useDataNotifications()

  const loading = ref(false)
  const loadingMore = ref(false)
  const loadingChildren = ref(false)
  const error = ref<string>()
  const offtopicCount = ref(0)

  const ascending = computed(() => props.model !== 'comment')
  const pageSize = computed(() => props.model === 'forum' ? PAGE_SIZE_FORUM : PAGE_SIZE_COMMENT)
  // Threaded mode paginates root replies only; flat mode paginates all replies.
  // navigateToComment always uses rootOnly=false so deep links work regardless of mode.
  const rootOnly = computed(() => props.viewMode?.value === 'threaded')

  // The cursor for the next page. null = first page not yet fetched or no more pages.
  const nextCursor = ref<PageCursor | null>(null)
  const hasMore = ref(false)

  // Children loaded for threaded view, keyed by root comment id.
  const childrenMap = ref<Map<string, RawComment[]>>(new Map())

  // Pinned reply fetched independently so the pinned banner works even when
  // the reply lives on a page that hasn't been loaded yet.
  const fetchedPinnedReply = ref<RawComment | null>(null)

  // ── Gap / tail state ────────────────────────────────────────────────────────

  // The "late block" rows: either the tail page (forum initial load) or the
  // deep-linked target page. Tracked so loadGap can splice pages in before
  // them while they remain pinned at the end.
  const _tailBlock = ref<RawComment[]>([])

  const gap = ref<ReplyGap | null>(null)
  const loadingGap = ref(false)

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

    const page = await repliesCache.fetchPage(discussionId, {
      ascending: ascending.value,
      pageSize: pageSize.value,
      hash: props.hash,
      rootOnly: rootOnly.value,
      cursor: null,
    })

    if (page == null)
      return

    applyPage(page, true)
  }

  /**
   * Append the next page of replies to the current list.
   * No-op when `hasMore` is false or a fetch is already in flight.
   */
  async function loadMore(): Promise<void> {
    if (!hasMore.value || loadingMore.value || !discussion.value)
      return

    loadingMore.value = true

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
    }
    else {
      // De-duplicate: realtime may have already added some of these rows
      const existingIds = new Set(comments.value.map(c => c.id))
      const fresh = page.rows.filter(r => !existingIds.has(r.id))
      comments.value = [...comments.value, ...fresh]
    }
    hasMore.value = page.hasMore
    nextCursor.value = page.nextCursor
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
  async function navigateToComment(targetId: string, options?: { soft?: boolean }): Promise<boolean> {
    if (!discussion.value)
      return false

    const discussionId = discussion.value.id

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

    // Already loaded - nothing to do.
    if (comments.value.some(c => c.id === targetId))
      return true

    if (!options?.soft)
      loading.value = true
    gap.value = null
    _tailBlock.value = []

    try {
      const fetchOpts = { ascending: ascending.value, pageSize: pageSize.value, hash: props.hash, rootOnly: false }

      // Fetch page 1 and the target page in parallel.
      const [firstPage, targetPage] = await Promise.all([
        repliesCache.fetchPage(discussionId, { ...fetchOpts, cursor: null }),
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
        // Page 1 + target page loaded. Establish a gap between them.
        const firstPageIds = new Set(firstPage.rows.map(r => r.id))
        const freshTarget = targetPage.rows.filter(r => !firstPageIds.has(r.id))

        _tailBlock.value = freshTarget
        comments.value = [...firstPage.rows, ...freshTarget]

        const gapCount = result.predecessorCount - firstPage.rows.length

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
   * Returns the resolved reply id on success (caller can use it to scroll),
   * null on RPC error, no replies found, or navigation failure.
   */
  async function navigateToDate(date: Date): Promise<string | null> {
    if (!discussion.value)
      return null

    // Short-circuit: if every reply is already in memory, resolve locally.
    // Use floor semantics: the last post at or before the target date.
    // "I clicked March 6" means "show me what was most recently posted as of
    // March 6", not "find whatever timestamp is closest in either direction."
    if (!hasMore.value && gap.value == null && comments.value.length > 0) {
      const targetMs = date.getTime()
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

    // eslint-disable-next-line ts/no-unsafe-assignment
    const { data, error: rpcError } = await (supabase.rpc as unknown as (fn: string, args: Record<string, unknown>) => ReturnType<typeof supabase.rpc>)(
      'get_discussion_reply_nearest_to_date',
      {
        p_discussion_id: discussion.value.id,
        p_target_time: date.toISOString(),
        p_ascending: ascending.value,
        p_hash: props.hash ?? null,
        p_root_only: false,
      },
    )

    const rows = data as Array<{ id: string }> | null
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
  async function loadGap(): Promise<void> {
    if (gap.value == null || !discussion.value || loadingGap.value)
      return

    loadingGap.value = true

    try {
      const tailIds = new Set(_tailBlock.value.map(r => r.id))
      const discussionId = discussion.value.id
      const fetchOpts = {
        ascending: ascending.value,
        pageSize: pageSize.value,
        hash: props.hash,
        rootOnly: rootOnly.value,
      }

      // Fetch from both ends of the gap simultaneously.
      // Top: next page from gap.cursor (ascending from start of gap).
      // Bottom: one page in reverse just before _tailBlock[0], then flip to
      //         ascending order so it slots naturally before the tail block.
      const firstTailItem = _tailBlock.value[0]
      const [forwardPage, bottomPage] = await Promise.all([
        repliesCache.fetchPage(discussionId, { ...fetchOpts, cursor: gap.value.cursor }),
        firstTailItem != null
          ? repliesCache.fetchPage(discussionId, {
              ...fetchOpts,
              ascending: !ascending.value,
              cursor: { cursorTime: firstTailItem.created_at, cursorId: firstTailItem.id },
            })
          : Promise.resolve(null),
      ])

      if (forwardPage == null)
        return

      // Bottom page arrives in reverse order - flip back to ascending.
      const bottomRows = bottomPage != null ? [...bottomPage.rows].reverse() : []

      // Where does the current tail block begin in the comments array?
      const firstTailId = _tailBlock.value[0]?.id
      const insertPoint = firstTailId != null
        ? comments.value.findIndex(c => c.id === firstTailId)
        : -1
      const splice = insertPoint >= 0 ? insertPoint : comments.value.length

      const existingIds = new Set(comments.value.map(c => c.id))
      const freshForward = forwardPage.rows.filter(r => !existingIds.has(r.id))
      const forwardIds = new Set(freshForward.map(r => r.id))
      // Filter bottom rows: skip anything already loaded or overlapping with
      // the forward page (the two pages met in the middle - gap is closed).
      const freshBottom = bottomRows.filter(r => !existingIds.has(r.id) && !forwardIds.has(r.id))

      const reachedTail = forwardPage.rows.some(r => tailIds.has(r.id))
      const pagesOverlap = bottomRows.some(r => forwardIds.has(r.id))
      const gapClosed = reachedTail || pagesOverlap || !forwardPage.hasMore || forwardPage.nextCursor == null

      // Splice both fresh chunks into comments before the current tail block.
      // freshForward goes at the top of the gap, freshBottom at the bottom.
      const allFresh = [...freshForward, ...freshBottom]
      if (allFresh.length > 0) {
        comments.value = [
          ...comments.value.slice(0, splice),
          ...allFresh,
          ...comments.value.slice(splice),
        ]
      }

      if (gapClosed) {
        gap.value = null
        _tailBlock.value = []
        if (forwardPage.hasMore && !reachedTail && !pagesOverlap && forwardPage.nextCursor != null) {
          hasMore.value = true
          nextCursor.value = forwardPage.nextCursor
        }
      }
      else {
        // Extend the tail block to include the new bottom items so future
        // calls know the new boundary of the late block.
        _tailBlock.value = [...freshBottom, ..._tailBlock.value]

        gap.value = {
          // Banner moves to just after the last forward item.
          afterId: freshForward.at(-1)?.id ?? gap.value.afterId,
          count: Math.max(0, gap.value.count - freshForward.length - freshBottom.length),
          cursor: forwardPage.nextCursor!,
        }
      }
    }
    finally {
      loadingGap.value = false
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

      // Merge children into the flat comment list so threadNodeMap stays consistent.
      const existingIds = new Set(comments.value.map(c => c.id))
      const fresh = children.filter(c => !existingIds.has(c.id))
      if (fresh.length > 0)
        comments.value = [...comments.value, ...fresh]
    }
    finally {
      loadingChildren.value = false
    }
  }

  // ── Initial load ────────────────────────────────────────────────────────────

  watch(
    () => props.id,
    async () => {
      error.value = undefined

      // Reset pagination state on discussion change.
      nextCursor.value = null
      hasMore.value = false
      childrenMap.value = new Map()
      fetchedPinnedReply.value = null
      gap.value = null
      _tailBlock.value = []

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
          applyPage(quickPage, true)
          fastPathComplete = true
        }
      }

      if (!fastPathComplete)
        loading.value = true

      const [fetchedDiscussion] = await Promise.all([
        fetchDiscussion(),
        supabase
          .from('discussion_replies')
          .select('*', { count: 'exact', head: true })
          .eq('discussion_id', props.id)
          .eq('is_offtopic', true)
          .then(({ count }) => { offtopicCount.value = count ?? 0 }),
      ])

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

      if (!fastPathComplete)
        await loadFirstPage(fetchedDiscussion.id)

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
      comments.value = []
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
          .from('notifications')
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
   */
  const threadNodeMap = computed((): Map<string, ThreadNode> => {
    const data = modelledComments.value
    const lookup = new Map<string, Comment>(data.map(c => [c.id, c]))
    const nodeMap = new Map<string, ThreadNode>(
      data.map(c => [c.id, { comment: c, children: [] }]),
    )

    for (const comment of data) {
      if (comment.reply_to_id != null && lookup.has(comment.reply_to_id)) {
        nodeMap.get(comment.reply_to_id)!.children.push(nodeMap.get(comment.id)!)
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

  return {
    loading,
    loadingMore,
    loadingChildren,
    loadingGap,
    error,
    hasMore,
    gap,
    remainingCount,
    fetchedPinnedReply,
    modelledComments,
    threadNodeMap,
    threadRoots,
    childrenMap,
    loadMore,
    loadGap,
    navigateToComment,
    navigateToDate,
    loadChildren,
    toggleOfftopic,
    deleteComment,
    forceDeleteComment,
    offtopicCount,
  }
}
