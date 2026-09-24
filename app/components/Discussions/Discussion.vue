<script setup lang="ts">
import type { ValidationError } from '@dolanske/v-valid'
import type { Comment, DiscussionSettings, RawComment, ThreadNode } from './Discussion.types'
import type { TimelineBucket } from './DiscussionTimeline.vue'
import type { Tables } from '@/types/database.overrides'
import { defineRules, maxLength, minLenNoSpace, required, useValidation, withLabel } from '@dolanske/v-valid'
import { Flex, paginate, Pagination, Skeleton } from '@dolanske/vui'
import { useTemplateRef } from 'vue'
import ErrorAlert from '@/components/Shared/ErrorAlert.vue'
import JumpToPresent from '@/components/Shared/JumpToPresent.vue'
import { useDataDiscussionReplies } from '@/composables/useDataDiscussionReplies'
import { useBulkDataUser } from '@/composables/useDataUser'
import { useDiscussionCache } from '@/composables/useDiscussionCache'
import { PAGE_SIZE_COMMENT, PAGE_SIZE_FORUM, useDiscussionRepliesCache } from '@/composables/useDiscussionRepliesCache'
import { useDiscussionSubscription } from '@/composables/useDiscussionSubscription'
import { useEffectiveRole } from '@/composables/useEffectiveRole'
import { useRealtimeDiscussion } from '@/composables/useRealtimeDiscussion'
import { useReplyDraft } from '@/composables/useReplyDraft'
import { wrapInBlockquote } from '@/lib/markdownProcessors'
import { getRouteQueryStringOrNull, scrollToId, scrollToIdWhenStable, waitForLayoutStability } from '@/lib/utils/common'
import { normalizeTipTapOutput } from '@/lib/utils/formatting'
import { DISCUSSION_KEYS } from './Discussion.keys'
import DiscussionCommentCardSkeleton from './DiscussionCommentCardSkeleton.vue'
import DiscussionGapBanner from './DiscussionGapBanner.vue'
import DiscussionItem from './DiscussionItem.vue'
import DiscussionLoadMore from './DiscussionLoadMore.vue'
import DiscussionOfftopicBanner from './DiscussionOfftopicBanner.vue'
import DiscussionPendingBanner from './DiscussionPendingBanner.vue'
import DiscussionReplyCardSkeleton from './DiscussionReplyCardSkeleton.vue'
import DiscussionReplyInput from './DiscussionReplyInput.vue'
import DiscussionTimeline from './DiscussionTimeline.vue'
import DiscussionToolbar from './DiscussionToolbar.vue'
import DiscussionToolbarSkeleton from './DiscussionToolbarSkeleton.vue'

/**
 * NOTE
 *
 * Important note (@dolanske)
 *
 * For clarity during implementation, this component calls reply a 'comment' and
 * if a comment is replying to another one, it is saved to it as a 'reply'
 */

interface Props extends Partial<DiscussionSettings> {
  /**
   * Discussion id
   */
  id: string

  /**
   * Set the model for how comments look
   */
  model?: 'comment' | 'forum'

  /** Entity type the discussion is attached to */
  type: string

  /**
   * ## For votes only
   *
   * Hashed vote text. A single referendum can only have 1 unique discussion.
   * However to group comments by answers, we provide a hash that only queries
   * comments for a specific answer.
   */
  hash?: string

  /**
   * Hides the discussion input
   */
  hideInput?: boolean

  /**
   * Sets the input placeholder
   */
  placeholder?: string

  /** Extra px on top of the navbar offset, for pages with another sticky header */
  additionalScrollOffset?: number
}

const props = withDefaults(defineProps<Props>(), {
  model: 'comment',
  timestamps: true,
  placeholder: 'Leave your comment...',
})

const emit = defineEmits<{
  replySubmitted: [newReplyCount: number, discussionId: string]
}>()

const MAX_COMMENT_CHARS = 8192

const userId = useUserId()

const { isAdminOrMod: canBypassLock } = useEffectiveRole()

const supabase = useSupabaseClient()

// ── Reply form state (declared early - referenced in useDataDiscussionReplies callback) ──

const replyingTo = ref<Comment>()

// ── Realtime (declared early - referenced in useDataDiscussionReplies callback) ──

const modelRef = computed(() => props.model)

// comments/discussion refs are passed by reference so realtime can be
// initialized before useDataDiscussionReplies populates them.
const comments = ref<RawComment[]>([])
const discussion = ref<Tables<'discussions'>>()

const route = useRoute()
const router = useRouter()

// Pre-warm the user cache so each DiscussionModelForum gets a cache hit instead
// of querying user_roles and profiles itself. A stable ref, not a computed, so a
// new array with the same authors doesn't trigger a bulk re-fetch.
const replyAuthorIds = ref<string[]>([])
let _lastAuthorKey = ''

watchEffect(() => {
  const ids = [...new Set(
    comments.value
      .map(c => c.created_by)
      .filter((id): id is string => id != null),
  )]
  const key = ids.toSorted().join(',')
  if (key !== _lastAuthorKey) {
    _lastAuthorKey = key
    replyAuthorIds.value = ids
  }
})

useBulkDataUser(replyAuthorIds, {
  includeRole: true,
  includeAvatar: true,
  userTtl: 10 * 60 * 1000,
  avatarTtl: 30 * 60 * 1000,
})

// Declared here so the realtime composable can reference it before
// useDataDiscussionReplies is initialized (both need each other).

let pushRealtimeReplies: (newReplies: RawComment[], ascending: boolean) => void = () => {}

const realtime = useRealtimeDiscussion(
  comments,
  discussion,
  modelRef,
  props.hash,
  // Delegates lazily to break the circular initialisation
  (newReplies, ascending) => pushRealtimeReplies(newReplies, ascending),
  userId,
)

// ── Subscription (comment model only) ────────────────────────────────────────

const { isSubscribed, subscriptionLoading, toggleSubscription: handleToggleSubscription } = useDiscussionSubscription(
  computed(() => discussion.value?.id ?? null),
  { enabled: computed(() => props.model === 'comment') },
)

// ── View settings (declared before composable - viewMode is passed to useDataDiscussionReplies) ──

const { settings } = useDataUserSettings()
type ViewMode = 'flat' | 'threaded'

// A copied paginated link carries ?page and ?view, so the recipient lands on the
// same content even with different defaults. A page number means different
// content in flat and threaded view. Invalid values fall back to the viewer's settings.
function parseView(value: string | null | (string | null)[] | undefined): ViewMode | undefined {
  const raw = getRouteQueryStringOrNull(value)
  return raw === 'flat' || raw === 'threaded' ? raw : undefined
}
function parsePage(value: string | null | (string | null)[] | undefined): number | undefined {
  const raw = getRouteQueryStringOrNull(value)
  if (raw == null)
    return undefined

  const n = Number.parseInt(raw, 10)
  return Number.isInteger(n) && n >= 1 ? n : undefined
}
const initialPage = ref<number | undefined>(parsePage(route.query.page))

