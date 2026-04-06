<script setup lang="ts">
import type { ValidationError } from '@dolanske/v-valid'
import type { ComponentExposed } from 'vue-component-type-helpers'
import type { Comment, DiscussionSettings, RawComment, ThreadNode } from './Discussion.types'
import type { TimelineBucket } from './DiscussionTimeline.vue'
import type { Tables } from '@/types/database.overrides'
import { $withLabel, defineRules, maxLength, minLenNoSpace, required, useValidation } from '@dolanske/v-valid'
import { Alert, Skeleton } from '@dolanske/vui'
import { useDataDiscussionReplies } from '@/composables/useDataDiscussionReplies'
import { useBulkDataUser, useDataUser } from '@/composables/useDataUser'
import { useDiscussionCache } from '@/composables/useDiscussionCache'
import { useRealtimeDiscussion } from '@/composables/useRealtimeDiscussion'
import { wrapInBlockquote } from '@/lib/markdownProcessors'
import { scrollToId, scrollToIdWhenStable, waitForLayoutStability } from '@/lib/utils/common'
import { normalizeTipTapOutput } from '@/lib/utils/formatting'
import { DISCUSSION_KEYS } from './Discussion.keys'
import DiscussionItem from './DiscussionItem.vue'
import DiscussionReplyInput from './DiscussionReplyInput.vue'
import DiscussionTimeline from './DiscussionTimeline.vue'
import DiscussionToolbar from './DiscussionToolbar.vue'

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

const { user: currentUserData } = useDataUser(userId, { includeRole: true })
const canBypassLock = computed(() => {
  const role = currentUserData.value?.role
  return role === 'admin' || role === 'moderator'
})

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

const realtime = useRealtimeDiscussion(comments, discussion, modelRef)

// ── View settings (declared before composable - viewMode is passed to useDataDiscussionReplies) ──

const { settings } = useDataUserSettings()
type ViewMode = 'flat' | 'threaded'
const viewMode = ref<ViewMode>(settings.value.discussion_view_mode ?? 'flat')
watch(() => settings.value.discussion_view_mode, (val) => {
  viewMode.value = val ?? 'flat'
})

// ── Comment data ──────────────────────────────────────────────────────────────

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
  loadMore,
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
} = useDataDiscussionReplies(
  {
    id: props.id,
    type: props.type,
    model: props.model,
    hash: props.hash,
    viewMode,
  },
  comments,
  discussion,
  userId,
  (discussionId: string) => {
    realtime.subscribe(discussionId)
    realtime.pendingReplyCount.value = 0
  },
  (deletedId: string) => {
    // Clear replyingTo if the deleted comment was being quoted
    if (replyingTo.value?.id === deletedId) {
      replyingTo.value = undefined
    }
  },
)

provide(DISCUSSION_KEYS.loadChildren, loadChildren)
provide(DISCUSSION_KEYS.replyCountMap, replyCountMap)

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

// If the URL targets a specific comment, ensure it's visible even if it's
// off-topic. We watch modelledComments so this fires once data has loaded -
// the query param is already there on mount but comments may not be yet.
const linkedCommentId = Array.isArray(route.query.comment) ? route.query.comment[0] : route.query.comment
if (linkedCommentId) {
  // Wait until the discussion is loaded (discussion.value is set), then
  // use navigateToComment to load whichever page contains the deep-linked
  // reply. Once loaded, reveal it even if it's off-topic.
  const unwatch = watch(discussion, async (disc) => {
    if (disc == null)
      return

    unwatch()

    const found = await navigateToComment(linkedCommentId)
    if (!found)
      return

    const target = modelledComments.value.find(c => c.id === linkedCommentId)
    if (target?.is_offtopic && !showOfftopic.value) {
      showOfftopic.value = true
      hasManuallySwitched.value = true
    }
  }, { immediate: true })
}

