<script setup lang="ts">
import type { Tables } from '@/types/database.types'
import { $withLabel, defineRules, maxLength, minLenNoSpace, required, useValidation } from '@dolanske/v-valid'
import { Alert, Button, Flex, Skeleton, Tooltip } from '@dolanske/vui'
import { wrapInBlockquote } from '@/lib/markdown-processors'
import { FORUMS_BUCKET_ID } from '@/lib/storageAssets'
import { normalizeErrors, normalizeTipTapOutput, truncate } from '@/lib/utils/formatting'
import RichTextEditor from '../Editor/RichTextEditor.vue'
import UserDisplay from '../Shared/UserDisplay.vue'
import DiscussionItem from './DiscussionItem.vue'

/**
 * NOTE
 *
 * Important note (@dolanske)
 *
 * For clarity during implementation, this component calls reply a 'comment' and
 * if a comment is replying to another one, it is saved to it as a 'reply'
 */

// Settings which will be provided to all components within a Discusson
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
  timestamps: false,
  inputRows: 3,
  placeholder: 'Leave your comment...',
})

const MAX_COMMENT_CHARS = 8192

// If user isn't signed it, do not allow commenting
const userId = useUserId()

export type RawComment = Omit<Tables<'discussion_replies'>, 'meta'> & { meta: never }
export interface Comment extends RawComment {
  reply: RawComment | null
}

export type ProvidedDiscussion = Ref<Tables<'discussions'> | undefined>

// Fetch data & state
const supabase = useSupabaseClient()

const loading = ref(false)
const error = ref<string>()

const discussion = ref<Tables<'discussions'>>()
const comments = ref<RawComment[]>([])

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

// Add replies to the message object so the UI can display it
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
      reply: foundReply || null,
    }
  })
})

// Comment writing & validation
const formLoading = ref(false)

const form = reactive({
  message: '',
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
provide('setQuoteOfComment', async (comment: Comment) => {
  // Query username from the comment
  const { data } = await supabase
    .from('profiles')
    .select('username')
    .eq('id', comment.created_by)
    .single()

  form.message = `${wrapInBlockquote(`${comment.markdown} \n\n @${data.username} said`)} \n\n`

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
        comments.value.push(res.data as RawComment)
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
      <template v-if="modelledComments.length > 0">
        <DiscussionItem
          v-for="comment in modelledComments"
          :key="comment.id"
          :data="comment"
          :model="props.model"
        />
      </template>
      <div v-if="props.hideInput !== true && userId" class="discussion__add">
        <Alert v-if="replyingTo">
          <Flex y-start gap="xl" x-between>
            <div>
              <span class="discussion__add--replying-label">Replying to
                <UserDisplay class="inline-block" size="s" :user-id="replyingTo!.created_by" hide-avatar />:
              </span>
              <p class="ws-wrap">
                {{ truncate(replyingTo?.markdown ?? '', 240) }}
              </p>
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
        <div v-else-if="discussion?.is_locked">
          <Alert variant="neutral">
            <template #icon>
              <Icon name="ph:lock" />
            </template>
            This discussion is locked
          </Alert>
        </div>
        <RichTextEditor
          v-else
          ref="textarea"
          v-model="form.message"
          show-actions
          :errors="normalizeErrors(errors.message)"
          :placeholder="replyingTo ? 'Write your reply here...' : props.placeholder"
          min-height="64px"
          :media-context="discussion?.id ? `${discussion.id}/${userId}` : 'staging'"
          :media-bucket-id="FORUMS_BUCKET_ID"
          @submit="submitReply"
        />
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
  // In order to increase hover range for each comment,
  // the gaps are 0 and instead items use padding
  gap: 0;

  --left-offset: 40px;

  &--forum {
    .discussion__add {
      padding-left: 0;
    }
  }

  &__add {
    &:deep(.vui-input-container .vui-input textarea) {
      border-radius: var(--border-radius-m);
      padding-right: 88px;
    }

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