// A ?page link forces pagination for this visit, even for infinite-scroll
// viewers. Non-reactive so it doesn't flip back once ?page leaves the URL. A
// ?comment link wins: it works in either mode, so it shouldn't switch the viewer's.
const hasCommentLink = getRouteQueryStringOrNull(route.query.comment) != null
const sharedPaginatedLink = initialPage.value != null && !hasCommentLink

// A ?comment link works in either view, so its ?view is ignored
const viewMode = ref<ViewMode>(
  (hasCommentLink ? undefined : parseView(route.query.view))
  ?? settings.value.discussion_view_mode
  ?? 'flat',
)
const discussionPageSize = computed(() => props.model === 'forum' ? PAGE_SIZE_FORUM : PAGE_SIZE_COMMENT)

// Page controls instead of infinite scroll. The comment model always paginates,
// the forum follows the user's setting, and a shared ?page link forces it.
const usePagination = computed(() =>
  props.model === 'comment'
  || sharedPaginatedLink
  || (props.model === 'forum' && settings.value.forum_pagination_mode === 'paginated'),
)
watch(() => settings.value.discussion_view_mode, (val) => {
  viewMode.value = val ?? 'flat'
})

// ── Comment data ──────────────────────────────────────────────────────────────

// Deep-link target at mount, so the initial load jumps straight to its page.
// Not kept in sync: later ?comment changes go through navigateToLinkedComment.
const initialCommentId = ref<string | undefined>(
  getRouteQueryStringOrNull(route.query.comment) ?? undefined,
)

// Copied comment links carry ?ts=<created_at ms>. A reply's position is stable
// in ascending forum view, so the initial load can skip the page-lookup RPC.
function parseAnchorTs(value: string | null | (string | null)[] | undefined): number | undefined {
  const raw = getRouteQueryStringOrNull(value)
  if (raw == null)
    return undefined

  const ms = Number(raw)
  return Number.isFinite(ms) && ms > 0 ? ms : undefined
}
const initialCommentAnchorTs = ref<number | undefined>(parseAnchorTs(route.query.ts))

const {
  loading,
  loadingMore,
  loadingGap,
  error,
  hasMore,
  gap,
  remainingCount,
  modelledComments,
  threadNodeMap,
  threadRoots,
  childrenMap,
  loadMore,
  loadPage,
  currentPage,
  paginationTotal,

  loadGapFromTop,
  loadGapFromBottom,
  navigateToComment,
  navigateToDate,
  loadChildren,
  fetchedPinnedReply,
  toggleOfftopic,
  deleteComment: deleteCommentFromList,
  forceDeleteComment: forceDeleteCommentFromList,
  offtopicCount,
  replyCountMap,
  pushRealtimeReplies: _pushRealtimeReplies,
} = useDataDiscussionReplies(
  {
    id: props.id,
    type: props.type,
    model: props.model,
    hash: props.hash,
    viewMode,
    paginated: usePagination,
    initialCommentId,
    initialCommentAnchorTs,
    initialPage,
  },
  comments,
  discussion,
  userId,
  async (discussionId: string) => {
    await realtime.subscribe(discussionId)
    realtime.pendingReplyCount.value = 0
  },
  (deletedId: string) => {
    if (replyingTo.value?.id === deletedId) {
      replyingTo.value = undefined
    }
  },
)
pushRealtimeReplies = _pushRealtimeReplies

// Flipping the loading mode resets to page 1. An infinite list spans pages the
// control can't represent, and a paginated view has no sentinel to resume from.
watch(usePagination, () => {
  if (discussion.value)
    void loadPage(1)
})

// Mirror page and view into the URL so a reload or shared link reproduces them.
// Flat is the default and carries no ?view. ?page only appears past page 1.
//
// Paging from the control also drops the one-shot ?comment and ?ts anchor, or
// returning to that page would re-scroll to the comment. goToPage sets the flag.
let dropAnchorOnPageSync = false
watch([currentPage, usePagination, viewMode], () => {
  const paginating = usePagination.value && currentPage.value > 1
  const desiredPage = paginating ? String(currentPage.value) : undefined
  const desiredView = viewMode.value === 'threaded' ? 'threaded' : undefined
  const dropAnchor = dropAnchorOnPageSync
  dropAnchorOnPageSync = false
  const hasAnchor = route.query.comment != null || route.query.ts != null
  const curPage = getRouteQueryStringOrNull(route.query.page)
  const curView = getRouteQueryStringOrNull(route.query.view)
  if ((curPage ?? undefined) === desiredPage && (curView ?? undefined) === desiredView && !(dropAnchor && hasAnchor))
    return

  const query = { ...route.query }
  if (desiredPage)
    query.page = desiredPage
  else
    delete query.page
  if (desiredView)
    query.view = desiredView
  else
    delete query.view
  if (dropAnchor) {
    delete query.comment
    delete query.ts
  }
  void router.replace({ query })
}, { immediate: true })

provide(DISCUSSION_KEYS.loadChildren, loadChildren)
provide(DISCUSSION_KEYS.childrenMap, childrenMap)
provide(DISCUSSION_KEYS.navigateToComment, navigateToComment)
provide(DISCUSSION_KEYS.replyCountMap, replyCountMap)

const openThreadSheetId = ref<string | null>(null)
provide(DISCUSSION_KEYS.openThreadSheet, openThreadSheetId)

const pinnedComment = computed((): Comment | null => {
  const pinnedId = discussion.value?.pinned_reply_id
  if (pinnedId == null)
    return null

  // Already first in the list, so the banner would show it twice
  const listIndex = modelledComments.value.findIndex(c => c.id === pinnedId)
  if (listIndex === 0)
    return null

  if (listIndex > 0)
    return modelledComments.value[listIndex]!

  // Not loaded yet. The separately fetched row leaves its reply reference unresolved.
  if (fetchedPinnedReply.value != null)
    return { ...fetchedPinnedReply.value, reply: null }

  return null
})

// ── View settings ─────────────────────────────────────────────────────────────

function handleViewModeUpdate(val: ViewMode) {
  viewMode.value = val
  settings.value.discussion_view_mode = val
}

const hasManuallySwitched = ref(false)
const showOfftopic = ref(settings.value.show_offtopic_replies ?? false)
const showThreadReplies = ref(settings.value.show_thread_replies ?? false)

function handleShowThreadRepliesUpdate(val: boolean) {
  showThreadReplies.value = val
  settings.value.show_thread_replies = val
}

// Deep links (?comment) reveal the target even when it's off-topic. Watching the
// query also catches notification clicks while already on this page.
const navigatingToComment = ref(false)

// Caps the dim so a stalled deep-link navigation never leaves the reply area dimmed
let navigatingToCommentTimer: ReturnType<typeof setTimeout> | null = null
watch(navigatingToComment, (val) => {
  if (navigatingToCommentTimer != null) {
    clearTimeout(navigatingToCommentTimer)
    navigatingToCommentTimer = null
  }
  if (val) {
    navigatingToCommentTimer = setTimeout(() => {
      navigatingToComment.value = false
    }, 10000)
  }
})
onUnmounted(() => {
  if (navigatingToCommentTimer != null)
    clearTimeout(navigatingToCommentTimer)
})

