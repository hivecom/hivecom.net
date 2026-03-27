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

// ── Comment data ──────────────────────────────────────────────────────────────

const {
  loading,
  error,
  modelledComments,
  threadNodeMap,
  threadRoots,
  toggleOfftopic,
  deleteComment: deleteCommentFromList,
  offtopicCount,
} = useDataDiscussionReplies(
  {
    id: props.id,
    type: props.type,
    model: props.model,
    hash: props.hash,
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

const pinnedComment = computed(() => modelledComments.value.find((comment, index) => comment.id === discussion.value?.pinned_reply_id && index > 0))

// ── View settings ─────────────────────────────────────────────────────────────

const { settings } = useDataUserSettings()

type ViewMode = 'flat' | 'threaded'
const viewMode = ref<ViewMode>(settings.value.discussion_view_mode ?? 'flat')
watch(() => settings.value.discussion_view_mode, (val) => {
  viewMode.value = val ?? 'flat'
})

function handleViewModeUpdate(val: ViewMode) {
  viewMode.value = val
  settings.value.discussion_view_mode = val
}

const showOfftopic = ref(settings.value.show_offtopic_replies ?? false)
const showThreadReplies = ref(settings.value.show_thread_replies ?? false)

const pinnedReply = computed(() => {
  const pinnedId = discussion.value?.pinned_reply_id
  if (!pinnedId)
    return null
  return comments.value.find(comment => comment.id === pinnedId) ?? null
})

async function handleGoToPinnedReply() {
  const pinned = pinnedReply.value
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
const hasManuallySwitched = ref(false)
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

provide(DISCUSSION_KEYS.deleteComment, deleteComment)

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

      <!-- Pinned - if a comment is set as pinned, it's duplicated and listed up above everything else -->
      <DiscussionItem
        v-if="pinnedComment"
        :class="props.model === 'forum' ? 'my-xl' : 'my-s'"
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
        </template>
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
        </template>
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
    </template>
  </div>
  <!-- </ClientOnly> -->
</template>

<style scoped lang="scss">
.discussion {
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
