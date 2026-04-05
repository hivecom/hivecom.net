<script setup lang="ts">
import type { ValidationError } from '@dolanske/v-valid'
import type { Comment, DiscussionSettings, RawComment, ThreadNode } from './Discussion.types'
import type { Tables } from '@/types/database.overrides'
import { $withLabel, defineRules, maxLength, minLenNoSpace, required, useValidation } from '@dolanske/v-valid'
import { Alert, Skeleton } from '@dolanske/vui'
import { useDataDiscussionReplies } from '@/composables/useDataDiscussionReplies'
import { useBulkDataUser, useDataUser } from '@/composables/useDataUser'
import { useDiscussionCache } from '@/composables/useDiscussionCache'
import { useRealtimeDiscussion } from '@/composables/useRealtimeDiscussion'
import { wrapInBlockquote } from '@/lib/markdownProcessors'
import { scrollToId, waitForLayoutStability } from '@/lib/utils/common'
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
  loadGap,
  navigateToComment,
  navigateToDate,
  loadChildren,
  fetchedPinnedReply,
  toggleOfftopic,
  deleteComment: deleteCommentFromList,
  forceDeleteComment: forceDeleteCommentFromList,
  offtopicCount,
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
  scrollToId(`#comment-${pinned.id}`, 'center')
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

const navigateToDateLoading = ref(false)
const navigating = ref(false)
const replyAreaEl = ref<HTMLElement | null>(null)
const bottomSentinelEl = ref<HTMLElement | null>(null)
const bottomSentinelThreadedEl = ref<HTMLElement | null>(null)
const currentScrollFraction = ref<number | null>(null)

// Infinite scroll: auto-load the next page when the sentinel enters the viewport.
useIntersectionObserver(bottomSentinelEl, ([entry]) => {
  if (entry?.isIntersecting && hasMore.value && !loadingMore.value) {
    void loadMore()
  }
}, { rootMargin: '0px 0px 300px 0px' })