// A nested reply doesn't reliably render in the threaded tree: paginated view
// only pages roots, and infinite view loads it under collapsed ancestors. Go to
// its root and open the root's subtree. The target self-scrolls once rendered.
async function revealThreadedChild(childId: string) {
  const { data: rootId, error } = await supabase.rpc('get_thread_root', { p_reply_id: childId })
  if (error != null || rootId == null || rootId === childId)
    return

  await navigateToComment(rootId as string, { soft: true })
  await nextTick()
  openThreadSheetId.value = rootId as string
}

async function navigateToLinkedComment(commentId: string) {
  // Already in the DOM means an instant scroll, so skip the dim
  const alreadyInDom = document.querySelector(`#comment-${commentId}`) != null
  if (!alreadyInDom)
    navigatingToComment.value = true

  if (discussion.value == null) {
    await new Promise<void>((resolve) => {
      const unwatch = watch(discussion, (disc) => {
        if (disc == null)
          return

        unwatch()
        resolve()
      })
    })
  }

  // The data composable's initial load owns navigation to the mount-time target.
  // Calling navigateToComment here too would race it (duplicate cursor RPC and
  // page fetch, _listGeneration collisions), so only wait for it to settle.
  const isInitialTarget = commentId === initialCommentId.value

  if (isInitialTarget) {
    // Watch the comment set, not just loading: the sync cache fast path can leave
    // loading false while the composable is still awaiting the target page.
    const present = () => modelledComments.value.some(c => c.id === commentId)
    if (!present() && loading.value) {
      await new Promise<void>((resolve) => {
        const unwatch = watch([loading, modelledComments], () => {
          if (loading.value && !present())
            return

          unwatch()
          resolve()
        })
      })
    }

    // Infinite mode with auto-expand already renders a nested reply inline.
    // Only reveal via the root when paginated or auto-expand is off.
    if (viewMode.value === 'threaded') {
      const tc = modelledComments.value.find(c => c.id === commentId)
      const inlineExpanded = !usePagination.value && showThreadReplies.value
      if (!inlineExpanded && (tc == null || tc.reply_to_id != null))
        await revealThreadedChild(commentId)
    }
  }
  else {
    // A later target, like a notification click. Wait out the initial load, or
    // loadFirstPage's applyPage(reset: true) overwrites the target and the scroll never fires.
    if (loading.value) {
      await new Promise<void>((resolve) => {
        const unwatch = watch(loading, (isLoading) => {
          if (isLoading)
            return

          unwatch()
          resolve()
        })
      })
    }
    const found = await navigateToComment(commentId, { soft: true, anchorTs: parseAnchorTs(route.query.ts) })

    // Same nested-reply rule as above. A missing root-level target bails.
    const tc = modelledComments.value.find(c => c.id === commentId)
    const inlineExpanded = !usePagination.value && showThreadReplies.value
    const nestedThreaded = viewMode.value === 'threaded' && !inlineExpanded && (tc == null || tc.reply_to_id != null)
    if (nestedThreaded)
      await revealThreadedChild(commentId)
    else if (!found)
      return
  }

  const target = modelledComments.value.find(c => c.id === commentId)
  if (target?.is_offtopic && !showOfftopic.value) {
    showOfftopic.value = true
    hasManuallySwitched.value = true
  }

  // Wait for the scroll to actually land before clearing the loading state.
  await nextTick()
  await waitForLayoutStability()
  navigatingToComment.value = false
}

watch(
  () => getRouteQueryStringOrNull(route.query.comment),
  async (commentId, prevCommentId) => {
    if (!commentId || commentId === prevCommentId)
      return

    await navigateToLinkedComment(commentId)
  },
  { immediate: true },
)

async function handleGoToPinnedReply() {
  const pinned = fetchedPinnedReply.value
  if (!pinned)
    return

  if (pinned.is_offtopic && !showOfftopic.value)
    showOfftopic.value = true

  router.replace({ query: { ...route.query, comment: pinned.id } })
  await nextTick()
  await waitForLayoutStability()
  scrollToId(`#comment-${pinned.id}`, 'center', true, props.additionalScrollOffset)
}

// Follow the global setting, which can change from another tab, unless the user
// switched manually this session
watch(
  () => settings.value.show_offtopic_replies,
  (val) => {
    if (!hasManuallySwitched.value) {
      showOfftopic.value = val ?? false
    }
  },
)

watch(
  () => settings.value.show_thread_replies,
  (val) => { showThreadReplies.value = val ?? false },
)

function handleShowOfftopicUpdate(val: boolean) {
  hasManuallySwitched.value = true
  showOfftopic.value = val
}

// Last visible comment before each hidden off-topic run, mapped to the run's
// length. Places the inline off-topic banners.
const offtopicBannerAfterIds = computed((): Map<string, number> => {
  if (showOfftopic.value || offtopicCount.value === 0)
    return new Map()

  const map = new Map<string, number>()
  const list = modelledComments.value
  for (let i = 0; i < list.length - 1; i++) {
    const curr = list[i]!
    const next = list[i + 1]!

    if (!curr.is_offtopic && next.is_offtopic) {
      let runCount = 0
      for (let j = i + 1; j < list.length && list[j]!.is_offtopic; j++) {
        runCount++
      }
      map.set(curr.id, runCount)
    }
  }
  return map
})

const offtopicBannerAtStart = computed((): boolean => {
  if (showOfftopic.value || offtopicCount.value === 0)
    return false

  const first = modelledComments.value[0]
  return first != null && first.is_offtopic
})

const offtopicBannerAtStartCount = computed((): number => {
  if (!offtopicBannerAtStart.value)
    return 0

  const list = modelledComments.value
  let count = 0
  for (const comment of list) {
    if (comment.is_offtopic)
      count++
    else
      break
  }
  return count
})

const isDiscussionAuthor = computed(() =>
  !!userId.value && !!discussion.value && discussion.value.created_by === userId.value,
)

const canMarkOfftopic = computed(() => isDiscussionAuthor.value || canBypassLock.value)

// ── Provide context ───────────────────────────────────────────────────────────

provide(DISCUSSION_KEYS.showOfftopic, showOfftopic)
provide(DISCUSSION_KEYS.canMarkOfftopic, canMarkOfftopic)
provide(DISCUSSION_KEYS.showThreadReplies, showThreadReplies)
provide(DISCUSSION_KEYS.viewMode, viewMode)
provide(DISCUSSION_KEYS.discussionSettings, { timestamps: props.timestamps })
provide(DISCUSSION_KEYS.discussion, discussion)
provide(DISCUSSION_KEYS.canBypassLock, canBypassLock)
provide(DISCUSSION_KEYS.toggleOfftopic, toggleOfftopic)

// ── Timeline ──────────────────────────────────────────────────────────────────

/** Sticky navbar height in px */
const NAVBAR_OFFSET = 148
const navigateToDateLoading = ref(false)
const navigating = ref(false)

// Dims the reply area and pauses scroll-fraction updates so the timeline cursor
// doesn't jump mid-navigation
const isNavigating = computed(() => navigating.value || navigatingToComment.value)
const replyAreaEl = ref<HTMLElement | null>(null)
const bottomSentinelEl = ref<HTMLElement | null>(null)
const bottomSentinelThreadedEl = ref<HTMLElement | null>(null)
const activeSentinel = computed(() =>
  viewMode.value === 'threaded' ? bottomSentinelThreadedEl.value : bottomSentinelEl.value,
)
const currentScrollFraction = ref<number | null>(null)

