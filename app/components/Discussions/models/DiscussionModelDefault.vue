<script setup lang="ts">
import type { Comment } from '../Discussion.vue'
import { Button, Tooltip } from '@dolanske/vui'
import MDRenderer from '@/components/Shared/MDRenderer.vue'
import UserDisplay from '@/components/Shared/UserDisplay.vue'
import { truncate } from '@/lib/utils/formatting'

interface Props {
  data: Comment
}

const {
  data,
} = defineProps<Props>()
const userId = useUserId()

// Generic wrapper around a discussion reply which assigns a reply model depending on the discussion type
const COMMENT_TRUNCATE = 80

// TODO: clicking a reply should temporarily highlight the comment we are replyin to

const setReplyToComment = inject('setReplyToComment') as (data: Comment) => void
</script>

<template>
  <div class="discussion-comment">
    <UserDisplay size="s" :user-id="data.userId" />
    <Tooltip v-if="data.reply">
      <div varia class="discussion-comment__reply" :class="{ 'discussion-comment__reply--me': data.reply.userId === userId }">
        <Icon name="ph:arrow-elbow-up-right" />
        <p v-if="data.reply.userId !== userId" class="discussion-comment__reply-user">
          <UserDisplay class="inline-block" size="s" :user-id="data.reply.userId" hide-avatar />:
        </p>
        <p v-else class="discussion-comment__reply-user">
          You:
        </p>
        <p class="text-overflow-1">
          {{ data.reply.text }}
        </p>
      </div>
      <template #tooltip>
        <p>
          <UserDisplay class="inline-block" size="s" :user-id="data.reply.userId" />
        </p>
        <p v-if="data.reply.text.length > COMMENT_TRUNCATE" class="text-size-m" style="max-width: 256px">
          {{ data.reply.text }}
        </p>
      </template>
    </Tooltip>
    <MDRenderer :md="data.text" />
    <Button class="discussion-comment__reply-button" outline square size="s" @click="setReplyToComment(data)">
      <Tooltip>
        <Icon name="ph:arrow-elbow-up-left" class="text-color-accent" />
        <template #tooltip>
          <p>Reply to <UserDisplay class="inline-block" size="s" :user-id="data.userId" hide-avatar /></p>
        </template>
      </Tooltip>
    </Button>
  </div>
</template>

<style scoped lang="scss">
.discussion-comment {
  display: flex;
  flex-direction: column;
  padding-block: 14px;
  position: relative;

  :deep(.typeset) {
    padding-left: 40px;
  }

  &:hover {
    .discussion-comment__reply-button {
      display: block;
    }
  }

  &__reply {
    display: flex;
    align-items: center;
    border-radius: 99px;
    background-color: var(--color-bg-raised);
    position: relative;
    width: fit-content;
    padding: 2px var(--space-s);
    margin-left: 40px;
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
      background-color: var(--color-bg-yellow-lowered);
    }
  }

  &__reply-user {
    font-weight: var(--font-weight-bold) !important;
    white-space: nowrap;

    :deep(.user-display__username) {
      font-weight: var(--font-weight-bold) !important;
    }
  }

  &__reply-button {
    display: none;
    position: absolute;
    right: 0;
    top: var(--space-s);
    color: var(--color-accent);
    font-size: var(--font-size-xs);
    text-align: left;
    width: fit-content;
    margin-left: 40px;
  }
}
</style>
