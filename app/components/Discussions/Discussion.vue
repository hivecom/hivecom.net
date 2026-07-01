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
  /**
   * The type of entity this discussion is attached to
   */
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
  /**
   * Additional scroll offset in px added on top of the default navbar offset.
   * Use this when a page has an extra sticky element (e.g. a fixed post header)
   * that would otherwise obscure the scrolled-to comment.
   */
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

// Re-export from Discussion.types.ts for backward compatibility with consumers
// that import these types from Discussion.vue directly.
export type { Comment, DiscussionSettings, ProvidedDiscussion, RawComment, ThreadNode } from './Discussion.types'

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

// Pre-warm user cache for all reply authors so each DiscussionModelForum
// instance gets a cache hit instead of firing its own user_roles + profiles
// queries. Same pattern as forum/index.vue does for post authors.
// We use a stable ref (not computed) to avoid spurious bulk re-fetches when
// the array reference changes but the contents don't.
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
  // Lazily delegate to pushRealtimeReplies once the data composable has
  // initialised - avoids a circular initialisation dependency.
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

// Shared-link state captured once at mount from the URL. A copied paginated link
// carries ?page (and ?view) so a recipient lands on the same page and view even
// when their own defaults differ - a page number means different content in flat
// vs threaded (which paginates top-level entries). Parsers are defensive: an
// absent/invalid value falls back to the viewer's settings.
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
// A bare ?page link implies paginated intent: honor it for this visit even when
// the viewer's setting is infinite, so the shared page resolves. Non-reactive so
// it doesn't flip back when later navigation strips ?page from the URL.
// BUT a ?comment deep link takes precedence - comment links carry ?page from the
// copy, and forcing pagination there would switch the viewer's mode instead of
// just taking them to the comment (which works in either mode). So don't force
// when a ?comment is present.
const hasCommentLink = getRouteQueryStringOrNull(route.query.comment) != null
const sharedPaginatedLink = initialPage.value != null && !hasCommentLink

// A ?comment deep link is reachable in either view, so it must not switch the
// recipient's view - the same reasoning as sharedPaginatedLink above. Only honor
// a link's ?view when it isn't a comment link (e.g. a shared ?page link, where
// page means different content per view). Otherwise fall back to the viewer's
// own setting.
const viewMode = ref<ViewMode>(
  (hasCommentLink ? undefined : parseView(route.query.view))
  ?? settings.value.discussion_view_mode
  ?? 'flat',
)
const discussionPageSize = computed(() => props.model === 'forum' ? PAGE_SIZE_FORUM : PAGE_SIZE_COMMENT)
// Whether to use traditional pagination (page controls + loadPage) over infinite
// scroll. Comment model is always paginated; the forum model follows the user's
// setting; a shared ?page link forces it for the visit. Only changes how replies
// load - the forum keeps its own look and every feature.
const usePagination = computed(() =>
  props.model === 'comment'
  || sharedPaginatedLink
  || (props.model === 'forum' && settings.value.forum_pagination_mode === 'paginated'),
)
watch(() => settings.value.discussion_view_mode, (val) => {
  viewMode.value = val ?? 'flat'
})

// ── Comment data ──────────────────────────────────────────────────────────────

// Deep-link target present at mount (?comment=<id>). Passed into the data
// composable so its initial load jumps straight to the target's page instead
// of loading page 1 first. Kept as a ref so the composable reads it at
// load-start; we don't keep it in sync afterwards - later ?comment changes are
// handled by the navigateToLinkedComment watcher below.
const initialCommentId = ref<string | undefined>(
  getRouteQueryStringOrNull(route.query.comment) ?? undefined,
)

// Optional `?ts=<created_at ms>` anchor that copied comment links carry. In
// chronological (ascending forum) view a reply's position is stable, so this
// timestamp lets the initial load fetch the target block directly and skip the
// page-lookup RPC. Parsed defensively; absent/invalid means "use the RPC path".
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
    // Clear replyingTo if the deleted comment was being quoted
    if (replyingTo.value?.id === deletedId) {
      replyingTo.value = undefined
    }
  },
)
pushRealtimeReplies = _pushRealtimeReplies

// When the user flips the loading mode mid-thread, reset to the first page so the
// control and the loaded set agree: an infinite-scrolled list spans many pages
// the pagination control can't represent, and a paginated view has no sentinel
// for infinite scroll to resume from. loadPage(1) resets the list in both modes.
watch(usePagination, () => {
  if (discussion.value)
    void loadPage(1)
})