// Separate from the timeline fraction, which follows the topmost visible comment
// and can read below 1 with the last reply fully visible (a tall final reply, or
// the composer below it).
const atLatest = ref(false)

// Until the reply area passes under the navbar the main post is on screen, and
// the fixed "Jump to latest" pill would sit on top of it.
const inReplies = ref(false)

// Infinite scroll. The comment model always paginates.
if (props.model !== 'comment') {
  useIntersectionObserver(activeSentinel, ([entry]) => {
    if (entry?.isIntersecting && hasMore.value && !loadingMore.value) {
      void loadMore()
    }
  }, { rootMargin: '0px 0px 300px 0px' })

  // After a rebuild the sentinel can already be in view, and the observer won't
  // re-fire because its intersection state didn't change.
  watch(hasMore, async (val) => {
    if (!val || loadingMore.value)
      return

    await nextTick()
    const sentinel = activeSentinel.value
    if (!sentinel)
      return

    const rect = sentinel.getBoundingClientRect()
    if (rect.top < window.innerHeight + 300) {
      void loadMore()
    }
  })

  // Same for a loaded set short enough to leave the sentinel in view
  watch(modelledComments, async () => {
    if (!hasMore.value || loadingMore.value)
      return

    await nextTick()
    const sentinel = activeSentinel.value
    if (sentinel == null)
      return

    const rect = sentinel.getBoundingClientRect()
    if (rect.top < window.innerHeight + 300) {
      void loadMore()
    }
  })

  // No scroll event fires when the final page loads with the newest reply on screen
  watch([hasMore, modelledComments], async () => {
    await nextTick()
    updateScrollFraction()
  })
}

const timelineSpanMs = computed(() => {
  const d = discussion.value
  if (d == null)
    return 0

  return new Date(d.last_activity_at).getTime() - new Date(d.created_at).getTime()
})

const timelineRef = useTemplateRef<typeof DiscussionTimeline>('timelineRef')

const showTimeline = computed(() => {
  if (props.model !== 'forum')
    return false

  const d = discussion.value
  if (d == null)
    return false

  return d.reply_count > 1
})

// The "Jump to latest" bubble is redundant while the page controls are on screen
const paginationInView = ref(false)

const showJumpToPresent = computed(() => {
  if (!showTimeline.value)
    return false
  if (!inReplies.value)
    return false
  if (atLatest.value || paginationInView.value)
    return false

  const f = currentScrollFraction.value
  return f != null && f < 0.99
})

const timelineStart = computed(() => discussion.value?.created_at ?? '')
const timelineEnd = computed(() => discussion.value?.last_activity_at ?? '')

const timelineBucketInterval = computed((): string => {
  const ms = timelineSpanMs.value
  if (ms >= 30 * 24 * 60 * 60 * 1000)
    return '1 day'
  if (ms >= 7 * 24 * 60 * 60 * 1000)
    return '6 hours'

  return '1 hour'
})

const timelineBucketIntervalMs = computed((): number => {
  switch (timelineBucketInterval.value) {
    case '1 day': return 24 * 60 * 60 * 1000
    case '6 hours': return 6 * 60 * 60 * 1000
    default: return 60 * 60 * 1000
  }
})

const timelineBuckets = ref<TimelineBucket[]>([])
const timelineOfftopicBuckets = ref<TimelineBucket[]>([])

/**
 * The unloaded time range as ISO strings, for the timeline's dashed region.
 *
 * 1. Explicit gap between two loaded blocks (from navigateToComment): runs
 *    from the boundary comment to the first tail reply, or to timelineEnd when
 *    no tail is loaded.
 * 2. Trailing zone when hasMore is true: runs from the last loaded comment to
 *    timelineEnd.
 */
const timelineGapRange = computed((): { start: string, end: string } | null => {
  const end = timelineEnd.value
  if (!end)
    return null

  const list = modelledComments.value

  // Case 1: explicit gap between two loaded blocks.
  if (gap.value != null) {
    const afterIdx = list.findIndex(c => c.id === gap.value!.afterId)
    if (afterIdx !== -1) {
      const afterComment = list[afterIdx]
      if (afterComment != null) {
        // Stop at the first tail-block reply, since the tail is loaded. Case 2
        // adds its own trailing zone after the tail when hasMore.
        const firstTailComment = list[afterIdx + 1]
        if (firstTailComment != null)
          return { start: afterComment.created_at, end: firstTailComment.created_at }

        return { start: afterComment.created_at, end }
      }
    }
  }

  // Case 2: trailing unloaded zone. Suppressed when the last loaded reply is
  // within 1s of last_activity_at, since nothing follows it.
  if (hasMore.value && list.length > 0) {
    const lastComment = list.at(-1)
    if (lastComment != null) {
      const lastMs = new Date(lastComment.created_at).getTime()
      const endMs2 = new Date(end).getTime()
      if (Math.abs(lastMs - endMs2) > 1000)
        return { start: lastComment.created_at, end }
    }
  }

  return null
})

async function fetchTimelineBuckets() {
  if (!showTimeline.value || discussion.value == null)
    return

  const rpc = (fn: string, args: Record<string, unknown>) =>
    (supabase.rpc as unknown as (fn: string, args: Record<string, unknown>) => ReturnType<typeof supabase.rpc>).call(supabase, fn, args)
  const baseArgs = {
    p_discussion_id: discussion.value.id,
    p_bucket_size: timelineBucketInterval.value,
    p_hash: props.hash ?? null,
    p_root_only: viewMode.value === 'threaded',
  }

  const [{ data }, { data: offtopicData }] = await Promise.all([
    rpc('get_discussion_reply_activity_buckets', baseArgs),
    rpc('get_discussion_reply_activity_buckets', { ...baseArgs, p_offtopic_only: true }),
  ])

  const rows = data as Array<{ bucket_start: string, reply_count: number }> | null
  if (rows != null) {
    timelineBuckets.value = rows.map(r => ({ bucketStart: r.bucket_start, replyCount: r.reply_count }))
  }

  const offtopicRows = offtopicData as Array<{ bucket_start: string, reply_count: number }> | null
  if (offtopicRows != null) {
    timelineOfftopicBuckets.value = offtopicRows.map(r => ({ bucketStart: r.bucket_start, replyCount: r.reply_count }))
  }
}

watch(showTimeline, async (visible) => {
  if (!visible)
    return

  await fetchTimelineBuckets()
}, { immediate: true })

// Threaded view uses root-only buckets
watch(viewMode, async () => {
  currentScrollFraction.value = null
  await fetchTimelineBuckets()
})

function lastReplyInView(): boolean {
  const root = replyAreaEl.value
  if (root == null)
    return false

  // The inactive view stays mounted via v-show, so the last element can be a
  // hidden zero-rect duplicate that reads as in view. Use the last one with height.
  const items = root.querySelectorAll<HTMLElement>('[id^="comment-"]')
  for (let i = items.length - 1; i >= 0; i--) {
    const rect = items[i]!.getBoundingClientRect()
    if (rect.height > 0)
      return rect.bottom <= window.innerHeight + 4
  }
  return true
}

