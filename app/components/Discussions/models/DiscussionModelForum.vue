<script setup lang="ts">
import type { Comment } from '../Discussion.vue'
import { Alert, Avatar, Button, ButtonGroup, Divider, Flex, Modal, pushToast, Textarea, Tooltip } from '@dolanske/vui'
import dayjs from 'dayjs'
import MDRenderer from '@/components/Shared/MDRenderer.vue'
import UserDisplay from '@/components/Shared/UserDisplay.vue'
import UserPreviewHover from '@/components/Shared/UserPreviewHover.vue'
import { stripMarkdown } from '@/lib/markdown-processors'
import { scrollToId } from '@/lib/utils/common'
// import UserPreviewCard from '@/components/Shared/UserPreviewCard.vue'
import { getCountryInfo } from '@/lib/utils/country'

interface Props {
  data: Comment
}

const props = defineProps<Props>()

const data = toRef(props, 'data')

const router = useRouter()
const route = useRoute()
const userId = useUserId()

const supabase = useSupabaseClient()

const { user } = useCacheUserData(data.value.created_by!, {
  includeRole: true,
  includeAvatar: true,
  userTtl: 10 * 60 * 1000,
  avatarTtl: 30 * 60 * 1000,
})

const country = computed(() => getCountryInfo(user.value?.country))

const setReplyToComment = inject('setReplyToComment') as (data: Comment) => void
const setQuoteOfComment = inject('setQuoteOfComment') as (data: Comment) => void

const { copy } = useClipboard()

function scrollToreply() {
  if (!data.value.reply) {
    return
  }

  const commentId = `#comment-${data.value.reply.id}`
  router.replace({ hash: commentId })

  // TODO: this just doesnt work, it doesnt wanna scroll!!
  scrollToId(commentId, 'nearest')
}

function copyCommentLink() {
  const url = new URL(window.location.href)
  url.hash = `#comment-${data.value.id}`
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
  deleteComment(data.value.id)
    .finally(() => {
      loadingDeletion.value = false
    })
}

// Editing the message
const editing = ref(false)
const editedContent = ref('')
const editLoading = ref(false)
const editError = ref<string[]>([])

function startEditing() {
  editing.value = true
  editedContent.value = data.value.content
}

function endEditing() {
  editing.value = false
  editedContent.value = ''
}

async function submit() {
  if (editedContent.value.length > 0) {
    editLoading.value = true

    const res = await supabase
      .from('discussion_replies')
      .update({ content: editedContent.value })
      .eq('id', data.value.id)
      .single()

    if (res.error) {
      editError.value = [res.error.message]
    }
    else {
      // NOTE (jan): For some reason the `res.data` was null after updating. So
      // for now I am updating the value automatically, but preferable the whole
      // comment object should get replaced by `res.data`

      data.value.content = editedContent.value
      data.value.modified_at = dayjs().toISOString()
    }

    editLoading.value = false
    endEditing()
  }
  else {
    editError.value = ['You must provide a message']
  }
}

watch(editedContent, () => editError.value = [])
</script>

<template>
  <div class="discussion-forum" :class="{ 'discussion-forum--highlight': `#comment-${data.id}` === route.hash }">
    <div v-if="user" class="discussion-forum__author">
      <UserPreviewHover :user-id="data.created_by">
        <Flex column x-center y-center gap="s" class="mb-s">
          <Avatar :url="user.avatarUrl || undefined" size="l" />
          <UserDisplay :user-id="data.created_by" show-role hide-avatar />
        </Flex>
      </UserPreviewHover>
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
      <Alert v-if="data.reply" icon-align="start" role="button" class="discussion-forum__reply" @click="scrollToreply">
        <p v-if="data.reply.created_by !== userId" class="discussion-forum__reply-user">
          <UserDisplay class="inline-block" size="s" :user-id="data.reply.created_by" hide-avatar /> wrote:
        </p>
        <p v-else class="discussion-forum__reply-user">
          You wrote:
        </p>
        <p class="text-color-light">
          {{ stripMarkdown(data.reply.content, 164) }}
        </p>
      </Alert>

      <MDRenderer :md="data.content" :skeleton-height="128" />

      <p class="discussion-forum__timestamp">
        <span>Posted {{ dayjs(data.created_at).fromNow() }}</span>
        <span>{{ data.modified_at !== data.created_at ? `Edited ${dayjs(data.modified_at).fromNow()}` : null }}</span>
      </p>

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
          <Button v-if="user" square size="s" @click="setQuoteOfComment(data)">
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
          <Button size="s" square :inert="loadingDeletion" @click="startEditing">
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

    <Modal :open="editing" @close="editing = false">
      <template #header>
        <Flex column gap="xxs">
          <h3>Edit post</h3>
          <p class="text-color-light text-m">
            Avoid writing offensive things.
          </p>
        </Flex>
      </template>
      <Textarea
        v-model="editedContent"
        :errors="editError"
        :rows="16"
        expand
        placeholder="Do not leave this empty. De"
      />

      <template #footer>
        <Flex gap="s" x-end>
          <Button plain :inert="editLoading" @click="endEditing">
            Cancel
          </Button>
          <Button variant="accent" :inert="editLoading" :loading="editLoading" @click="submit">
            Update
          </Button>
        </Flex>
      </template>
    </Modal>
  </div>
</template>

<style lang="scss" scoped>
.discussion-forum {
  display: grid;
  grid-template-columns: 212px 1fr;
  align-items: start;
  gap: 0;
  margin-bottom: var(--space-m);
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius-m);
  position: relative;

  &:hover {
    .discussion-forum__actions {
      opacity: 1;
      z-index: 10;
      visibility: visible;
    }
  }

  &--highlight .discussion-forum__content {
    background-color: color-mix(in srgb, var(--color-accent) 5%, transparent);
  }

  &__timestamp {
    display: flex;
    gap: var(--space-l);
    margin-top: var(--space-l);
    font-size: var(--font-size-xs);
    color: var(--color-text-lighter);

    span {
      font-size: inherit;
    }
  }

  &__reply {
    margin-bottom: var(--space-m);
    cursor: pointer;

    &:hover {
      background-color: var(--color-bg-raised);
    }
  }

  &__reply-user {
    font-weight: var(--font-weight-bold) !important;
    white-space: nowrap;

    :deep(.user-display__username) {
      font-weight: var(--font-weight-bold) !important;
    }
  }

  &__author {
    display: flex;
    justify-content: flex-start;
    flex-direction: column;
    align-items: center;
    height: 100%;
    border-right: 1px solid var(--color-border);
    padding: var(--space-m);

    .author-meta {
      font-size: var(--font-size-xs);
      color: var(--color-text-lighter);
    }
  }

  &__content {
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    padding: var(--space-m);
    background-color: var(--color-bg-medium);
    border-bottom-right-radius: var(--border-radius-m);
    border-top-right-radius: var(--border-radius-m);
    position: relative;
    height: 100%;
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
