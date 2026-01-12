<script setup lang="ts">
import { Alert, Button, Flex, Skeleton, Textarea, Tooltip } from '@dolanske/vui'
import UserDisplay from '../Shared/UserDisplay.vue'
import DiscussionComment from './DiscussionComment.vue'

// TODO: add auto-scrolling to a comment with a hash (unless browsers will do that automatically)

const props = withDefaults(defineProps<{
  type: 'a' | 'b'
  model?: 'default' | 'forum'
  id: string
}>(), {
  model: 'default',
})

// Holds reference to the comment we're replying to
const replyingTo = ref<Comment>()
const message = ref('')

// To avoid prop drilling, expose this to all child components
provide('setReplyToComment', (comment: Comment) => replyingTo.value = comment)

const textareaRef = useTemplateRef('textarea')

// Auto focus textarea whenever replying is active
watch(replyingTo, () => {
  if (textareaRef.value)
    textareaRef.value.focus()
})

export interface Comment {
  id: number
  userId: string
  text: string
  replyTo?: number
  reply?: Comment
}

const rawCommentData = ref<Comment[]>([
  {
    id: 1,
    userId: '0197ce39-5653-4b43-9ae5-794e924a5201',
    text: 'Does anyone know if there is a specific dress code for tonight? I was thinking business casual.',
  },
  {
    id: 2,
    userId: '14bd8571-e589-40b6-a060-1aa3c33f24c2',
    text: 'I just checked the event description, and it says \'smart casual.\' Business casual should be perfectly fine!',
  },
  {
    id: 5,
    userId: '04a69784-d407-4393-877e-6b7591b6f89e',
    text: 'Just arrived! The venue looks incredible. There\'s coffee and snacks available in the lobby for early birds.',
    replyTo: 1,
  },
  {
    id: 3,
    userId: '0197ce39-5653-4b43-9ae5-794e924a5201',
    text: 'So hyped for the keynote speaker! I\'ve been following her work for years.',
  },
  {
    id: 4,
    userId: '04a69784-d407-4393-877e-6b7591b6f89e',
    text: 'Is anyone else traveling from the north side? Thinking about carpooling to save on parking fees.',
    replyTo: 2,
  },
  {
    id: 6,
    userId: '0197ce39-5653-4b43-9ae5-794e924a5201',
    text: 'Will the sessions be recorded? I have a conflict during the 2 PM workshop and don\'t want to miss out.',
  },
  {
    id: 7,
    userId: '14bd8571-e589-40b6-a060-1aa3c33f24c2',
    text: 'I believe they said recordings will be emailed to all ticket holders by Friday! See you all soon.',
  },
])

const modelled = computed(() => {
  return rawCommentData.value.map((item) => {
    if (item.replyTo) {
      item.reply = rawCommentData.value.find(reply => reply.id === item.replyTo)
    }

    return item
  })
})
</script>

<template>
  <ClientOnly>
    <div class="discussion">
      <!-- TODO Loading state -->
      <template v-if="false">
        <Skeleton :height="49" width="100%" style="margin:12px" />
      </template>

      <!-- Listing view -->
      <template v-else>
        <DiscussionComment
          v-for="comment in modelled"
          :key="comment.id"
          :data="comment"
          :model="props.model"
        />
        <div class="discussion__add">
          <Alert v-if="replyingTo">
            <Flex y-start gap="xl" x-between>
              <div>
                <span class="discussion__add--replying-label">Replying to
                  <UserDisplay class="inline-block" size="s" :user-id="replyingTo.userId" hide-avatar />:
                </span>
                <p class="ws-wrap">
                  {{ replyingTo.text }}
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
          <Textarea ref="textarea" v-model="message" :placeholder="`Write your ${!!replyingTo ? 'reply' : 'comment'}...`" :rows="4" expand auto-resize />
          <Button size="s" class="discussion__add--send-button">
            Send
            <template #end>
              <Icon name="ph:paper-plane-tilt" />
            </template>
          </Button>
        </div>
      </template>
    </div>
  </ClientOnly>
</template>

<style scoped lang="scss">
.discussion {
  display: flex;
  flex-direction: column;
  // In order to increase hover range for each comment, the gaps are 0 and instead items use padding
  gap: 0;

  &__add {
    margin-top: var(--space-m);
    padding-left: 40px;
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