function updatePaginationInView() {
  if (!import.meta.client || replyAreaEl.value == null) {
    paginationInView.value = false
    return
  }

  // The inactive view stays mounted via v-show with zero height
  const rows = replyAreaEl.value.querySelectorAll<HTMLElement>('.discussion__pagination')
  let inView = false
  for (const row of rows) {
    const rect = row.getBoundingClientRect()
    if (rect.height === 0)
      continue

    inView = rect.top < window.innerHeight && rect.bottom > 0
    break
  }
  paginationInView.value = inView
}

function updateScrollFraction() {
  updatePaginationInView()
  if (replyAreaEl.value == null || !discussion.value) {
    inReplies.value = false
    return
  }

  const replyAreaRect = replyAreaEl.value.getBoundingClientRect()

  inReplies.value = replyAreaRect.top <= NAVBAR_OFFSET

  // Skipped mid-navigation, when page height is in flux
  atLatest.value = !isNavigating.value && !hasMore.value && lastReplyInView()

  const startMs = new Date(discussion.value.created_at).getTime()
  const endMs = new Date(discussion.value.last_activity_at).getTime()
  if (endMs === startMs)
    return

  // Pin to 1 at the page bottom, where a small last reply would leave the
  // topmost-element logic short. Not mid-navigation, where a briefly short
  // scrollHeight fakes it. Not when paginated, where the page end isn't the thread end.
  const atBottom = !isNavigating.value && !usePagination.value
    && window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 4
  if (atBottom) {
    currentScrollFraction.value = 1
    return
  }

  // Above the loaded replies
  if (replyAreaRect.top > NAVBAR_OFFSET) {
    // Past page 1 the top of the page is mid-thread, so map the first loaded
    // comment's timestamp instead of pinning to 0
    if (usePagination.value && currentPage.value > 1) {
      const firstComment = comments.value[0]
      currentScrollFraction.value = firstComment != null
        ? Math.max(0, Math.min(1, (new Date(firstComment.created_at).getTime() - startMs) / (endMs - startMs)))
        : 0
    }
    else {
      currentScrollFraction.value = 0
    }
    return
  }

  const items = replyAreaEl.value.querySelectorAll<HTMLElement>('[id^="comment-"]')
  let topmostEl: HTMLElement | null = null
  let topmostId: string | null = null
  for (const item of items) {
    if (item.getBoundingClientRect().bottom > NAVBAR_OFFSET) {
      topmostEl = item
      topmostId = item.id.replace('comment-', '')
      break
    }
  }

  if (topmostId == null || topmostEl == null) {
    // Tail zone: every loaded comment is above the navbar
    if (usePagination.value) {
      // The page end isn't the thread end, so map the last comment's timestamp
      const lastComment = comments.value.at(-1)
      currentScrollFraction.value = lastComment != null
        ? Math.max(0, Math.min(1, (new Date(lastComment.created_at).getTime() - startMs) / (endMs - startMs)))
        : null
      return
    }

    // Infinite: the loaded tail is the thread's tail, so use a scroll fraction
    // that reaches 1 at the bottom
    const totalScrollable = replyAreaRect.height - (window.innerHeight - NAVBAR_OFFSET)
    if (totalScrollable <= 0) {
      currentScrollFraction.value = 1
      return
    }
    currentScrollFraction.value = Math.max(0, Math.min(1, (NAVBAR_OFFSET - replyAreaRect.top) / totalScrollable))
    return
  }

  const comment = comments.value.find(c => c.id === topmostId)
  if (comment == null) {
    currentScrollFraction.value = null
    return
  }

  const commentMs = new Date(comment.created_at).getTime()
  const buckets = timelineBuckets.value
  const bucketIntervalMs = timelineBucketIntervalMs.value

  // No bucket data yet, so use the raw timestamp fraction
  if (buckets.length === 0 || bucketIntervalMs === 0) {
    currentScrollFraction.value = Math.max(0, Math.min(1, (commentMs - startMs) / (endMs - startMs)))
    return
  }

  let bucketIdx = -1
  for (let i = 0; i < buckets.length; i++) {
    const bMs = new Date(buckets[i]!.bucketStart).getTime()
    if (commentMs >= bMs && commentMs < bMs + bucketIntervalMs) {
      bucketIdx = i
      break
    }
  }

  // No matching bucket, same fallback
  if (bucketIdx === -1) {
    currentScrollFraction.value = Math.max(0, Math.min(1, (commentMs - startMs) / (endMs - startMs)))
    return
  }

  const bucket = buckets[bucketIdx]!
  const bucketStartMs = new Date(bucket.bucketStart).getTime()
  const nextBucketStartMs = bucketIdx + 1 < buckets.length
    ? new Date(buckets[bucketIdx + 1]!.bucketStart).getTime()
    : endMs

  // The marker stays clamped to this bucket's range
  const bucketStartFraction = (bucketStartMs - startMs) / (endMs - startMs)
  const nextBucketFraction = (nextBucketStartMs - startMs) / (endMs - startMs)

  const bucketComments = comments.value.filter((c) => {
    const ms = new Date(c.created_at).getTime()
    return ms >= bucketStartMs && ms < bucketStartMs + bucketIntervalMs
  })
  const commentIndexInBucket = Math.max(0, bucketComments.findIndex(c => c.id === topmostId))
  const bucketCount = Math.max(1, bucket.replyCount)

  // Moves the marker smoothly within a single comment's screen space
  const topmostRect = topmostEl.getBoundingClientRect()
  const scrolledPast = Math.max(0, NAVBAR_OFFSET - topmostRect.top)
  const scrollWithinComment = Math.min(1, scrolledPast / Math.max(1, topmostEl.offsetHeight))

  // Can't leave the bucket until a comment from the next one becomes topmost
  const fractionWithinBucket = Math.min(1, (commentIndexInBucket + scrollWithinComment) / bucketCount)
  currentScrollFraction.value = Math.max(0, Math.min(1, bucketStartFraction + fractionWithinBucket * (nextBucketFraction - bucketStartFraction)))
}

onMounted(() => {
  if (!import.meta.client)
    return

  window.addEventListener('scroll', updateScrollFraction, { passive: true })
  updateScrollFraction()
})

onUnmounted(() => {
  window.removeEventListener('scroll', updateScrollFraction)
})

// The reply area keeps growing after first paint (avatars, images, lazy media).
// Without this a thread opened at the top can measure as at-latest too early and
// never show "Jump to latest".
useResizeObserver(replyAreaEl, () => updateScrollFraction())

