<script setup lang="ts">
import type { Comment, DiscussionSettings } from '../Discussion.vue'
import { Button, ButtonGroup, pushToast, Tooltip } from '@dolanske/vui'
import dayjs from 'dayjs'
import MDRenderer from '@/components/Shared/MDRenderer.vue'
import UserDisplay from '@/components/Shared/UserDisplay.vue'
import { stripMarkdown } from '@/lib/markdown-processors'
import { scrollToId } from '@/lib/utils/common'

interface Props {
  data: Comment
}

const {
  data,
} = defineProps<Props>()

const { timestamps } = inject('discussion-settings') as DiscussionSettings

const userId = useUserId()
const router = useRouter()
const route = useRoute()

// Generic wrapper around a discussion reply which assigns a reply model depending on the discussion type
const COMMENT_TRUNCATE = 96

const setReplyToComment = inject('setReplyToComment') as (data: Comment) => void

function scrollToreply() {
  const commentId = `#comment-${data.id}`
  router.replace({ hash: commentId })

  // TODO: this just doesnt work, it doesnt wanna scroll!!
  scrollToId(commentId, 'nearest')
}

const { copy } = useClipboard()

function copyCommentLink() {
  const url = new URL(window.location.href)
  url.hash = `#comment-${data.id}`
  copy(url.toString())
  pushToast('Link copied to clipboard', {
    timeout: 1500,
  })
}

// Comment deletion
const deleteComment = inject('delete-comment') as (id: string) => Promise<void>
const loadingDeletion = ref(false)

function beginCommentDeletion() {
  loadingDeletion.value = true
  deleteComment(data.id)
    .finally(() => {
      loadingDeletion.value = false
    })
}
</script>

<template>
  <div class="discussion-comment" :class="{ 'discussion-comment--highlight': `#comment-${data.id}` === route.hash }">
    <UserDisplay size="s" :user-id="data.created_by" />
    <Tooltip v-if="data.reply" :delay="750">
      <button varia class="discussion-comment__reply" :class="{ 'discussion-comment__reply--me': data.reply.created_by === userId }" @click="scrollToreply">
        <Icon name="ph:arrow-elbow-up-right" />
        <p v-if="data.reply.created_by !== userId" class="discussion-comment__reply-user">
          <UserDisplay class="inline-block" size="s" :user-id="data.reply.created_by" hide-avatar />:
        </p>
        <p v-else class="discussion-comment__reply-user">
          You:
        </p>
        <p class="text-overflow-1">
          {{ stripMarkdown(data.reply.content, 512) }}
        </p>
      </button>
      <template #tooltip>
        <p>
          <UserDisplay class="inline-block" size="s" :user-id="data.reply.created_by" />
        </p>
        <MDRenderer
          v-if="data.reply.content.length > COMMENT_TRUNCATE"
          style="max-width: 256px"
          :md="data.content"
          skeleton-height="0px"
        />
      </template>
    </Tooltip>
    <MDRenderer :md="data.content" skeleton-height="0px" />
    <p v-if="timestamps" class="discussion-comment__timestamp">
      {{ dayjs(data.created_at).fromNow() }}
    </p>
    <div v-if="userId" class="discussion-comment__actions">
      <ButtonGroup>
        <Button square size="s" @click="setReplyToComment(data)">
          <Tooltip>
            <Icon name="ph:arrow-elbow-up-left-bold" />
            <template #tooltip>
              <p>Reply to <UserDisplay class="inline-block" size="s" :user-id="data.created_by" hide-avatar /></p>
            </template>
          </Tooltip>
        </Button>
        <Button size="s" square @click="copyCommentLink">
          <Tooltip>
            <Icon name="ph:link-bold" />
            <template #tooltip>
              <p>Copy link to comment</p>
            </template>
          </Tooltip>
        </Button>
      </ButtonGroup>
      <!-- Delete comment option if the comment belongs to me -->
      <Button v-if="data.created_by === userId && userId" size="s" square @click="beginCommentDeletion">
        <Tooltip>
          <Icon name="ph:x-bold" />
          <template #tooltip>
            <p>Delete comment</p>
          </template>
        </Tooltip>
      </Button>
    </div>
  </div>
</template>

<style scoped lang="scss">
.discussion-comment {
  display: flex;
  flex-direction: column;
  padding-block: 14px;
  position: relative;
  z-index: 1;

  :deep(.typeset) {
    padding-left: 40px;
  }

  &:before {
    content: '';
    display: block;
    position: absolute;
    inset: 4px -12px;
    z-index: -1;
    border-radius: var(--border-radius-m);
    background-color: var(--color-bg-raised);
    transition: var(--transition-slow);
    opacity: 0;
  }

  &--highlight:before {
    opacity: 1;
  }

  &:hover {
    .discussion-comment__actions {
      opacity: 1;
      z-index: 10;
      visibility: visible;
    }
  }

  &__timestamp {
    margin-top: var(--space-xxs);
    padding-left: var(--left-offset);
    font-size: var(--font-size-xs);
    color: var(--color-text-lighter);
  }

  &__reply {
    display: flex;
    align-items: center;
    text-align: left;
    border-radius: 99px;
    background-color: var(--color-bg-raised);
    position: relative;
    width: fit-content;
    padding: 2px var(--space-s);
    margin-left: var(--left-offset);
    gap: 4px;
    margin-top: 4px;
    margin-bottom: 2px;
    cursor: pointer;
    transition: var(--transition-fast);

    .iconify {
      min-width: 14px;
      min-height: 14px;
    }

    :deep(.user-display__link .user-display__username),
    p,
    .iconify {
      font-size: var(--font-size-s) !important;
      line-height: 22px;
      transition: var(--transition-fast);
      color: var(--color-text-light);
    }

    &:hover {
      background-color: var(--color-button-gray-hover) !important;
    }
  }

  &__reply--me {
    background-color: color-mix(in srgb, var(--color-bg-yellow-lowered) 50%, transparent);
    color: var(--color-text-yellow);

    :deep(.user-display__link .user-display__username),
    p,
    .iconify {
      color: var(--color-text-yellow);
    }

    &:hover {
      background-color: var(--color-bg-yellow-lowered) !important;
    }
  }

  &__reply-user {
    font-weight: var(--font-weight-bold) !important;
    white-space: nowrap;

    :deep(.user-display__username) {
      font-weight: var(--font-weight-bold) !important;
    }
  }

  &__actions {
    display: flex;
    gap: 3px;
    position: absolute;
    right: -4px;
    top: var(--space-s);

    opacity: 0;
    z-index: -1;
    visibility: hidden;
  }
}
</style>