async function handleGoToPinnedReply() {
  const pinned = fetchedPinnedReply.value
  if (!pinned)
    return

  if (pinned.is_offtopic && !showOfftopic.value)
    showOfftopic.value = true

  router.replace({ query: { ...route.query, comment: pinned.id } })
  await nextTick()
  await waitForLayoutStability()
  scrollToId(`#comment-${pinned.id}`, 'center', true)
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
const offtopicBannerAfterIds = computed((): Set<string> => {
  if (showOfftopic.value || offtopicCount.value === 0)
    return new Set()
  const ids = new Set<string>()
  const list = modelledComments.value
  for (let i = 0; i < list.length - 1; i++) {
    const curr = list[i]!
    const next = list[i + 1]!
    // Insert banner after a visible comment that is immediately followed by an offtopic one
    if (!curr.is_offtopic && next.is_offtopic) {
      ids.add(curr.id)
    }
  }
  // Also handle the case where offtopic replies are at the very start (no preceding visible comment)
  // - we use a sentinel empty-string key checked separately in the template
  return ids
})

/** True when the first loaded comment is already offtopic (banner goes before everything) */
const offtopicBannerAtStart = computed((): boolean => {
  if (showOfftopic.value || offtopicCount.value === 0)
    return false
  const first = modelledComments.value[0]
  return first != null && first.is_offtopic
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
const replyAreaEl = ref<HTMLElement | null>(null)
const bottomSentinelEl = ref<HTMLElement | null>(null)
const bottomSentinelThreadedEl = ref<HTMLElement | null>(null)
const activeSentinel = computed(() =>
  viewMode.value === 'threaded' ? bottomSentinelThreadedEl.value : bottomSentinelEl.value,
)
const currentScrollFraction = ref<number | null>(null)

// Infinite scroll: auto-load the next page when the sentinel enters the viewport.
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

/**
 * Show the timeline scrubber when:
 * - forum model (ascending, replies grow at the bottom)
 * - discussion spans at least 24 hours
 * - discussion has more than a page-worth of replies (worth navigating)
 */
const timelineSpanMs = computed(() => {
  const d = discussion.value
  if (d == null)
    return 0
  return new Date(d.last_activity_at).getTime() - new Date(d.created_at).getTime()
})

const timelineRef = ref<ComponentExposed<typeof DiscussionTimeline> | null>(null)

const showTimeline = computed(() => {
  if (props.model !== 'forum')
    return false
  const d = discussion.value
  if (d == null)
    return false
  return timelineSpanMs.value >= 24 * 60 * 60 * 1000
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
        // When there are no more pages after the tail block, the gap is the only
        // unloaded region - cap the dashed zone at the first tail-block reply so
        // the timeline accurately reflects what is loaded vs. what isn't.
        // When hasMore is still true the tail end does not equal the discussion
        // end, so we conservatively extend the dashed region all the way to end.
        if (!hasMore.value) {
          const firstTailComment = list[afterIdx + 1]
          if (firstTailComment != null)
            return { start: afterComment.created_at, end: firstTailComment.created_at }
        }
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

function updateScrollFraction() {
  if (replyAreaEl.value == null || !discussion.value)
    return

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
  const atBottom = !navigating.value
    && window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 4
  if (atBottom) {
    currentScrollFraction.value = 1
    return
  }

  const replyAreaRect = replyAreaEl.value.getBoundingClientRect()

  // If the reply area top is still below the navbar, we're above the replies - pin to 0.
  if (replyAreaRect.top > NAVBAR_OFFSET) {
    currentScrollFraction.value = 0
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
    // Tail zone: all comments scrolled above - use scroll-based fraction.
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
      await scrollToIdWhenStable(`#comment-${replyId}`, 'start', 3000, 150)
    }
  }
  finally {
    // Clear loading *after* the scroll call so the dim stays up until the
    // target is actually in view - not while waitForImages is still running.
    navigateToDateLoading.value = false
    setTimeout(() => {
      navigating.value = false
    }, 350)
  }
}

function handleTimelineNavigateToStart() {
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

async function handleTimelineNavigateToEnd() {
  if (!timelineEnd.value || navigateToDateLoading.value)
    return
  navigateToDateLoading.value = true
  navigating.value = true
  try {
    // Floor semantics: navigate to the last reply at or before the discussion end.
    const replyId = await navigateToDate(new Date(timelineEnd.value), { findFirst: false })
    if (replyId != null) {
      const target = modelledComments.value.find(c => c.id === replyId)
      if (target?.is_offtopic && !showOfftopic.value) {
        showOfftopic.value = true
        hasManuallySwitched.value = true
      }
      await nextTick()
      await waitForLayoutStability(5000)
      // Snap to the very bottom so the final reply is fully visible.
      window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' })
    }
  }
  finally {
    navigateToDateLoading.value = false
    setTimeout(() => {
      navigating.value = false
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

const textareaRef = useTemplateRef<{ focus: () => void }>('textarea')

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
    $withLabel('You cannot send an empty string', required),
    $withLabel('You cannot send an empty string', minLenNoSpace(1)),
    $withLabel(`Your comment cannot exceed ${MAX_COMMENT_CHARS} characters`, maxLength(MAX_COMMENT_CHARS)),
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
        }
        // The realtime subscription will fire for our own post too - pre-emptively
        // bump latestCommentTime by ensuring the new reply is in the list before
        // the INSERT event arrives, which is guaranteed since we already pushed it.
        // Notify parent so the forum unread state can be updated, preventing
        // a spurious activity indicator when the user was the last poster.
        emit('replySubmitted', comments.value.length, discussion.value.id)
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
</script>

<template>
  <div class="discussion" :class="[`discussion--${props.model}`]">
    <template v-if="loading">
      <Skeleton height="128px" width="auto" />
    </template>

    <template v-else-if="error">
      <Alert variant="danger" filled>
        <p>Failed to load discussion</p>
        <p class="text-color-lighter text-size-s">
          {{ error }}
        </p>
      </Alert>
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

      <!-- Toolbar: view mode selector + off-topic toggle -->
      <DiscussionToolbar
        :view-mode="viewMode"
        :has-comments="modelledComments.length > 0"
        :offtopic-count="offtopicCount"
        :show-offtopic="showOfftopic"
        :show-timeline-button="showTimeline"
        @update:view-mode="handleViewModeUpdate"
        @update:show-offtopic="handleShowOfftopicUpdate"
        @go-to-pinned="handleGoToPinnedReply"
        @open-timeline="timelineRef?.openJumpModal()"
        @go-to-end="handleTimelineNavigateToEnd"
      />

      <!-- Pending banner for comment model: sits between toolbar and comments -->
      <DiscussionPendingBanner
        v-if="realtime.pendingReplyCount.value > 0"
        model="comment"
        :count="realtime.pendingReplyCount.value"
        :loading="realtime.pendingLoading.value"
        @load="realtime.loadPendingReplies()"
      />

      <!-- Reply area: position:relative so the timeline's absolute top aligns with the first card -->
      <div
        ref="replyAreaEl"
        class="discussion__reply-area"
        :class="{ 'discussion__reply-area--navigating': navigating }"
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
          <div
            v-if="offtopicBannerAtStart"
            class="discussion__offtopic-banner"
            @click="handleShowOfftopicUpdate(true)"
          >
            <button>
              {{ offtopicCount }} off-topic {{ offtopicCount === 1 ? 'reply' : 'replies' }} hidden
            </button>
          </div>
          <template v-for="(comment, index) in modelledComments" :key="comment.id">
            <DiscussionItem
              v-if="isCommentVisible(comment)"
              :data="comment"
              :model="props.model"
              :thread-node="threadNodeMap.get(comment.id)"
              :show-offtopic="showOfftopic"
              :show-thread-replies="showThreadReplies"
              :stagger-index="Math.min(index, 10)"
            />
            <!-- Offtopic banner: appears after the last visible comment before a hidden offtopic run -->
            <div
              v-if="offtopicBannerAfterIds.has(comment.id)"
              class="discussion__offtopic-banner"
              @click="handleShowOfftopicUpdate(true)"
            >
              <button>
                {{ offtopicCount }} off-topic {{ offtopicCount === 1 ? 'reply' : 'replies' }} hidden
              </button>
            </div>
            <!-- Gap banner: appears after the last item of the early block -->
            <DiscussionGapBanner
              v-if="gap != null && comment.id === gap.afterId"
              :count="gap.count"
              :loading="loadingGap"
              @load-up="loadGapFromBottom()"
              @load-down="loadGapFromTop()"
            />
          </template>

          <!-- Infinite scroll sentinel (flat mode) -->
          <div ref="bottomSentinelEl" />

          <!-- Load more (flat mode) - kept as explicit fallback / status strip -->
          <DiscussionLoadMore
            v-if="hasMore"
            :loading="loadingMore"
            :remaining-count="remainingCount"
            @load="loadMore()"
          />
        </div>

        <!-- Threaded view: only roots rendered, children nest recursively -->
        <div v-show="viewMode === 'threaded' && threadRoots.length > 0">
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
            <!-- Gap banner (threaded mode - roots only pagination) -->
            <DiscussionGapBanner
              v-if="gap != null && node.comment.id === gap.afterId"
              :count="gap.count"
              :loading="loadingGap"
              @load-up="loadGapFromBottom()"
              @load-down="loadGapFromTop()"
            />
          </template>

          <!-- Infinite scroll sentinel (threaded mode) -->
          <div ref="bottomSentinelThreadedEl" />

          <!-- Load more (threaded mode) - explicit fallback -->
          <DiscussionLoadMore
            v-if="hasMore"
            :loading="loadingMore"
            @load="loadMore()"
          />
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

  &__offtopic-banner {
    width: 100%;
    position: relative;
    display: flex;
    justify-content: center;
    margin-bottom: var(--space-s);
    cursor: pointer;

    &:before {
      content: '';
      display: block;
      position: absolute;
      top: 50%;
      transform: translateY(-50%);
      left: 0;
      right: 0;
      border-bottom: 1px dashed var(--color-text-yellow);
      opacity: 0.5;
      z-index: 1;
      transition: opacity var(--transition);
    }

    &:hover:before {
      opacity: 1;
    }

    button {
      position: relative;
      z-index: 3;
      display: flex;
      align-items: center;
      gap: var(--space-xs);
      padding: 0 var(--space-s);
      border: none;
      background-color: var(--color-bg);
      font-size: var(--font-size-xs);
      color: var(--color-text-yellow);
      cursor: pointer;
      transition: color var(--transition);
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