useIntersectionObserver(bottomSentinelThreadedEl, ([entry]) => {
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
  const sentinel = viewMode.value === 'threaded' ? bottomSentinelThreadedEl.value : bottomSentinelEl.value
  if (!sentinel)
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

const showTimeline = computed(() => {
  if (props.model !== 'forum')
    return false
  if (viewMode.value !== 'flat')
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

interface TimelineBucket {
  bucketStart: string
  replyCount: number
}

const timelineBuckets = ref<TimelineBucket[]>([])

// Fetch activity buckets once the timeline becomes visible.
watch(showTimeline, async (visible) => {
  if (!visible || !discussion.value)
    return

  const { data } = await (supabase.rpc as unknown as (fn: string, args: Record<string, unknown>) => ReturnType<typeof supabase.rpc>)(
    'get_discussion_reply_activity_buckets',
    {
      p_discussion_id: discussion.value.id,
      p_bucket_size: timelineBucketInterval.value,
      p_hash: props.hash ?? null,
      p_root_only: false,
    },
  )
  const rows = data as Array<{ bucket_start: string, reply_count: number }> | null
  if (rows != null) {
    timelineBuckets.value = rows.map(r => ({ bucketStart: r.bucket_start, replyCount: r.reply_count }))
  }
}, { immediate: true })

function updateScrollFraction() {
  if (replyAreaEl.value == null || !discussion.value)
    return

  const startMs = new Date(discussion.value.created_at).getTime()
  const endMs = new Date(discussion.value.last_activity_at).getTime()
  if (endMs === startMs)
    return

  const NAVBAR_OFFSET = 148
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
    const replyId = await navigateToDate(date)
    if (replyId != null) {
      await nextTick()
      requestAnimationFrame(() => scrollToId(`#comment-${replyId}`, 'start'))
    }
  }
  finally {
    navigateToDateLoading.value = false
    // Keep the dim until after scroll animation settles.
    setTimeout(() => {
      navigating.value = false
    }, 350)
  }
}

function handleTimelineNavigateToStart() {
  window.scrollTo({ top: 0, behavior: 'smooth' })
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

async function deleteComment(id: string) {
  return deleteCommentFromList(id)
}

async function forceDeleteComment(id: string) {
  return forceDeleteCommentFromList(id)
}

provide(DISCUSSION_KEYS.deleteComment, deleteComment)
provide(DISCUSSION_KEYS.forceDeleteComment, forceDeleteComment)

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
  <!-- <ClientOnly> -->
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
        @update:view-mode="handleViewModeUpdate"
        @update:show-offtopic="handleShowOfftopicUpdate"
        @go-to-pinned="handleGoToPinnedReply"
      />

      <!-- Pending banner for comment model: sits between toolbar and comments -->
      <div
        v-if="realtime.pendingReplyCount.value > 0 && props.model === 'comment'"
        class="discussion__pending-banner"
        @click="!realtime.pendingLoading.value && realtime.loadPendingReplies()"
      >
        <button :disabled="realtime.pendingLoading.value">
          <Icon name="ph:arrow-up" :size="12" />
          Click to load {{ realtime.pendingReplyCount.value }} new {{ realtime.pendingReplyCount.value === 1 ? 'comment' : 'comments' }}
          <Icon name="ph:arrow-up" :size="12" />
        </button>
      </div>

      <!-- Reply area: position:relative so the timeline's absolute top aligns with the first card -->
      <div
        ref="replyAreaEl"
        class="discussion__reply-area"
        :class="{ 'discussion__reply-area--navigating': navigating }"
      >
        <!-- Pinned - if a comment is set as pinned, it's duplicated and listed up above everything else -->
        <DiscussionItem
          v-if="pinnedComment"
          :class="props.model === 'forum' ? 'mb-xl' : 'mb-m'"
          :data="pinnedComment"
          :model="props.model"
        />

        <!-- Flat view: all comments chronologically with inline reply previews -->
        <!-- v-show (not v-if) keeps items mounted across mode switches so MarkdownRenderer -->
        <!-- never re-suspends and the skeleton/fade-in flash doesn't appear. -->
        <div v-show="viewMode === 'flat' && modelledComments.length > 0">
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
            <!-- Gap banner: appears after the last item of the early block -->
            <div
              v-if="gap != null && comment.id === gap.afterId"
              class="discussion__gap-banner"
              @click="!loadingGap && loadGap()"
            >
              <button :disabled="loadingGap" class="text-color-accent">
                Load {{ gap.count }} {{ gap.count === 1 ? 'reply' : 'replies' }} between
              </button>
            </div>
          </template>

          <!-- Infinite scroll sentinel (flat mode) -->
          <div ref="bottomSentinelEl" />

          <!-- Load more (flat mode) - kept as explicit fallback / status strip -->
          <div
            v-if="hasMore"
            class="discussion__load-more"
            @click="!loadingMore && loadMore()"
          >
            <button :disabled="loadingMore">
              <Icon name="ph:arrow-down" :size="12" />
              {{ remainingCount > 0 ? `${remainingCount} more ${remainingCount === 1 ? 'reply' : 'replies'}` : 'Load more' }}
              <Icon name="ph:arrow-down" :size="12" />
            </button>
          </div>
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
            <div
              v-if="gap != null && node.comment.id === gap.afterId"
              class="discussion__gap-banner"
              @click="!loadingGap && loadGap()"
            >
              <button :disabled="loadingGap">
                <Icon name="ph:dots-three" :size="12" />
                Load {{ gap.count }} {{ gap.count === 1 ? 'reply' : 'replies' }} between
                <Icon name="ph:dots-three" :size="12" />
              </button>
            </div>
          </template>

          <!-- Infinite scroll sentinel (threaded mode) -->
          <div ref="bottomSentinelThreadedEl" />

          <!-- Load more (threaded mode) - explicit fallback -->
          <div
            v-if="hasMore"
            class="discussion__load-more"
            @click="!loadingMore && loadMore()"
          >
            <button :disabled="loadingMore">
              <Icon name="ph:arrow-down" :size="12" />
              Load more
              <Icon name="ph:arrow-down" :size="12" />
            </button>
          </div>
        </div>

        <!-- Pending replies banner - forum model: sits below comments (newest appended at bottom) -->
        <div
          v-if="realtime.pendingReplyCount.value > 0 && props.model === 'forum'"
          class="discussion__pending-banner"
          @click="!realtime.pendingLoading.value && realtime.loadPendingReplies()"
        >
          <button :disabled="realtime.pendingLoading.value">
            <Icon name="ph:arrow-down" :size="12" />
            Click to load {{ realtime.pendingReplyCount.value }} new {{ realtime.pendingReplyCount.value === 1 ? 'reply' : 'replies' }}
            <Icon name="ph:arrow-down" :size="12" />
          </button>
        </div>

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
          v-if="showTimeline && timelineStart !== '' && timelineEnd !== ''"
          :start="timelineStart"
          :end="timelineEnd"
          :buckets="timelineBuckets"
          :bucket-interval-ms="timelineBucketIntervalMs"
          :current-fraction="currentScrollFraction"
          :loading="navigateToDateLoading"
          @navigate="handleTimelineNavigate"
          @navigate-to-start="handleTimelineNavigateToStart"
        />
      </div>
    </template>
  </div>
  <!-- </ClientOnly> -->
</template>

<style scoped lang="scss">
.discussion {
  &__gap-banner,
  &__load-more {
    width: 100%;
    position: relative;
    display: flex;
    justify-content: center;
    margin-block: var(--space-s);
    cursor: pointer;

    &:before {
      content: '';
      display: block;
      position: absolute;
      top: 50%;
      transform: translateY(-50%);
      left: 0;
      right: 0;
      border-bottom: 1px solid var(--color-border-strong);
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
      color: var(--color-text-lighter);
      cursor: pointer;
      transition: color var(--transition);

      &:hover:not(:disabled) {
        color: var(--color-text);
      }

      &:disabled {
        opacity: 0.5;
        cursor: default;
      }
    }
  }

  &__pending-banner {
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
      border-bottom: 1px solid var(--color-accent);
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
      color: var(--color-accent);
      cursor: pointer;
      transition: color var(--transition);

      &:disabled {
        opacity: 0.5;
        cursor: default;
      }
    }
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
