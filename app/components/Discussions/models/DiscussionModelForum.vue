<script setup lang="ts">
import type { Comment } from '../Discussion.vue'
import { Avatar, Button, ButtonGroup, Divider, Flex, pushToast, Tooltip } from '@dolanske/vui'
import dayjs from 'dayjs'
import MDRenderer from '@/components/Shared/MDRenderer.vue'
import UserDisplay from '@/components/Shared/UserDisplay.vue'
// import UserPreviewCard from '@/components/Shared/UserPreviewCard.vue'
import { getCountryInfo } from '@/lib/utils/country'

interface Props {
  data: Comment
}

const {
  data,
} = defineProps<Props>()

const { user } = useCacheUserData(data.created_by!, {
  includeRole: true,
  includeAvatar: true,
  userTtl: 10 * 60 * 1000,
  avatarTtl: 30 * 60 * 1000,
})

const country = computed(() => getCountryInfo(user.value?.country))

const setReplyToComment = inject('setReplyToComment') as (data: Comment) => void

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
  <div class="discussion-forum">
    <div v-if="user" class="discussion-forum__author">
      <!-- <UserPreviewCard :user-id="data.created_by" :show-activity="false" hide /> -->
      <Avatar :url="user.avatarUrl || undefined" size="l" class="mb-xs" />
      <UserDisplay :user-id="data.created_by" show-role class="mb-s" hide-avatar />
      <Flex expand x-center gap="l">
        <p v-if="user.created_at" class="author-meta">
          Joined {{ dayjs(user.created_at).format('MMMM YYYY') }}
        </p>
        <p v-if="country" class="author-meta">
          {{ country.name }} {{ country.emoji }}
        </p>
      </Flex>
      <Divider />
      <p v-if="user.introduction" class="user-preview-card__intro text-s">
        {{ user.introduction }}
      </p>
    </div>
    <div class="discussion-forum__content">
      <MDRenderer :md="data.content" :skeleton-height="128" />

      <div class="discussion-forum__actions">
        <ButtonGroup v-if="user">
          <Button square size="s" @click="setReplyToComment(data)">
            <Tooltip>
              <Icon name="ph:arrow-elbow-up-left-bold" />
              <template #tooltip>
                <p>Reply to <UserDisplay class="inline-block" size="s" :user-id="data.created_by" hide-avatar /></p>
              </template>
            </Tooltip>
          </Button>
          <Button v-if="user" square size="s">
            <Tooltip>
              <Icon name="ph:quotes-bold" />
              <template #tooltip>
                <p>Quote <UserDisplay class="inline-block" size="s" :user-id="data.created_by" hide-avatar /></p>
              </template>
            </Tooltip>
          </Button>
          <Button size="s" square @click="copyCommentLink">
            <Tooltip>
              <Icon name="ph:link-bold" />
              <template #tooltip>
                <p>Copy link to post</p>
              </template>
            </Tooltip>
          </Button>
        </ButtonGroup>

        <ButtonGroup v-if="user && data.created_by === user.id">
          <Button size="s" square :inert="loadingDeletion" :loading="loadingDeletion">
            <Tooltip>
              <Icon name="ph:pen-bold" />
              <template #tooltip>
                <p>Edit post</p>
              </template>
            </Tooltip>
          </Button>
          <!-- Delete comment option if the comment belongs to me -->
          <Button size="s" square :inert="loadingDeletion" :loading="loadingDeletion" @click="beginCommentDeletion">
            <Tooltip>
              <Icon name="ph:trash-bold" />
              <template #tooltip>
                <p>Delete post</p>
              </template>
            </Tooltip>
          </Button>
        </ButtonGroup>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.discussion-forum {
  display: grid;
  grid-template-columns: 212px 1fr;
  gap: 0;
  margin-bottom: var(--space-m);
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius-m);

  &:hover {
    .discussion-forum__actions {
      opacity: 1;
      z-index: 10;
      visibility: visible;
    }
  }

  &__author {
    display: flex;
    justify-content: center;
    flex-direction: column;
    align-items: center;
    border-right: 1px solid var(--color-border);
    padding: var(--space-m);

    .author-meta {
      font-size: var(--font-size-xs);
      color: var(--color-text-lighter);
    }
  }

  &__content {
    padding: var(--space-m);
    background-color: var(--color-bg-medium);
    border-bottom-right-radius: var(--border-radius-m);
    border-top-right-radius: var(--border-radius-m);
    position: relative;
  }

  &__badges {
    padding-left: 8px;
    height: 36px;
  }

  &__actions {
    display: flex;
    gap: 3px;
    position: absolute;
    right: 12px;
    top: 12px;
    opacity: 0;
    z-index: -1;
    visibility: hidden;
  }
}
</style>