async function handleTimelineNavigate(date: Date) {
  if (navigateToDateLoading.value)
    return

  navigateToDateLoading.value = true
  navigating.value = true
  try {
    const replyId = await navigateToDate(date, { findFirst: true })
    if (replyId != null) {
      // A hidden off-topic target has to be revealed before it can be scrolled to
      const target = modelledComments.value.find(c => c.id === replyId)
      if (target?.is_offtopic && !showOfftopic.value) {
        showOfftopic.value = true
        hasManuallySwitched.value = true
      }

      // Let the rebuild settle first, or scrollToIdWhenStable can catch the
      // element mid-rebuild near the top and lock the scroll there
      await nextTick()
      await waitForLayoutStability(5000)
      await scrollToIdWhenStable(`#comment-${replyId}`, 'start', 3000, 150, props.additionalScrollOffset)
    }
  }
  finally {
    // Cleared after the scroll so the dim stays up until the target is in view
    navigateToDateLoading.value = false
    setTimeout(() => {
      navigating.value = false

      // Mid-jump scroll events all saw navigating=true, and a jump that lands on
      // the newest reply fires no further scroll
      updateScrollFraction()
    }, 350)
  }
}

// Same gate as the bottom controls. Also drives the toolbar's mobile second line.
const showTopPagination = computed(() => usePagination.value && (hasMore.value || currentPage.value > 1))

// The trailing delay keeps the dim visible even for instant cached pages
async function goToPage(page: number) {
  if (page === currentPage.value || navigating.value)
    return

  navigating.value = true

  dropAnchorOnPageSync = true
  try {
    await loadPage(page)

    // Otherwise the viewport stays parked at the bottom control
    await nextTick()
    scrollToId(`#discussion-top-${props.id}`, 'start', false, props.additionalScrollOffset)
  }
  finally {
    await nextTick()
    setTimeout(() => {
      navigating.value = false
      updateScrollFraction()
    }, 150)
  }
}

