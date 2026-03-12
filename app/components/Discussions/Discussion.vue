<script setup lang="ts">
import type { Tables } from '@/types/database.overrides'
import { $withLabel, defineRules, maxLength, minLenNoSpace, required, useValidation } from '@dolanske/v-valid'
import { Alert, Button, ButtonGroup, Flex, Skeleton, Tooltip } from '@dolanske/vui'
import { wrapInBlockquote } from '@/lib/markdownProcessors'
import { FORUMS_BUCKET_ID } from '@/lib/storageAssets'
import { normalizeErrors, normalizeTipTapOutput } from '@/lib/utils/formatting'
import RichTextEditor from '../Editor/RichTextEditor.vue'
import MarkdownPreview from '../Shared/MarkdownPreview.vue'
import UserName from '../Shared/UserName.vue'
import DiscussionItem from './DiscussionItem.vue'

/**
 * NOTE
 *
 * Important note (@dolanske)
 *
 * For clarity during implementation, this component calls reply a 'comment' and
 * if a comment is replying to another one, it is saved to it as a 'reply'
 */

// Settings which will be provided to all components within a Discussion
export interface DiscussionSettings {
  /**
   * If set to true, comments will display a timestamp
   */
  timestamps: boolean
}

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
   * Specify how many rows should the input textarea render
   */
  inputRows?: number
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
  inputRows: 3,
  placeholder: 'Leave your comment...',
})

const emit = defineEmits<{
  replySubmitted: [newReplyCount: number]
}>()

const MAX_COMMENT_CHARS = 8192

// If user isn't signed in, do not allow commenting
const userId = useUserId()

// Check if the current user is an admin or moderator (can bypass discussion locks)
const { user: currentUserData } = useCacheUserData(userId, { includeRole: true })
const canBypassLock = computed(() => {
  const role = currentUserData.value?.role
  return role === 'admin' || role === 'moderator'
})

export type RawComment = Omit<Tables<'discussion_replies'>, 'meta'> & { meta: never }
export interface Comment extends RawComment {
  reply: RawComment | null
}

/**
 * A thread node is a comment plus its direct children (also thread nodes),
 * used to render the tree-view structure.
 */
export interface ThreadNode {
  comment: Comment
  children: ThreadNode[]
}

export type ProvidedDiscussion = Ref<Tables<'discussions'> | undefined>

// Fetch data & state
const supabase = useSupabaseClient()

const loading = ref(false)
const error = ref<string>()

const discussion = ref<Tables<'discussions'>>()
const comments = ref<RawComment[]>([])

// ── View mode ─────────────────────────────────────────────────────────────────
// Per-session toggle: defaults to the user's saved setting.
const { settings } = useUserSettings()

type ViewMode = 'flat' | 'threaded'
const viewMode = ref<ViewMode>(settings.value.discussion_view_mode ?? 'flat')
watch(() => settings.value.discussion_view_mode, (val) => {
  viewMode.value = val ?? 'flat'
})

// ── Off-topic toggle ──────────────────────────────────────────────────────────
const showOfftopic = ref(settings.value.show_offtopic_replies ?? false)
const showThreadReplies = ref(settings.value.show_thread_replies ?? false)

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

function toggleShowOfftopic() {
  hasManuallySwitched.value = true
  showOfftopic.value = !showOfftopic.value
}

// Whether the current user is the discussion author (OP)
const isDiscussionAuthor = computed(() =>
  !!userId.value && !!discussion.value && discussion.value.created_by === userId.value,
)

// Can mark replies as off-topic
const canMarkOfftopic = computed(() => isDiscussionAuthor.value || canBypassLock.value)

// Provide context to all descendant components
provide('showOfftopic', showOfftopic)
provide('canMarkOfftopic', canMarkOfftopic)
provide('showThreadReplies', showThreadReplies)
provide('viewMode', viewMode)

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

provide<DiscussionSettings>('discussion-settings', {
  timestamps: props.timestamps,
})

provide<ProvidedDiscussion>('discussion', discussion)
provide('canBypassLock', canBypassLock)