// Reflect pagination/view in the URL so a reload or shared link reproduces them.
// - ?view=threaded whenever threaded (the non-default): any shared link, comment
//   or page, switches the recipient to threaded so the content is interpreted the
//   same way. Flat is the default and carries no param.
// - ?page=N while paginating past page 1 (a page number means different content
//   per view, so it always travels with ?view). Infinite mode writes no page.
// router.replace keeps it out of history. Covers every change (control, timeline,
// deep link, view toggle).
//
// Changing page from the pagination control also strips the one-shot ?comment
// (and its ?ts) anchor: once you've paged away the linked comment is stale, and
// leaving it in the URL would re-scroll to that comment every time you returned
// to its page. goToPage raises this flag; the sync consumes it on its next run.
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
  // Don't show the pinned banner if the reply is already the first item in the
  // list - it would appear twice, one immediately above the other.
  const listIndex = modelledComments.value.findIndex(c => c.id === pinnedId)
  if (listIndex === 0)
    return null
  // Reply is in the loaded pages - use the modelled version (reply ref resolved).
  if (listIndex > 0)
    return modelledComments.value[listIndex]!
  // Not in the loaded pages yet - use the independently fetched raw row.
  // The reply reference won't be resolved but the pinned banner still displays.
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

// If the URL targets a specific comment, ensure it's visible even if it's
// off-topic. We watch modelledComments so this fires once data has loaded -
// the query param is already there on mount but comments may not be yet.
//
// We also watch route.query.comment reactively so that notification clicks
// while already on this page (which only change the query param) still
// trigger the deep-link navigation.
const navigatingToComment = ref(false)

// Safety: never leave the reply area dimmed if a deep-link navigation stalls (a
// wait that never resolves, a missing target, a hung layout-stability check). The
// normal path clears navigatingToComment when it finishes; this caps how long the
// dim can persist. The timer is reset on each new navigation and cancelled on a
// clean clear.
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

// A nested reply doesn't reliably render in the threaded main tree on its own:
// in paginated view it has no page (only roots are paged), and in infinite view
// it loads but sits under collapsed ancestors. Resolve its root, navigate to that
// root (loads its page in paged mode, its window in infinite), then signal the
// root to reveal its subtree. With reply threads expanded the root opens in place;
// with them collapsed it opens in the sheet (inline expansion only loads one
// level). Either way the target self-scrolls once rendered (its id is still in
// ?comment). No-ops when the target is itself a root.
async function revealThreadedChild(childId: string) {
  const { data: rootId, error } = await supabase.rpc('get_thread_root', { p_reply_id: childId })
  if (error != null || rootId == null || rootId === childId)
    return
  await navigateToComment(rootId as string, { soft: true })
  await nextTick()
  openThreadSheetId.value = rootId as string
}