async function handleTimelineNavigateToStart() {
  // Past page 1 the page top isn't the thread start
  if (usePagination.value && currentPage.value > 1) {
    await loadPage(1)
    await nextTick()
  }
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

async function handleTimelineNavigateToEnd() {
  if (!timelineEnd.value || navigateToDateLoading.value)
    return

  // Fast path: with nothing newer to load, the newest reply is already in memory.
  // navigateToDate would rebuild the page and stall on a network load.
  if (!hasMore.value) {
    const lastReplyId = modelledComments.value.at(-1)?.id
    if (lastReplyId != null) {
      const target = modelledComments.value.find(c => c.id === lastReplyId)
      if (target?.is_offtopic && !showOfftopic.value) {
        showOfftopic.value = true
        hasManuallySwitched.value = true
        await nextTick()
      }

      // No navigating flag: this is a pure scroll, and dimming would look like a
      // reload. Recompute after in case the jump fired no final scroll event.
      await scrollToIdWhenStable(`#comment-${lastReplyId}`, 'start', 6000, 500, props.additionalScrollOffset)
      updateScrollFraction()
      return
    }
  }

  navigateToDateLoading.value = true
  navigating.value = true
  try {
    // Floor semantics: the last reply at or before the discussion end
    const replyId = await navigateToDate(new Date(timelineEnd.value), { findFirst: false })
    if (replyId != null) {
      const target = modelledComments.value.find(c => c.id === replyId)
      if (target?.is_offtopic && !showOfftopic.value) {
        showOfftopic.value = true
        hasManuallySwitched.value = true
      }
      await nextTick()
      await waitForLayoutStability(5000)

      // The floor can land one short of the true last reply
      const lastReplyId = modelledComments.value.at(-1)?.id ?? replyId

      // Long stability window so re-anchoring keeps up with lazy images above
      await scrollToIdWhenStable(`#comment-${lastReplyId}`, 'start', 6000, 500, props.additionalScrollOffset)
    }
  }
  finally {
    navigateToDateLoading.value = false
    setTimeout(() => {
      navigating.value = false

      // Mid-jump scroll events all saw navigating=true, and a jump that lands on
      // the newest reply fires no further scroll
      updateScrollFraction()
    }, 350)
  }
}

// ── View count ────────────────────────────────────────────────────────────────

const lastIncrementedId = ref<string | null>(null)

async function incrementDiscussionView() {
  const id = discussion.value?.id
  if (!id || !import.meta.client || id === lastIncrementedId.value)
    return

  lastIncrementedId.value = id

  await supabase.rpc('increment_discussion_view_count', {
    target_discussion_id: id,
  })
}

function handleVisibilityChange() {
  if (!document.hidden) {
    incrementDiscussionView()
  }
}

function handleFocus() {
  incrementDiscussionView()
}

watch(
  () => discussion.value?.id,
  () => incrementDiscussionView(),
)

onMounted(() => {
  incrementDiscussionView()
  document.addEventListener('visibilitychange', handleVisibilityChange)
  window.addEventListener('focus', handleFocus)
})

onUnmounted(() => {
  document.removeEventListener('visibilitychange', handleVisibilityChange)
  window.removeEventListener('focus', handleFocus)
})

// ── Comment writing & validation ──────────────────────────────────────────────

const formLoading = ref(false)

const form = reactive({
  message: '',
  is_nsfw: false,
})

// Reply target coming back from a saved draft. Skips the focus that picking a
// target normally triggers, so a restore doesn't yank the page to the composer.
let restoredReplyToId: string | null = null

async function restoreReplyingTo(id: string) {
  const loaded = modelledComments.value.find(c => c.id === id)
  if (loaded != null) {
    restoredReplyToId = id
    replyingTo.value = loaded
    return
  }

  // Usually not on the loaded page yet. A reply that's been deleted since the
  // draft was saved is dropped and the text restores on its own.
  const { data } = await supabase
    .from('discussion_replies')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (data == null || data.is_deleted || replyingTo.value != null)
    return

  restoredReplyToId = id
  replyingTo.value = { ...(data as RawComment), reply: null }
}

// Back the composer up to localStorage per user and discussion (and per vote
// answer, since those share one discussion) so a closed tab doesn't eat it.
useReplyDraft(() => {
  if (userId.value == null || props.hideInput)
    return null

  return [userId.value, props.type, props.id, props.hash].filter(Boolean).join(':')
}, form, {
  replyToId: () => replyingTo.value?.id ?? null,
  restoreReplyTo: restoreReplyingTo,
})

provide(DISCUSSION_KEYS.setReplyToComment, (comment: Comment) => replyingTo.value = comment)

const textareaRef = useTemplateRef<{ focus: () => void, rootEl: HTMLElement | null }>('textarea')

// Lifts the "Jump to latest" pill above the floating composer. The border box
// includes the composer's --audio-dock-height padding while the mini-player is docked.
const { height: composerHeight } = useElementSize(
  () => (settings.value.editor_floating ? textareaRef.value?.rootEl ?? null : null),
  { width: 0, height: 0 },
  { box: 'border-box' },
)
const jumpToPresentOffset = computed(() => Math.round(composerHeight.value))

function focusTextarea() {
  if (textareaRef.value)
    textareaRef.value.focus()
}

watch(replyingTo, (comment) => {
  if (comment != null && comment.id === restoredReplyToId) {
    restoredReplyToId = null
    return
  }

  focusTextarea()
})

provide(DISCUSSION_KEYS.setQuoteOfComment, (comment: Comment) => {
  const quoted = wrapInBlockquote(`@{${comment.created_by}} said\n\n${comment.markdown}`)

  form.message = form.message.length > 0
    ? `${form.message}\n\n${quoted}`
    : quoted

  focusTextarea()
})

const rules = defineRules<typeof form>({
  message: [
    withLabel('You cannot send an empty string', required),
    withLabel('You cannot send an empty string', minLenNoSpace(1)),
    withLabel(`Your comment cannot exceed ${MAX_COMMENT_CHARS} characters`, maxLength(MAX_COMMENT_CHARS)),
  ],
})

const { validate, errors, addError, reset } = useValidation(form, rules, {
  autoclear: true,
})

async function submitReply() {
  if (formLoading.value)
    return

  formLoading.value = true

  validate()
    .then(async () => {
      if (!discussion.value) {
        addError('message', {
          key: 'required',
          message: 'Discussion is not available yet. Please try again in a moment.',
        })
        formLoading.value = false
        return
      }

      const commentData = {
        markdown: normalizeTipTapOutput(form.message),
        is_nsfw: form.is_nsfw,
        discussion_id: discussion.value.id,
        ...(!!replyingTo.value && { reply_to_id: replyingTo.value.id }),
        ...(props.hash && {
          meta: { hash: props.hash },
        }),
      }

      const res = await supabase
        .from('discussion_replies')
        .insert(commentData)
        .select()
        .single()

      if (res.error) {
        addError('message', {
          key: 'required',
          message: res.error.message,
        })
      }
      else {
        reset()

        const parentId = replyingTo.value?.id
        if (parentId != null) {
          replyCountMap.value.set(parentId, (replyCountMap.value.get(parentId) ?? 0) + 1)
        }
        replyingTo.value = undefined
        form.message = ''
        form.is_nsfw = false
        if (props.model === 'comment')
          comments.value.unshift(res.data as RawComment)
        else
          comments.value.push(res.data as RawComment)

        // A DB trigger bumped reply_count, so the cached discussion row is stale
        if (discussion.value) {
          useDiscussionCache().invalidate(discussion.value.id, discussion.value.slug)

          // The replies page cache too, or a reload serves pages from before this reply
          useDiscussionRepliesCache().invalidate(discussion.value.id)
        }

        // Our own realtime INSERT can land before or after the optimistic push,
        // and must not count as a new reply
        realtime.pendingReplyCount.value = 0

        // Keeps the poster's own reply from showing as unread forum activity
        emit('replySubmitted', (discussion.value.reply_count ?? 0) + 1, discussion.value.id)
      }

      formLoading.value = false
    })
    .catch(() => {
      formLoading.value = false
    })
}

provide(DISCUSSION_KEYS.deleteComment, deleteCommentFromList)
provide(DISCUSSION_KEYS.forceDeleteComment, forceDeleteCommentFromList)

// ── Off-topic visibility helpers ──────────────────────────────────────────────

function isCommentVisible(comment: Comment): boolean {
  if (!comment.is_offtopic)
    return true

  return showOfftopic.value
}

function isNodeVisible(node: ThreadNode): boolean {
  return isCommentVisible(node.comment)
}

function openTimeline() {
  timelineRef.value?.openJumpModal()
}

function goToEnd() {
  void handleTimelineNavigateToEnd()
}

defineExpose({ navigatingToComment, openTimeline, goToEnd, showTimeline })
</script>

<template>
  <div class="discussion" :class="[`discussion--${props.model}`]">
    <JumpToPresent
      :visible="showJumpToPresent"
      position="fixed"
      label="Jump to latest"
      :offset="jumpToPresentOffset"
      @click="handleTimelineNavigateToEnd"
    />

    <template v-if="loading">
      <template v-if="props.model === 'forum'">
        <DiscussionToolbarSkeleton is-forum />
        <div class="discussion__loading-cards">
          <DiscussionReplyCardSkeleton v-for="n in 4" :key="n" />
        </div>
      </template>
      <template v-else>
        <Skeleton class="mb-m mt-s" :height="116" />
        <DiscussionToolbarSkeleton />
        <div class="discussion__loading-cards">
          <DiscussionCommentCardSkeleton v-for="n in 3" :key="n" />
        </div>
      </template>
    </template>

    <template v-else-if="error">
      <ErrorAlert message="Failed to load discussion" :error="error" />
    </template>

    <!-- Listing view -->
    <template v-else>
      <template v-if="props.model === 'comment'">
        <DiscussionReplyInput
          v-if="props.hideInput !== true"
          ref="textarea"
          :replying-to="replyingTo"
          :message="form.message"
          :is-nsfw="form.is_nsfw"
          :errors="(errors as unknown as { message: ValidationError })"
          :form-loading="formLoading"
          :placeholder="props.placeholder"
          :user-id="userId"
          :can-bypass-lock="canBypassLock"
          :floating="settings.editor_floating"
          @update:replying-to="replyingTo = $event"
          @update:message="form.message = $event"
          @update:is-nsfw="form.is_nsfw = $event"
          @submit="submitReply"
        />

        <div class="mb-m" />
      </template>

      <!-- The pagination control scrolls here on a page change -->
      <div :id="`discussion-top-${props.id}`" class="discussion__top-anchor" />

      <DiscussionToolbar
        :view-mode="viewMode"
        :has-comments="modelledComments.length > 0"
        :has-pagination="showTopPagination"
        :offtopic-count="offtopicCount"
        :show-offtopic="showOfftopic"
        :show-thread-replies="showThreadReplies"
        :show-timeline-button="showTimeline"
        :show-subscribe-button="props.model === 'comment' && !!userId"
        :is-subscribed="isSubscribed"
        :subscription-loading="subscriptionLoading"
        @update:view-mode="handleViewModeUpdate"
        @update:show-offtopic="handleShowOfftopicUpdate"
        @update:show-thread-replies="handleShowThreadRepliesUpdate"
        @go-to-pinned="handleGoToPinnedReply"
        @toggle-subscription="handleToggleSubscription"
        @open-timeline="timelineRef?.openJumpModal()"
        @go-to-end="handleTimelineNavigateToEnd"
      >
        <!-- One control covers both views, since they paginate the same -->
        <template #center>
          <Pagination
            v-if="showTopPagination"
            :pagination="paginate(paginationTotal, currentPage, discussionPageSize)"
            @change="goToPage($event)"
          />
        </template>
      </DiscussionToolbar>

      <DiscussionPendingBanner
        v-if="props.model === 'comment' && realtime.pendingReplyCount.value > 0"
        model="comment"
        :count="realtime.pendingReplyCount.value"
        :loading="realtime.pendingLoading.value"
        @load="realtime.loadPendingReplies()"
      />

      <!-- position: relative so the timeline's absolute top aligns with the first card -->
      <div
        ref="replyAreaEl"
        class="discussion__reply-area"
        :class="{ 'discussion__reply-area--navigating': isNavigating }"
      >
        <!-- Pinned - if a comment is set as pinned, it's duplicated and listed up above everything else -->
        <!-- Uses a distinct id-prefix so querySelector('#comment-{id}') in scroll
             helpers always resolves to the list instance, not this pinned banner. -->
        <DiscussionItem
          v-if="pinnedComment"
          :class="props.model === 'forum' ? 'mb-xl' : 'mb-m'"
          :data="pinnedComment"
          :model="props.model"
          id-prefix="pinned-comment"
        />

        <!-- v-show keeps items mounted across mode switches, so MarkdownRenderer never
             re-suspends and flashes the skeleton -->
        <div v-show="viewMode === 'flat' && modelledComments.length > 0">
          <DiscussionOfftopicBanner
            v-if="offtopicBannerAtStart"
            :count="offtopicBannerAtStartCount"
            @show="handleShowOfftopicUpdate(true)"
          />
          <template v-for="(comment, index) in modelledComments" :key="comment.id">
            <DiscussionItem
              v-if="isCommentVisible(comment)"
              :data="comment"
              :model="props.model"
              :thread-node="threadNodeMap.get(comment.id)"
              :show-offtopic="showOfftopic"
              :stagger-index="Math.min(index, 10)"
            />
            <DiscussionOfftopicBanner
              v-if="offtopicBannerAfterIds.has(comment.id)"
              :count="offtopicBannerAfterIds.get(comment.id)!"
              @show="handleShowOfftopicUpdate(true)"
            />
            <DiscussionGapBanner
              v-if="gap != null && gap.count > 0 && comment.id === gap.afterId"
              :count="gap.count"
              :loading="loadingGap"
              :page-size="discussionPageSize"
              @load-up="loadGapFromBottom()"
              @load-down="loadGapFromTop()"
            />
          </template>

          <div v-if="!usePagination" ref="bottomSentinelEl" />

          <DiscussionLoadMore
            v-if="!usePagination && hasMore"
            :loading="loadingMore"
            :remaining-count="remainingCount"
            @load="loadMore()"
          />

          <Flex x-center expand y-center class="mb-l discussion__pagination">
            <Pagination
              v-if="usePagination && (hasMore || currentPage > 1)"
              :pagination="paginate(paginationTotal, currentPage, discussionPageSize)"
              @change="goToPage($event)"
            />
          </Flex>
        </div>

        <div v-show="viewMode === 'threaded' && threadRoots.length > 0">
          <DiscussionOfftopicBanner
            v-if="offtopicBannerAtStart"
            :count="offtopicBannerAtStartCount"
            @show="handleShowOfftopicUpdate(true)"
          />
          <template v-for="(node, index) in threadRoots" :key="node.comment.id">
            <DiscussionItem
              v-if="isNodeVisible(node)"
              :data="node.comment"
              :model="props.model"
              :children="node.children"
              :show-offtopic="showOfftopic"
              :depth="0"
              :stagger-index="Math.min(index, 10)"
            />
            <DiscussionOfftopicBanner
              v-if="offtopicBannerAfterIds.has(node.comment.id)"
              :count="offtopicBannerAfterIds.get(node.comment.id)!"
              @show="handleShowOfftopicUpdate(true)"
            />
            <DiscussionGapBanner
              v-if="gap != null && gap.count > 0 && node.comment.id === gap.afterId"
              :count="gap.count"
              :loading="loadingGap"
              :page-size="discussionPageSize"
              @load-up="loadGapFromBottom()"
              @load-down="loadGapFromTop()"
            />
          </template>

          <div v-if="!usePagination" ref="bottomSentinelThreadedEl" />

          <DiscussionLoadMore
            v-if="!usePagination && hasMore"
            :loading="loadingMore"
            @load="loadMore()"
          />

          <Flex x-center expand y-center class="mb-l discussion__pagination">
            <Pagination
              v-if="usePagination && (hasMore || currentPage > 1)"
              :pagination="paginate(paginationTotal, currentPage, discussionPageSize)"
              @change="goToPage($event)"
            />
          </Flex>
        </div>

        <DiscussionPendingBanner
          v-if="realtime.pendingReplyCount.value > 0"
          model="forum"
          :count="realtime.pendingReplyCount.value"
          :loading="realtime.pendingLoading.value"
          @load="realtime.loadPendingReplies()"
        />

        <template v-if="props.model !== 'comment'">
          <DiscussionReplyInput
            v-if="props.hideInput !== true"
            ref="textarea"
            :replying-to="replyingTo"
            :message="form.message"
            :is-nsfw="form.is_nsfw"
            :errors="(errors as unknown as { message: ValidationError })"
            :form-loading="formLoading"
            :placeholder="props.placeholder"
            :user-id="userId"
            :can-bypass-lock="canBypassLock"
            :floating="settings.editor_floating"
            @update:replying-to="replyingTo = $event"
            @update:message="form.message = $event"
            @update:is-nsfw="form.is_nsfw = $event"
            @submit="submitReply"
          />
        </template>

        <DiscussionTimeline
          v-if="showTimeline"
          ref="timelineRef"
          :start="timelineStart"
          :end="timelineEnd"
          :buckets="timelineBuckets"
          :offtopic-buckets="timelineOfftopicBuckets"
          :offtopic-hidden="!showOfftopic"
          :gap-range="timelineGapRange"
          :bucket-interval-ms="timelineBucketIntervalMs"
          :current-fraction="currentScrollFraction"
          :loading="navigateToDateLoading"
          @navigate="handleTimelineNavigate"
          @navigate-to-start="handleTimelineNavigateToStart"
          @navigate-to-end="handleTimelineNavigateToEnd"
        />
      </div>
    </template>
  </div>
</template>

<style scoped lang="scss">
.discussion {
  &__loading-cards {
    display: flex;
    flex-direction: column;
    gap: var(--space-m);
  }

  display: flex;
  width: 100%;
  flex-direction: column;
  position: relative;
  // In order to increase hover range for each comment,
  // the gaps are 0 and instead items use padding
  gap: 0;

  --left-offset: 40px;

  &__reply-area {
    position: relative;
    transition: opacity var(--transition-slow);

    &--navigating {
      opacity: 0.45;
      pointer-events: none;
    }
  }

  &--forum {
    .discussion__add {
      padding-left: 0;
    }
  }

  &__offtopic-label {
    font-size: var(--font-size-s);
    color: var(--color-text-lighter);
  }

  &__offtopic-switch {
    :deep(.vui-switch__track) {
      transform: scale(0.85);
    }
  }

  &__add {
    &:deep(.vui-alert) {
      background-color: var(--color-bg-medium);
      margin-bottom: 6px;
    }

    &:deep(.vui-alert-icon) {
      display: none;
    }

    &--floating {
      position: sticky;
      bottom: 0;
      z-index: var(--z-sticky);
      padding-top: var(--space-s);
      // The docked audio mini-player publishes its height as --audio-dock-height.
      // Reserving it keeps the player off this sticky input. 0 when nothing's playing.
      padding-bottom: var(--audio-dock-height, 0px);
      background: linear-gradient(to bottom, transparent, var(--color-bg) var(--space-s));

      &:deep(.vui-alert) {
        background-color: var(--color-bg-medium);
      }
    }
  }

  &__add--replying-label {
    display: block;
    margin-bottom: var(--space-xxs);
    font-size: var(--font-size-xs);
    color: var(--color-text-lighter);

    :deep(.user-display__link .user-display__username) {
      font-size: var(--font-size-xs);
      color: var(--color-text-lighter);
    }
  }
}
</style>
