<script setup lang="ts">
import type { Tables } from '@/types/database.types'
import { $withLabel, defineRules, maxLength, minLenNoSpace, required, useValidation } from '@dolanske/v-valid'
import { Alert, Button, Card, Flex, Skeleton, Textarea, Tooltip } from '@dolanske/vui'
import UserDisplay from '../Shared/UserDisplay.vue'
import DiscussionItem from './DiscussionItem.vue'

/**
 * Important note (dolan)
 *
 * For clarity during implementation, this component calls reply a 'comment' and
 * if a comment is replying to another one, it is saved to it as a 'reply'
 */

// TODO: add auto-scrolling to a comment with a hash (unless browsers will do that automatically)

export interface DiscussionSettings {
  timestamps: boolean
  inputRows: number
}

interface Props extends Partial<DiscussionSettings> {
  type: Tables<'discussions'>['type']
  id: string
  model?: 'comment' | 'forum'
}

const props = withDefaults(defineProps<Props>(), {
  model: 'comment',
  timestamps: false,
  inputRows: 3,
})

provide<DiscussionSettings>('discussion-settings', {
  timestamps: props.timestamps,
  inputRows: props.inputRows,
})

export type RawComment = Omit<Tables<'discussion_replies'>, 'meta'> & { meta: never }
export interface Comment extends RawComment {
  reply: RawComment | null
}

// Fetch data & state
const supabase = useSupabaseClient()

const loading = ref(false)
const error = ref<string>()

const discussion = ref<Tables<'discussions'>>()
const comments = ref<RawComment[]>([])

watch(() => props.id, async () => {
  loading.value = true

  const discussionResponse = await supabase
    .from('discussions')
    .select('*')
    .eq(`${props.type}_id`, props.id)
    .eq('type', props.type)
    .single()

  if (discussionResponse.error) {
    return error.value = discussionResponse.error.message
  }
  else {
    discussion.value = discussionResponse.data
  }

  const commentsResponse = await supabase
    .from('discussion_replies')
    .select('*')
    .eq('discussion_id', discussionResponse.data.id)
    .order('created_at')

  if (commentsResponse.error) {
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

// Auto focus textarea whenever replying is active
watch(replyingTo, () => {
  if (textareaRef.value)
    textareaRef.value.focus()
})

const MAX_COMMENT_CHARS = 8192

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

async function submitReply() {
  if (formLoading.value)
    return

  formLoading.value = true

  validate()
    .then(async () => {
      const commentData = {
        content: form.message,
        discussion_id: discussion.value?.id,
        ...(!!replyingTo.value && { reply_to_id: replyingTo.value.id }),
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
      <Skeleton height="49px" width="100%" style="margin:12px" />
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
      <Card v-else class="card-bg">
        <Flex column y-center x-center>
          <Icon name="ph:chats-teardrop" class="text-color-lighter" :size="32" />
          <p class="text-color-lighter">
            Nobody has said anything yet...
          </p>
        </Flex>
      </Card>
      <div class="discussion__add">
        <Alert v-if="replyingTo">
          <Flex y-start gap="xl" x-between>
            <div>
              <span class="discussion__add--replying-label">Replying to
                <UserDisplay class="inline-block" size="s" :user-id="replyingTo!.created_by" hide-avatar />:
              </span>
              <p class="ws-wrap">
                {{ replyingTo!.content }}
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
        <form @submit.prevent="submitReply">
          <Textarea
            ref="textarea"
            v-model="form.message"
            :errors="Object.values(errors.message.errors)"
            :placeholder="`Write your ${!!replyingTo ? 'reply' : 'comment'}...`"
            :rows="props.inputRows"
            expand
            auto-resize
          />
          <Button size="s" class="discussion__add--send-button" type="submit" :loading="formLoading">
            Send
            <template #end>
              <Icon name="ph:paper-plane-tilt" />
            </template>
          </Button>
        </form>
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
    margin-top: var(--space-m);
    // padding-left: var(--left-offset);
    position: relative;

    &:deep(.vui-input-container .vui-input textarea) {
      border-radius: var(--border-radius-m);
    }

    &:deep(.vui-alert) {
      background-color: var(--color-bg-medium);
      margin-bottom: 6px;
    }

    &:deep(.vui-alert-icon) {
      display: none;
    }
  }

  &__add--send-button {
    position: absolute;
    right: 12px;
    bottom: 12px;
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