async function navigateToLinkedComment(commentId: string) {
  // If the target element is already in the DOM, the scroll will be instant -
  // no need to dim the page.
  const alreadyInDom = document.querySelector(`#comment-${commentId}`) != null
  if (!alreadyInDom)
    navigatingToComment.value = true
  // If discussion isn't loaded yet, wait for it first.
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

  // When this is the deep-link target present at mount, the data composable's
  // initial load OWNS the navigation - it jumps straight to the target's page
  // as the initial content (no page-1 load, no dead time). We must NOT also run
  // navigateToComment here: that would race the composable's own navigation
  // (duplicate cursor RPC + page fetch, _listGeneration collisions). Instead we
  // just wait for that load to settle, then fall through to the scroll handling.
  const isInitialTarget = commentId === initialCommentId.value

  if (isInitialTarget) {
    // Wait until the composable's initial load has placed the target into the
    // list (it navigates straight to the target's page) OR has fully settled.
    // We watch the comment set rather than only the loading flag because the
    // synchronous cache fast-path can leave loading=false while the composable's
    // own navigateToComment is still awaiting the target page.
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
    // Nested reply in threaded view. With auto-expand on in infinite mode the
    // reply already renders inline (its thread is expanded from the loaded window)
    // and self-scrolls, so jumping to its root would only disrupt it. Reveal via
    // the root only when the reply won't be inline: paginated (it has no page) or
    // auto-expand off (its thread is collapsed). revealThreadedChild no-ops when
    // the target is itself a root.
    if (viewMode.value === 'threaded') {
      const tc = modelledComments.value.find(c => c.id === commentId)
      const inlineExpanded = !usePagination.value && showThreadReplies.value
      if (!inlineExpanded && (tc == null || tc.reply_to_id != null))
        await revealThreadedChild(commentId)
    }
  }
  else {
    // Other target (e.g. a notification click that changes ?comment while
    // already on the page). Wait for any in-flight initial load to finish first:
    // otherwise navigateToComment races loadFirstPage, whose applyPage(reset: true)
    // would overwrite the target and leave it absent from the DOM, so the scroll
    // never fires. Then explicitly navigate to the new target.
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
    // Nested reply in threaded view. Skip the root-jump when it already renders
    // inline (infinite + auto-expand); only reveal when it won't be inline -
    // paginated (no page for it) or auto-expand off (thread collapsed). A root
    // falls through to the normal scroll; a genuinely missing target bails.
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
    // Only act on genuine changes (skip same-value updates and clears).
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

// Keep in sync if the global setting changes (e.g. user visits settings page
// in another tab) but do not overwrite a manual per-session choice made after
// the component has mounted.
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

/**
 * Set of comment IDs after which a run of hidden offtopic replies begins.
 * Used to insert the inline offtopic banner at the right position in the list.
 * Only populated when showOfftopic is false and there are offtopic replies loaded.
 */
/**
 * Maps boundary comment IDs to the count of offtopic replies in that run.
 * A "boundary" is the last visible (non-offtopic) comment before a hidden offtopic run begins.
 */
const offtopicBannerAfterIds = computed((): Map<string, number> => {
  if (showOfftopic.value || offtopicCount.value === 0)
    return new Map()
  const map = new Map<string, number>()
  const list = modelledComments.value
  for (let i = 0; i < list.length - 1; i++) {
    const curr = list[i]!
    const next = list[i + 1]!
    // Find the start of an offtopic run after a visible comment
    if (!curr.is_offtopic && next.is_offtopic) {
      // Count how many consecutive offtopic replies follow
      let runCount = 0
      for (let j = i + 1; j < list.length && list[j]!.is_offtopic; j++) {
        runCount++
      }
      map.set(curr.id, runCount)
    }
  }
  return map
})

/** True when the first loaded comment is already offtopic (banner goes before everything) */
const offtopicBannerAtStart = computed((): boolean => {
  if (showOfftopic.value || offtopicCount.value === 0)
    return false
  const first = modelledComments.value[0]
  return first != null && first.is_offtopic
})

/** Count of offtopic replies in the leading run (when the list starts with offtopic replies) */
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

// Whether the current user is the discussion author (OP)
const isDiscussionAuthor = computed(() =>
  !!userId.value && !!discussion.value && discussion.value.created_by === userId.value,
)

// Can mark replies as off-topic
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

/** Height of the sticky navbar in px - used to offset scroll position tracking. */
const NAVBAR_OFFSET = 148
const navigateToDateLoading = ref(false)
const navigating = ref(false)
// True while any navigation that should dim/freeze the reply area is in flight:
// pagination/timeline (navigating) or a deep-link to a specific comment
// (navigatingToComment). Drives the dim overlay and suspends scroll-fraction
// updates so the timeline cursor doesn't jump mid-navigation.
const isNavigating = computed(() => navigating.value || navigatingToComment.value)
const replyAreaEl = ref<HTMLElement | null>(null)
const bottomSentinelEl = ref<HTMLElement | null>(null)
const bottomSentinelThreadedEl = ref<HTMLElement | null>(null)
const activeSentinel = computed(() =>
  viewMode.value === 'threaded' ? bottomSentinelThreadedEl.value : bottomSentinelEl.value,
)
const currentScrollFraction = ref<number | null>(null)
// True when the newest loaded reply is on screen and nothing newer remains to
// load. Drives the "Jump to latest" button independently of the timeline
// fraction (which tracks the topmost-visible comment and can read < 1 even when
// the last reply is fully visible - e.g. a tall final reply, or the
// composer/footer below it keeps us off the document's pixel-bottom).
const atLatest = ref(false)

// Infinite scroll: auto-load the next page when the sentinel enters the viewport.
// Only active for forum model - comment model uses traditional pagination instead.
if (props.model !== 'comment') {
  useIntersectionObserver(activeSentinel, ([entry]) => {
    if (entry?.isIntersecting && hasMore.value && !loadingMore.value) {
      void loadMore()
    }
  }, { rootMargin: '0px 0px 300px 0px' })

  // After a content rebuild (e.g. timeline navigation), the sentinel may already
  // be in the viewport but the intersection observer won't re-fire because the
  // element's intersection state didn't change. Manually check when hasMore
  // becomes true so we don't strand the user at a dead-end page.
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

  // Also check sentinel visibility whenever modelledComments changes - if the
  // loaded set is short enough that the sentinel is still in viewport after a
  // page loads, the intersection observer won't re-fire for the next page.
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

  // Recompute scroll state after the loaded set or hasMore changes, so the
  // "Jump to latest" button hides when the final page loads while the newest
  // reply is already on screen (no scroll event fires to trigger the update).
  watch([hasMore, modelledComments], async () => {
    await nextTick()
    updateScrollFraction()
  })
}

/**
 * Show the timeline scrubber when:
 * - forum model (ascending, replies grow at the bottom)
 * - discussion has more than 1 reply
 */
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

// Tracks whether the pagination control is on screen. The "Jump to latest" bubble
// hides while it is: with the page controls right there, the bubble is redundant.
const paginationInView = ref(false)

// "Jump to present" bubble: shown once the reader has scrolled meaningfully away
// from the newest reply.
const showJumpToPresent = computed(() => {
  if (!showTimeline.value)
    return false
  if (atLatest.value || paginationInView.value)
    return false
  const f = currentScrollFraction.value
  return f != null && f < 0.99
})

const timelineStart = computed(() => discussion.value?.created_at ?? '')
const timelineEnd = computed(() => discussion.value?.last_activity_at ?? '')

// Pick bucket granularity based on the discussion span.
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
 * The unloaded gap's time range as ISO strings.
 *
 * There are two kinds of unloaded regions:
 *
 * 1. Explicit gap - two loaded blocks with unloaded replies between them
 *    (created by navigateToComment). The gap starts just after the boundary
 *    comment and extends to timelineEnd, because everything beyond the early
 *    block is still unloaded until the gap is fully closed.
 *
 * 2. Trailing unloaded zone - no explicit gap, but hasMore is true, meaning
 *    the loaded page(s) cover only the oldest replies. The unloaded region
 *    starts just after the last loaded comment and extends to timelineEnd.
 *
 * In both cases the dashed region runs to the discussion's end timestamp so
 * the user can see at a glance how much of the timeline is still unloaded.
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
        // Always cap the dashed zone at the first tail-block reply - the tail
        // is already loaded, so painting dashes over it is wrong regardless of
        // whether hasMore is still true. When hasMore IS true, Case 2 below
        // will independently show a trailing dashed zone after the tail block.
        const firstTailComment = list[afterIdx + 1]
        if (firstTailComment != null)
          return { start: afterComment.created_at, end: firstTailComment.created_at }
        // No tail item found (edge case) - fall back to discussion end.
        return { start: afterComment.created_at, end }
      }
    }
  }

  // Case 2: simple trailing unloaded zone (page 1 loaded, more pages exist).
  // Suppress if the last loaded reply IS the final reply of the discussion -
  // i.e. its created_at matches last_activity_at (timelineEnd). In that case
  // there is nothing after it to show as unloaded, regardless of hasMore.
  if (hasMore.value && list.length > 0) {
    const lastComment = list.at(-1)
    if (lastComment != null) {
      // Suppress the dashed region if the last loaded reply is within 1 second
      // of the discussion's last_activity_at - close enough to consider it "the end".
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

// Fetch activity buckets once the timeline becomes visible.
watch(showTimeline, async (visible) => {
  if (!visible)
    return
  await fetchTimelineBuckets()
}, { immediate: true })

// Re-fetch when view mode changes - threaded uses root-only buckets, flat uses all replies.
watch(viewMode, async () => {
  currentScrollFraction.value = null
  await fetchTimelineBuckets()
})

/** True when the newest loaded reply's bottom edge is within the viewport. */
function lastReplyInView(): boolean {
  const root = replyAreaEl.value
  if (root == null)
    return false
  // Walk backwards to the last *rendered* comment. The inactive view (flat vs
  // threaded) stays mounted via v-show, so the literal last element may be a
  // hidden duplicate with a zero rect (bottom 0) that would falsely read as
  // "in view". Skip those and check the last comment that actually has height.
  const items = root.querySelectorAll<HTMLElement>('[id^="comment-"]')
  for (let i = items.length - 1; i >= 0; i--) {
    const rect = items[i]!.getBoundingClientRect()
    if (rect.height > 0)
      return rect.bottom <= window.innerHeight + 4
  }
  return true
}

// Detect whether the (paginated) page control is within the viewport so the
// "Jump to latest" bubble can step aside while it's visible.
function updatePaginationInView() {
  if (!import.meta.client || replyAreaEl.value == null) {
    paginationInView.value = false
    return
  }
  // The inactive view (flat vs threaded) stays mounted via v-show with zero
  // height, so skip 0-height rows and test the one that's actually laid out.
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
  if (replyAreaEl.value == null || !discussion.value)
    return

  // Hide "Jump to latest" once the newest reply is visible and nothing newer is
  // left to load. Skipped mid-navigation, when page height is in flux.
  atLatest.value = !isNavigating.value && !hasMore.value && lastReplyInView()

  const startMs = new Date(discussion.value.created_at).getTime()
  const endMs = new Date(discussion.value.last_activity_at).getTime()
  if (endMs === startMs)
    return

  // If we are scrolled to (or past) the very bottom of the page, always pin the
  // indicator to 1 so it sits at the bottom of the track even when the last reply
  // is small and the normal topmost-element logic would leave it short.
  // Skip this during active navigation: the page height is in flux while new
  // pages load, so a temporarily short scrollHeight can cause a false atBottom
  // signal that pegs the indicator to 1 for the rest of the navigation.
  // Skip in paginated mode too: there the document bottom is only the end of the
  // current page, not the thread, so pinning to 1 would wrongly peg the marker to
  // the bottom. The timestamp-based logic below positions it within the thread.
  const atBottom = !isNavigating.value && !usePagination.value
    && window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 4
  if (atBottom) {
    currentScrollFraction.value = 1
    return
  }

  const replyAreaRect = replyAreaEl.value.getBoundingClientRect()

  // Reply area top is still below the navbar - we're above the loaded replies.
  if (replyAreaRect.top > NAVBAR_OFFSET) {
    // On page 1 (or infinite) the top of the loaded set is the start of the
    // thread, so pin to 0. In paginated mode past page 1 the top of the page is
    // mid-thread - map the first loaded comment's timestamp instead so the cursor
    // reflects the page's position rather than snapping to the start of the track.
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

  // Find the topmost comment element that is at least partially below the navbar.
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
    // Tail zone: all loaded comments scrolled above the navbar.
    if (usePagination.value) {
      // Paginated: this is the end of the current page, not the thread. Map the
      // last loaded comment's timestamp into the timeline so the marker reflects
      // that page's position rather than jumping to the bottom of the track.
      const lastComment = comments.value.at(-1)
      currentScrollFraction.value = lastComment != null
        ? Math.max(0, Math.min(1, (new Date(lastComment.created_at).getTime() - startMs) / (endMs - startMs)))
        : null
      return
    }
    // Infinite: the tail of the loaded set is the tail of the thread - use a
    // scroll-based fraction that reaches 1 at the very bottom.
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

  // No bucket data yet - fall back to raw timestamp fraction.
  if (buckets.length === 0 || bucketIntervalMs === 0) {
    currentScrollFraction.value = Math.max(0, Math.min(1, (commentMs - startMs) / (endMs - startMs)))
    return
  }

  // Find the bucket this comment falls into.
  let bucketIdx = -1
  for (let i = 0; i < buckets.length; i++) {
    const bMs = new Date(buckets[i]!.bucketStart).getTime()
    if (commentMs >= bMs && commentMs < bMs + bucketIntervalMs) {
      bucketIdx = i
      break
    }
  }

  // Comment doesn't match any bucket - fall back to raw timestamp fraction.
  if (bucketIdx === -1) {
    currentScrollFraction.value = Math.max(0, Math.min(1, (commentMs - startMs) / (endMs - startMs)))
    return
  }

  const bucket = buckets[bucketIdx]!
  const bucketStartMs = new Date(bucket.bucketStart).getTime()
  const nextBucketStartMs = bucketIdx + 1 < buckets.length
    ? new Date(buckets[bucketIdx + 1]!.bucketStart).getTime()
    : endMs

  // Map bucket boundaries to timeline fractions - the marker is clamped to this range.
  const bucketStartFraction = (bucketStartMs - startMs) / (endMs - startMs)
  const nextBucketFraction = (nextBucketStartMs - startMs) / (endMs - startMs)

  // Find the topmost comment's index among loaded comments within this bucket.
  // Combined with the bucket's total reply count, this gives us the scale.
  const bucketComments = comments.value.filter((c) => {
    const ms = new Date(c.created_at).getTime()
    return ms >= bucketStartMs && ms < bucketStartMs + bucketIntervalMs
  })
  const commentIndexInBucket = Math.max(0, bucketComments.findIndex(c => c.id === topmostId))
  const bucketCount = Math.max(1, bucket.replyCount)

  // Sub-step: how far we've scrolled past the top of the current comment element.
  // This lets the marker move smoothly within a single comment's screen space.
  const topmostRect = topmostEl.getBoundingClientRect()
  const scrolledPast = Math.max(0, NAVBAR_OFFSET - topmostRect.top)
  const scrollWithinComment = Math.min(1, scrolledPast / Math.max(1, topmostEl.offsetHeight))

  // (commentIndex + scrollWithinComment) / bucketCount = fractional position within bucket.
  // Restricted to [bucketStartFraction, nextBucketFraction] - can't leave the bucket
  // until the next comment (in a different bucket) becomes topmost.
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

// The reply area grows after first paint as async content settles (avatars,
// markdown images, lazy media). Each height change can flip whether the last
// reply is in view or whether we're at the document bottom, so recompute the
// scroll state - otherwise a thread opened at the top can measure as "at latest"
// before it has grown and never show the Jump-to-latest button.
useResizeObserver(replyAreaEl, () => updateScrollFraction())

async function handleTimelineNavigate(date: Date) {
  if (navigateToDateLoading.value)
    return
  navigateToDateLoading.value = true
  navigating.value = true
  try {
    const replyId = await navigateToDate(date, { findFirst: true })
    if (replyId != null) {
      // If the target reply is offtopic and hidden, reveal it so the element
      // actually exists in the DOM before we try to scroll to it.
      const target = modelledComments.value.find(c => c.id === replyId)
      if (target?.is_offtopic && !showOfftopic.value) {
        showOfftopic.value = true
        hasManuallySwitched.value = true
      }

      // Two-phase scroll:
      // 1. Wait for the DOM to flush and the page rebuild to fully settle
      //    (scrollHeight stable). This prevents scrollToIdWhenStable from
      //    catching the element mid-rebuild at absoluteTop ~0 and locking
      //    the scroll to the top of the page.
      // 2. Once the layout is stable, hand off to scrollToIdWhenStable which
      //    re-anchors on every rAF to handle any remaining content shifts
      //    (lazy images, markdown renders) that occur after the initial settle.
      await nextTick()
      await waitForLayoutStability(5000)
      await scrollToIdWhenStable(`#comment-${replyId}`, 'start', 3000, 150, props.additionalScrollOffset)
    }
  }
  finally {
    // Clear loading *after* the scroll call so the dim stays up until the
    // target is actually in view - not while waitForImages is still running.
    navigateToDateLoading.value = false
    setTimeout(() => {
      navigating.value = false
      // Recompute now that navigation settled: the scroll events fired mid-jump
      // all saw navigating=true (so atLatest stayed false), and a jump-to-end
      // that lands on the newest reply produces no further scroll to retrigger it.
      updateScrollFraction()
    }, 350)
  }
}

// Whether the top pagination control (in the toolbar row) should show. Same gate
// as the bottom controls; also drives the toolbar's mobile second-line layout.
const showTopPagination = computed(() => usePagination.value && (hasMore.value || currentPage.value > 1))

// Page changes from the pagination control. Toggling `navigating` dims the reply
// area (and suspends scroll-fraction updates) while the new page loads, giving
// the same "loading" feedback the timeline navigation does. The short trailing
// delay keeps the dim visible long enough to register even for instant cached
// pages, and the final recompute repositions the timeline cursor for the new page.
async function goToPage(page: number) {
  if (page === currentPage.value || navigating.value)
    return
  navigating.value = true
  // Paging from the control drops the stale ?comment anchor (the URL-sync watcher
  // does the actual strip) so returning to its page later doesn't re-scroll to it.
  dropAnchorOnPageSync = true
  try {
    await loadPage(page)
    // Fresh page, fresh content: jump to the top of the listing rather than
    // leaving the viewport parked where the (bottom) control was clicked.
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
  // In paginated mode the top of the current page is not the start of the thread,
  // so load page 1 first (which also updates the page control). loadPage resets
  // the list, then we scroll to the top.
  if (usePagination.value && currentPage.value > 1) {
    await loadPage(1)
    await nextTick()
  }
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

async function handleTimelineNavigateToEnd() {
  if (!timelineEnd.value || navigateToDateLoading.value)
    return

  // Fast path: when nothing newer remains to load (hasMore is false), the tail
  // block is already in memory, so the newest reply is just the last loaded one.
  // Anchor-scroll straight to it instead of round-tripping through
  // navigateToDate, which rebuilds the page and stalls behind a network load
  // even though the content is already present.
  if (!hasMore.value) {
    const lastReplyId = modelledComments.value.at(-1)?.id
    if (lastReplyId != null) {
      const target = modelledComments.value.find(c => c.id === lastReplyId)
      if (target?.is_offtopic && !showOfftopic.value) {
        showOfftopic.value = true
        hasManuallySwitched.value = true
        await nextTick()
      }
      // No navigating flag here: the content is already present, so this is a
      // pure scroll - dimming the reply area would make it look like a reload.
      // The scroll events keep atLatest (and the button) in sync; recompute once
      // more after settling in case the jump fired no final scroll event.
      await scrollToIdWhenStable(`#comment-${lastReplyId}`, 'start', 6000, 500, props.additionalScrollOffset)
      updateScrollFraction()
      return
    }
  }

  navigateToDateLoading.value = true
  navigating.value = true
  try {
    // Floor semantics: navigate to the last reply at or before the discussion end.
    // This loads the final page if it isn't already in memory.
    const replyId = await navigateToDate(new Date(timelineEnd.value), { findFirst: false })
    if (replyId != null) {
      const target = modelledComments.value.find(c => c.id === replyId)
      if (target?.is_offtopic && !showOfftopic.value) {
        showOfftopic.value = true
        hasManuallySwitched.value = true
      }
      await nextTick()
      await waitForLayoutStability(5000)
      // The date-navigated reply can be one short of the true last reply (the
      // floor lands on the last reply at/before the bucket end). Scroll to the
      // actual last loaded reply so "go to end" always lands on the newest one.
      const lastReplyId = modelledComments.value.at(-1)?.id ?? replyId
      // Use a long stability window so the re-anchoring loop keeps correcting
      // as lazy-loaded images above the target load in and shift the layout.
      await scrollToIdWhenStable(`#comment-${lastReplyId}`, 'start', 6000, 500, props.additionalScrollOffset)
    }
  }
  finally {
    navigateToDateLoading.value = false
    setTimeout(() => {
      navigating.value = false
      // Recompute now that navigation settled: the scroll events fired mid-jump
      // all saw navigating=true (so atLatest stayed false), and a jump-to-end
      // that lands on the newest reply produces no further scroll to retrigger it.
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

provide(DISCUSSION_KEYS.setReplyToComment, (comment: Comment) => replyingTo.value = comment)

const textareaRef = useTemplateRef<{ focus: () => void, rootEl: HTMLElement | null }>('textarea')

// Height of the floating reply composer, used to lift the "jump to latest" pill
// above it. Only tracked while the floating editor setting is on; otherwise the
// composer sits in normal flow and never overlaps the fixed pill, so offset 0.
// Measure the border box so the composer's own padding counts too, including the
// --audio-dock-height reservation it adds while the audio mini-player is docked.
// That keeps the pill above both the composer and the player.
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

watch(replyingTo, focusTextarea)

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
        // Increment the reply count for the parent before clearing replyingTo.
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
        // Invalidate the cached discussion row - the DB trigger has incremented
        // reply_count server-side so the cached value is now stale.
        if (discussion.value) {
          useDiscussionCache().invalidate(discussion.value.id, discussion.value.slug)
          // Invalidate the replies page cache so a reload fetches fresh data
          // instead of serving the stale pages that predate this new reply.
          useDiscussionRepliesCache().invalidate(discussion.value.id)
        }
        // The realtime INSERT event for our own post may arrive before or after
        // the optimistic push. Reset pendingReplyCount so our own reply never
        // shows up as a "new reply" indicator.
        realtime.pendingReplyCount.value = 0
        // Notify parent so the forum unread state can be updated, preventing
        // a spurious activity indicator when the user was the last poster.
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
      <!-- Comment model: input at top, then comments (newest first) -->
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

      <!-- Scroll anchor: the pagination control jumps here ("the top") on a page change. -->
      <div :id="`discussion-top-${props.id}`" class="discussion__top-anchor" />

      <!-- Toolbar: view mode selector + off-topic toggle -->
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
        <!-- Top pagination - shares the toolbar row with the view-mode switcher.
             One control here covers both views (flat/threaded paginate the same). -->
        <template #center>
          <Pagination
            v-if="showTopPagination"
            :pagination="paginate(paginationTotal, currentPage, discussionPageSize)"
            @change="goToPage($event)"
          />
        </template>
      </DiscussionToolbar>

      <!-- Pending banner for comment model: sits between toolbar and comments -->
      <DiscussionPendingBanner
        v-if="props.model === 'comment' && realtime.pendingReplyCount.value > 0"
        model="comment"
        :count="realtime.pendingReplyCount.value"
        :loading="realtime.pendingLoading.value"
        @load="realtime.loadPendingReplies()"
      />

      <!-- Reply area: position:relative so the timeline's absolute top aligns with the first card -->
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

        <!-- Flat view: all comments chronologically with inline reply previews -->
        <!-- v-show (not v-if) keeps items mounted across mode switches so MarkdownRenderer -->
        <!-- never re-suspends and the skeleton/fade-in flash doesn't appear. -->
        <div v-show="viewMode === 'flat' && modelledComments.length > 0">
          <!-- Offtopic banner at the very start when all leading replies are offtopic -->
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
            <!-- Offtopic banner: appears after the last visible comment before a hidden offtopic run -->
            <DiscussionOfftopicBanner
              v-if="offtopicBannerAfterIds.has(comment.id)"
              :count="offtopicBannerAfterIds.get(comment.id)!"
              @show="handleShowOfftopicUpdate(true)"
            />
            <!-- Gap banner: appears after the last item of the early block -->
            <DiscussionGapBanner
              v-if="gap != null && gap.count > 0 && comment.id === gap.afterId"
              :count="gap.count"
              :loading="loadingGap"
              :page-size="discussionPageSize"
              @load-up="loadGapFromBottom()"
              @load-down="loadGapFromTop()"
            />
          </template>

          <!-- Infinite scroll sentinel (flat mode) - infinite loading only -->
          <div v-if="!usePagination" ref="bottomSentinelEl" />

          <!-- Load more (flat mode) - infinite loading only, explicit fallback / status strip -->
          <DiscussionLoadMore
            v-if="!usePagination && hasMore"
            :loading="loadingMore"
            :remaining-count="remainingCount"
            @load="loadMore()"
          />

          <!-- Traditional pagination (flat mode) - paginated loading -->
          <Flex x-center expand y-center class="mb-l discussion__pagination">
            <Pagination
              v-if="usePagination && (hasMore || currentPage > 1)"
              :pagination="paginate(paginationTotal, currentPage, discussionPageSize)"
              @change="goToPage($event)"
            />
          </Flex>
        </div>

        <!-- Threaded view: only roots rendered, children nest recursively -->
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
            <!-- Offtopic banner: appears after the last visible root before a hidden offtopic run -->
            <DiscussionOfftopicBanner
              v-if="offtopicBannerAfterIds.has(node.comment.id)"
              :count="offtopicBannerAfterIds.get(node.comment.id)!"
              @show="handleShowOfftopicUpdate(true)"
            />
            <!-- Gap banner (threaded mode - roots only pagination) -->
            <DiscussionGapBanner
              v-if="gap != null && gap.count > 0 && node.comment.id === gap.afterId"
              :count="gap.count"
              :loading="loadingGap"
              :page-size="discussionPageSize"
              @load-up="loadGapFromBottom()"
              @load-down="loadGapFromTop()"
            />
          </template>

          <!-- Infinite scroll sentinel (threaded mode) - infinite loading only -->
          <div v-if="!usePagination" ref="bottomSentinelThreadedEl" />

          <!-- Load more (threaded mode) - infinite loading only, explicit fallback -->
          <DiscussionLoadMore
            v-if="!usePagination && hasMore"
            :loading="loadingMore"
            @load="loadMore()"
          />

          <!-- Traditional pagination (threaded mode) - paginated loading -->
          <Flex x-center expand y-center class="mb-l discussion__pagination">
            <Pagination
              v-if="usePagination && (hasMore || currentPage > 1)"
              :pagination="paginate(paginationTotal, currentPage, discussionPageSize)"
              @change="goToPage($event)"
            />
          </Flex>
        </div>

        <!-- Pending replies banner - forum model: sits below comments (newest appended at bottom) -->
        <DiscussionPendingBanner
          v-if="realtime.pendingReplyCount.value > 0"
          model="forum"
          :count="realtime.pendingReplyCount.value"
          :loading="realtime.pendingLoading.value"
          @load="realtime.loadPendingReplies()"
        />

        <!-- Forum model: input at bottom -->
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

        <!-- Timeline scrubber: sits just outside the right edge of the reply area -->
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
    // Compact the switch so it fits neatly in the bar
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
      // The persistent audio mini-player floats over the bottom of the viewport,
      // right where this sticky input sits. While it's docked it publishes its
      // height as --audio-dock-height; reserve that so the player stops covering
      // the input. The solid part of the background below fills the gap so the
      // player sits over it cleanly. 0 when nothing's playing.
      padding-bottom: var(--audio-dock-height, 0px);
      background: linear-gradient(to bottom, transparent, var(--color-bg) var(--space-s));

      // Keep the replying-to alert visually consistent when floating
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