// ── Data loading ──────────────────────────────────────────────────────────────
watch(() => props.id, async () => {
  loading.value = true

  // Query discussion metadata
  const discussionQuery = supabase
    .from('discussions')
    .select('*')

  if (props.type === 'discussion') {
    discussionQuery.eq('id', props.id)
  }
  else {
    discussionQuery.eq(`${props.type}_id`, props.id)
  }

  const discussionResponse = await discussionQuery.maybeSingle()

  if (discussionResponse.error) {
    loading.value = false
    return error.value = discussionResponse.error.message
  }

  if (!discussionResponse.data) {
    loading.value = false
    comments.value = []
    return
  }

  discussion.value = discussionResponse.data

  // Bump subscription last_seen_at and mark notification read
  void markDiscussionSeen(discussionResponse.data.id)

  // Query comments under a discussion
  const commentQuery = supabase
    .from('discussion_replies')
    .select('*')
    .eq('discussion_id', discussionResponse.data.id)

  // Optionally return answer under a specific hash
  if (props.hash) {
    commentQuery.eq('meta->>hash', props.hash)
  }

  const commentsResponse = await commentQuery.order('created_at')

  if (commentsResponse.error) {
    loading.value = false
    return error.value = commentsResponse.error?.message
  }
  else {
    comments.value = commentsResponse.data
  }

  loading.value = false
}, { immediate: true })

/**
 * Bump `last_seen_at` on the user's subscription (if any) and mark the
 * corresponding discussion-reply notification as read so the badge clears.
 *
 * Fire-and-forget - failures here should never block the discussion from
 * rendering.
 */
async function markDiscussionSeen(discussionId: string) {
  if (!userId.value)
    return

  await Promise.allSettled([
    // 1. Bump last_seen_at on the subscription row (if the user is subscribed)
    supabase
      .from('discussion_subscriptions')
      .update({ last_seen_at: new Date().toISOString() })
      .eq('user_id', userId.value)
      .eq('discussion_id', discussionId),

    // 2. Mark the notification as read (source = 'discussion_reply', source_id = discussionId)
    supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', userId.value)
      .eq('source', 'discussion_reply')
      .eq('source_id', discussionId)
      .eq('is_read', false),
  ])
}

// ── Comment modelling ─────────────────────────────────────────────────────────
/**
 * Flat list of comments with their `reply` object resolved.
 */
