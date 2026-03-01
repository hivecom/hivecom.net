<script setup lang="ts">
import type { Comment, DiscussionSettings, ProvidedDiscussion } from '../Discussion.vue'
import { Button, ButtonGroup, Card, Flex, Tooltip } from '@dolanske/vui'
import dayjs from 'dayjs'
import ComplaintsManager from '@/components/Shared/ComplaintsManager.vue'
import ConfirmModal from '@/components/Shared/ConfirmModal.vue'
import MDRenderer from '@/components/Shared/MDRenderer.vue'
import UserDisplay from '@/components/Shared/UserDisplay.vue'
import { stripMarkdown } from '@/lib/markdown-processors'

interface Props {
  data: Comment
}

const {
  data,
} = defineProps<Props>()

const emit = defineEmits<{
  copyLink: []
  scrollReply: []
}>()

const { timestamps } = inject('discussion-settings') as DiscussionSettings

const discussion = inject('discussion') as ProvidedDiscussion
const canBypassLock = inject('canBypassLock', ref(false)) as Ref<boolean>

const userId = useUserId()

// Generic wrapper around a discussion reply which assigns a reply model depending on the discussion type
const COMMENT_TRUNCATE = 96

const setReplyToComment = inject('setReplyToComment') as (data: Comment) => void

// Comment deletion
const deleteComment = inject('delete-comment') as (id: string) => Promise<void>
const loadingDeletion = ref(false)
const showDeleteModal = ref(false)

// Reporting
const showReportModal = ref(false)

function handleDeletion() {
  loadingDeletion.value = true
  deleteComment(data.id)
    .finally(() => {
      loadingDeletion.value = false
    })
}
</script>

<template>
  <div class="discussion-comment">
    <Flex>
      <UserDisplay size="s" :user-id="data.created_by" />
    </Flex>
    <Tooltip v-if="data.reply" :delay="750">
      <button varia class="discussion-comment__reply" :class="{ 'discussion-comment__reply--me': data.reply.created_by === userId }" @click="emit('scrollReply')">
        <Icon name="ph:arrow-elbow-up-right" />
        <p v-if="data.reply.created_by !== userId" class="discussion-comment__reply-user">
          <UserDisplay class="inline-block" size="s" :user-id="data.reply.created_by" hide-avatar />:
        </p>
        <p v-else class="discussion-comment__reply-user">
          You:
        </p>
        <p class="text-overflow-1">
          {{ stripMarkdown(data.reply.markdown, 512) }}
        </p>
      </button>
      <template #tooltip>
        <p>
          <UserDisplay class="inline-block" size="s" :user-id="data.reply.created_by" />
        </p>
        <MDRenderer
          v-if="data.reply.markdown.length > COMMENT_TRUNCATE"
          style="max-width: 256px"
          :md="data.reply.markdown"
          skeleton-height="0px"
        />
      </template>
    </Tooltip>
    <MDRenderer :md="data.markdown" skeleton-height="0px" />
    <p v-if="timestamps" class="discussion-comment__timestamp">
      {{ dayjs(data.created_at).fromNow() }}
    </p>
    <div class="discussion-comment__actions">
      <ButtonGroup>
        <Button v-if="userId && (!discussion?.is_locked || canBypassLock) && !discussion?.is_archived" square size="s" @click="setReplyToComment(data)">
          <Tooltip>
            <Icon name="ph:arrow-elbow-up-left-bold" />
            <template #tooltip>
              <p>Reply to <UserDisplay class="inline-block" size="s" :user-id="data.created_by" hide-avatar /></p>
            </template>
          </Tooltip>
        </Button>
        <Button size="s" square @click="emit('copyLink')">
          <Tooltip>
            <Icon name="ph:link-bold" />
            <template #tooltip>
              <p>Copy link to comment</p>
            </template>
          </Tooltip>
        </Button>
      </ButtonGroup>
      <!-- Report button for other users' comments -->
      <Button v-if="userId && data.created_by !== userId" size="s" square @click="showReportModal = true">
        <Tooltip>
          <Icon name="ph:flag-bold" />
          <template #tooltip>
            <p>Report comment</p>
          </template>
        </Tooltip>
      </Button>
      <!-- Delete comment option if the comment belongs to me -->
      <Button v-if="data.created_by === userId && !discussion?.is_locked && !discussion?.is_archived" size="s" square :inert="loadingDeletion" :loading="loadingDeletion" @click="showDeleteModal = true">
        <Tooltip>
          <Icon name="ph:trash-bold" />
          <template #tooltip>
            <p>Delete comment</p>
          </template>
        </Tooltip>
      </Button>

      <ConfirmModal
        :open="showDeleteModal"
        :confirm-loading="loadingDeletion"
        title="Delete comment"
        description="Please confirm the deletion. This action cannot be undone"
        @close="showDeleteModal = false"
        @confirm="handleDeletion"
      >
        <Card
          class="card-bg" :style="{ maxHeight: 512,
                                    overflowY: 'auto' }"
        >
          <MDRenderer :md="data.markdown" skeleton-height="0px" />
        </Card>
      </ConfirmModal>
    </div>

    <ComplaintsManager
      v-model:open="showReportModal"
      :context-discussion-id="discussion?.id"
      :context-discussion-reply-id="data.id"
      start-with-submit
    />
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
    inset: 8px 0;
    left: 34px;
    z-index: -1;
    border-radius: var(--border-radius-m);
    background-color: color-mix(in srgb, var(--color-accent) 5%, transparent);
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
    right: 4px;
    top: var(--space-s);

    opacity: 0;
    z-index: -1;
    visibility: hidden;
  }
}
</style>