const modelledComments = computed((): Comment[] => {
  const data = comments.value ?? []

  const lookup = new Map<string | number, RawComment>(
    data.map(item => [item.id, item]),
  )

  return data.map((item): Comment => {
    const foundReply = item.reply_to_id
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
 * Used both for threaded view roots and for flat-mode inline previews.
 */
const threadNodeMap = computed((): Map<string, ThreadNode> => {
  const data = modelledComments.value
  const lookup = new Map<string, Comment>(data.map(c => [c.id, c]))
  const nodeMap = new Map<string, ThreadNode>(
    data.map(c => [c.id, { comment: c, children: [] }]),
  )

  for (const comment of data) {
    if (comment.reply_to_id && lookup.has(comment.reply_to_id)) {
      nodeMap.get(comment.reply_to_id)!.children.push(nodeMap.get(comment.id)!)
    }
  }

  return nodeMap
})

/**
 * Top-level thread roots for threaded view - only comments that are not a
 * child of another comment in this discussion. Orphaned replies (parent
 * deleted) are also treated as roots so nothing is silently hidden.
 */
const threadRoots = computed((): ThreadNode[] => {
  const data = modelledComments.value
  const lookup = new Map<string, Comment>(data.map(c => [c.id, c]))
  return data
    .filter(c => !c.reply_to_id || !lookup.has(c.reply_to_id))
    .map(c => threadNodeMap.value.get(c.id)!)
})

// ── Off-topic toggle action ───────────────────────────────────────────────────
async function toggleOfftopic(comment: Comment) {
  const nextValue = !comment.is_offtopic

  const { error: updateError } = await supabase
    .from('discussion_replies')
    .update({ is_offtopic: nextValue })
    .eq('id', comment.id)

  if (updateError)
    return

  // Optimistically cascade in the local list: mark all descendants too.
  const descendantIds = collectDescendantIds(comment.id)
  for (const c of comments.value) {
    if (c.id === comment.id || descendantIds.has(c.id)) {
      c.is_offtopic = nextValue
    }
  }
}

/** Collect all ids that are descendants of `parentId` in the flat list. */
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

provide('toggleOfftopic', toggleOfftopic)

// ── Comment writing & validation ──────────────────────────────────────────────
const formLoading = ref(false)

const form = reactive({
  message: '',
  is_nsfw: false,
})

// Holds reference to the comment we're replying to
const replyingTo = ref<Comment>()

// To avoid prop drilling, expose this to all child components
provide('setReplyToComment', (comment: Comment) => replyingTo.value = comment)

const textareaRef = useTemplateRef('textarea')

function focusTextarea() {
  if (textareaRef.value)
    textareaRef.value.focus()
}

// Auto focus textarea whenever replying is active
watch(replyingTo, focusTextarea)

// Quoting - if a quote is requested, the full original markdown as a quote at
// the beginning. Users can then trim the quote or keep it as it is
provide('setQuoteOfComment', (comment: Comment) => {
  // Use the @{uuid} mention format so TipTap parses it as a real mention node.
  // The editor's hydrateMentionLabels will resolve the UUID to a display name.
  const quoted = wrapInBlockquote(`@{${comment.created_by}} said\n\n${comment.markdown}`)

  // Append to existing content so multiple quotes can be added
  form.message = form.message.length > 0
    ? `${form.message}\n\n${quoted}`
    : quoted

  focusTextarea()
})

// Define form rules
const rules = defineRules<typeof form>({
  message: [
    $withLabel('You cannot send an empty string', required),
    $withLabel('You cannot send an empty string', minLenNoSpace(1)),
    $withLabel(`Your comment cannot exceed ${MAX_COMMENT_CHARS} characters`, maxLength(MAX_COMMENT_CHARS)),
  ],
})

// Use validation composable
const { validate, errors, addError, reset } = useValidation(form, rules, {
  // Clear errors
  autoclear: true,
})

async function ensureDiscussion() {
  if (discussion.value || props.type === 'discussion')
    return

  const discussionKey = `${props.type}_id`
  const { data: created, error: createError } = await supabase
    .from('discussions')
    .insert({ [discussionKey]: props.id })
    .select()
    .single()

  if (createError) {
    const { data: existing, error: fetchError } = await supabase
      .from('discussions')
      .select('*')
      .eq(discussionKey, props.id)
      .maybeSingle()

    if (fetchError) {
      error.value = fetchError.message
      return
    }

    if (existing)
      discussion.value = existing

    return
  }

  discussion.value = created
}

async function submitReply() {
  if (formLoading.value)
    return

  formLoading.value = true

  validate()
    .then(async () => {
      if (!discussion.value) {
        await ensureDiscussion()
      }

      if (!discussion.value) {
        addError('message', {
          key: 'required',
          message: 'Unable to start discussion for this item.',
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

      // Form validation passed
      const res = await supabase
        .from('discussion_replies')
        .insert(commentData)
        .select()
        .single()

      if (res.error) {
        // If supabase errors out, add the error message to the first validation
        // key. It doesn't really matter under which key we show it as we
        // just render the error strings
        addError('message', {
          key: 'required',
          message: res.error.message,
        })
      }
      else {
        // Successfully submitted a comment
        reset()
        replyingTo.value = undefined
        form.message = ''
        form.is_nsfw = false
        comments.value.push(res.data as RawComment)
        // Notify parent so the forum unread state can be updated, preventing
        // a spurious activity indicator when the user was the last poster.
        emit('replySubmitted', comments.value.length)
      }

      formLoading.value = false
    })
    .catch(() => {
      formLoading.value = false
    })
}

function deleteComment(id: string) {
  return new Promise((resolve, reject) => {
    supabase
      .from('discussion_replies')
      .delete()
      .eq('id', id)
      .then((res) => {
        if (res.error) {
          reject(res.error.message)
        }
        else {
          // Remove from loaded comments
          comments.value = comments.value.filter(comment => comment.id !== id)

          // If the comment that was removed was also being replied to, remove it
          if (replyingTo.value && replyingTo.value.id === id) {
            replyingTo.value = undefined
          }

          // Resolve to end loading in comment model
          resolve(null)
        }
      })
  })
}

provide('delete-comment', deleteComment)

// ── Off-topic visibility helpers ──────────────────────────────────────────────
/**
 * Whether a given thread node (and thus its sub-tree) should be visible
 * at all.  A node is hidden when:
 *   - it is off-topic AND
 *   - the user has "show off-topic" toggled off
 */
function isCommentVisible(comment: Comment): boolean {
  if (!comment.is_offtopic)
    return true
  return showOfftopic.value
}

function isNodeVisible(node: ThreadNode): boolean {
  return isCommentVisible(node.comment)
}

/**
 * How many off-topic replies exist across all comments.
 */
const offtopicCount = computed(() =>
  comments.value.filter(c => c.is_offtopic).length,
)
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
      <!-- Toolbar: view mode selector + off-topic toggle -->
      <Flex y-center x-start gap="xs" class="mb-m">
        <!-- View mode segmented control -->
        <ButtonGroup size="s">
          <Button
            square
            :variant="viewMode === 'flat' ? 'fill' : 'gray'"
            :outline="viewMode !== 'flat'"
            size="s"

            @click="viewMode = 'flat'"
          >
            <Tooltip>
              <Icon :size="18" name="ph:square-split-vertical" />
              <template #tooltip>
                <p>Flat view - all replies in chronological order</p>
              </template>
            </Tooltip>
          </Button>
          <Button
            square
            :variant="viewMode === 'threaded' ? 'fill' : 'gray'"
            :outline="viewMode !== 'threaded'"
            size="s"
            @click="viewMode = 'threaded'"
          >
            <Tooltip>
              <Icon :size="18" name="ph:arrows-split" />
              <template #tooltip>
                <p>Threaded view - replies nested under their parent</p>
              </template>
            </Tooltip>
          </Button>
        </ButtonGroup>

        <!-- Off-topic toggle - only shown when relevant -->
        <Tooltip v-if="offtopicCount > 0">
          <Button
            size="s"
            :variant="showOfftopic ? 'fill' : 'gray'"
            :outline="!showOfftopic"
            class="discussion__offtopic-switch"
            @click="toggleShowOfftopic"
          >
            <template #start>
              <Icon :size="18" :name="showOfftopic ? 'ph:chat-centered-text' : 'ph:chat-centered-slash'" />
            </template>
            Off topic ({{ offtopicCount }})
          </Button>
          <template #tooltip>
            <p>{{ showOfftopic ? 'Hide off-topic replies' : 'Show off-topic replies' }}</p>
          </template>
        </Tooltip>
      </Flex>

      <!-- Flat view: all comments chronologically with inline reply previews -->
      <template v-if="viewMode === 'flat' && modelledComments.length > 0">
        <template v-for="comment in modelledComments" :key="comment.id">
          <DiscussionItem
            v-if="isCommentVisible(comment)"
            :data="comment"
            :model="props.model"
            :thread-node="threadNodeMap.get(comment.id)"
            :show-offtopic="showOfftopic"
            :show-thread-replies="showThreadReplies"
          />
        </template>
      </template>

      <!-- Threaded view: only roots rendered, children nest recursively -->
      <template v-else-if="viewMode === 'threaded' && threadRoots.length > 0">
        <template v-for="node in threadRoots" :key="node.comment.id">
          <DiscussionItem
            v-if="isNodeVisible(node)"
            :data="node.comment"
            :model="props.model"
            :children="node.children"
            :show-offtopic="showOfftopic"
            :depth="0"
          />
        </template>
      </template>

      <div v-if="props.hideInput !== true && userId" class="discussion__add">
        <Alert v-if="replyingTo">
          <Flex y-start gap="xl" x-between>
            <div>
              <span class="discussion__add--replying-label">Replying to
                <UserName size="s" :user-id="replyingTo!.created_by" />:
              </span>
              <MarkdownPreview :markdown="replyingTo.markdown" :max-length="240" />
            </div>
            <Tooltip>
              <Button square size="s" plain @click="replyingTo = undefined">
                <Icon name="ph:x" />
              </Button>
              <template #tooltip>
                <p>Remove attached reply</p>
              </template>
            </Tooltip>
          </Flex>
        </Alert>
        <div v-if="discussion?.is_archived">
          <Alert variant="warning">
            <template #icon>
              <Icon name="ph:archive" />
            </template>
            This discussion is archived
          </Alert>
        </div>
        <div v-else-if="discussion?.is_locked && !canBypassLock">
          <Alert variant="neutral">
            <template #icon>
              <Icon name="ph:lock" />
            </template>
            This discussion is locked
          </Alert>
        </div>
        <template v-else>
          <Alert v-if="discussion?.is_locked && canBypassLock" variant="warning">
            <template #icon>
              <Icon name="ph:lock" />
            </template>
            This discussion is locked. Only admins and moderators can post replies.
          </Alert>
          <RichTextEditor
            ref="textarea"
            v-model="form.message"
            v-model:nsfw="form.is_nsfw"
            min-height="64px"
            show-submit-options
            show-attachment-button
            :errors="normalizeErrors(errors.message)"
            :placeholder="replyingTo ? 'Write your reply here...' : props.placeholder"
            :media-context="discussion?.id ? `${discussion.id}/${userId}` : 'staging'"
            :media-bucket-id="FORUMS_BUCKET_ID"
            @submit="submitReply"
          />
        </template>
      </div>
      <div v-else-if="props.hideInput !== true && !userId" class="discussion__add">
        <Alert variant="neutral">
          <Flex y-center x-between gap="m">
            <p>Sign in to join the discussion and add a reply.</p>
            <Tooltip placement="top">
              <template #tooltip>
                <p>Sign-in to start the conversation</p>
              </template>
              <Button variant="accent" disabled>
                Sign in
              </Button>
            </Tooltip>
          </Flex>
        </Alert>
      </div>
    </template>
  </div>
  <!-- </ClientOnly> -->
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
