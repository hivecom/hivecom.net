<script setup lang="ts">
import type { Comment, ProvidedDiscussion } from '../Discussion.vue'
import { Alert, Avatar, Button, ButtonGroup, Card, Divider, Flex, Modal, Tooltip } from '@dolanske/vui'
import dayjs from 'dayjs'
import RichTextEditor from '@/components/Editor/RichTextEditor.vue'
import BadgeCircle from '@/components/Shared/BadgeCircle.vue'
import ComplaintsManager from '@/components/Shared/ComplaintsManager.vue'
import ConfirmModal from '@/components/Shared/ConfirmModal.vue'
import MDRenderer from '@/components/Shared/MDRenderer.vue'
import UserDisplay from '@/components/Shared/UserDisplay.vue'
import UserName from '@/components/Shared/UserName.vue'
import UserPreviewHover from '@/components/Shared/UserPreviewHover.vue'
import UserRole from '@/components/Shared/UserRole.vue'
import { stripMarkdown } from '@/lib/markdown-processors'
import { useBreakpoint } from '@/lib/mediaQuery'
import { FORUMS_BUCKET_ID } from '@/lib/storageAssets'
import { getCountryInfo } from '@/lib/utils/country'

interface Props {
  data: Comment
}

const props = defineProps<Props>()

const emit = defineEmits<{
  copyLink: []
  scrollReply: []
}>()

const data = toRef(props, 'data')

const userId = useUserId()
const supabase = useSupabaseClient()
const currentUser = useSupabaseUser()

const isMobile = useBreakpoint('<s')

const discussion = inject('discussion') as ProvidedDiscussion
const canBypassLock = inject('canBypassLock', ref(false)) as Ref<boolean>

const { user } = useCacheUserData(data.value.created_by!, {
  includeRole: true,
  includeAvatar: true,
  userTtl: 10 * 60 * 1000,
  avatarTtl: 30 * 60 * 1000,
})

const country = computed(() => getCountryInfo(user.value?.country))

const setReplyToComment = inject('setReplyToComment') as (data: Comment) => void
const setQuoteOfComment = inject('setQuoteOfComment') as (data: Comment) => void

// Comment deletion
const deleteComment = inject('delete-comment') as (id: string) => Promise<void>
const loadingDeletion = ref(false)
const showDeleteModal = ref(false)

function handleDeletion() {
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
  editedContent.value = data.value.markdown
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
      .update({ markdown: editedContent.value })
      .eq('id', data.value.id)
      .single()

    if (res.error) {
      editError.value = [res.error.message]
    }
    else {
      // NOTE (jan): For some reason the `res.data` was null after updating. So
      // for now I am updating the value automatically, but preferable the whole
      // comment object should get replaced by `res.data`

      data.value.markdown = editedContent.value
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

const showNSFWWarning = ref(!!props.data.is_nsfw)

// Reporting
const showReportModal = ref(false)

const [DefineReusableUserInfo, UserInfo] = createReusableTemplate()
</script>

<template>
  <div class="discussion-forum">
    <DefineReusableUserInfo>
      <Flex column x-center y-center :gap="isMobile ? 'xs' : 's'">
        <Avatar :url="user?.avatarUrl || undefined" :size="isMobile ? 'm' : 'l'" />
        <Flex wrap gap="xxs" y-center x-center>
          <UserName :user-id="data.created_by" />
          <BadgeCircle v-if="data.created_by === discussion?.created_by">
            <span class="text-xxs text-color-light">OP</span>
          </BadgeCircle>
          <UserRole :user-id="data.created_by" />
        </Flex>
      </Flex>
    </DefineReusableUserInfo>

    <div class="discussion-forum__author">
      <UserPreviewHover v-if="currentUser" :user-id="data.created_by">
        <UserInfo />
      </UserPreviewHover>

      <UserInfo v-else />

      <Flex v-if="user?.created_at || country" expand x-center gap="xs" class="mt-s">
        <p v-if="country" class="author-meta">
          {{ country.emoji }}
        </p>
        <p v-if="user?.created_at" class="author-meta">
          Joined {{ dayjs(user.created_at).format('MMMM YYYY') }}
        </p>
      </Flex>
      <Divider v-if="user?.introduction || user?.created_at || country" />
      <p v-if="user?.introduction" class="text-s text-center">
        {{ user.introduction }}
      </p>
    </div>

    <div class="discussion-forum__content">
      <Alert v-if="data.reply" icon-align="start" role="button" class="discussion-forum__reply" @click="emit('scrollReply')">
        <p v-if="data.reply.created_by !== userId" class="discussion-forum__reply-user">
          <UserDisplay class="inline-block" size="s" :user-id="data.reply.created_by" hide-avatar /> wrote:
        </p>
        <p v-else class="discussion-forum__reply-user">
          You wrote:
        </p>
        <p class="text-color-light">
          {{ stripMarkdown(data.reply.markdown, 164) }}
        </p>
      </Alert>

      <!-- Content warning -->
      <button v-if="showNSFWWarning" class="discussion-forum__nsfw" @click="showNSFWWarning = false">
        <Icon class="text-color-accent" name="ph:caret-down" />
        <p>Click to reveal potentially sensitive content</p>
        <Icon class="text-color-accent" name="ph:caret-up" />
      </button>

      <MDRenderer v-else :md="data.markdown" :skeleton-height="128" />

      <p class="discussion-forum__timestamp">
        <span>Posted {{ dayjs(data.created_at).fromNow() }}</span>
        <span>{{ data.modified_at !== data.created_at ? `Edited ${dayjs(data.modified_at).fromNow()}` : null }}</span>
      </p>

      <div v-if="!showNSFWWarning" class="discussion-forum__actions">
        <ButtonGroup v-if="user">
          <template v-if="(!discussion?.is_locked || canBypassLock) && !discussion?.is_archived">
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
          </template>
          <Button size="s" square @click="emit('copyLink')">
            <Tooltip>
              <Icon name="ph:link-bold" />
              <template #tooltip>
                <p>Copy link to post</p>
              </template>
            </Tooltip>
          </Button>
        </ButtonGroup>

        <ButtonGroup v-if="user && data.created_by === user.id && !discussion?.is_locked && !discussion?.is_archived">
          <Button size="s" square :inert="loadingDeletion" @click="startEditing">
            <Tooltip>
              <Icon name="ph:pen-bold" />
              <template #tooltip>
                <p>Edit post</p>
              </template>
            </Tooltip>
          </Button>
          <!-- Delete comment option if the comment belongs to me -->
          <Button size="s" square :inert="loadingDeletion" :loading="loadingDeletion" @click="showDeleteModal = true">
            <Tooltip>
              <Icon name="ph:trash-bold" />
              <template #tooltip>
                <p>Delete post</p>
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
        </ButtonGroup>

        <!-- Report button for other users' posts -->
        <Button v-if="userId && data.created_by !== userId" size="s" square @click="showReportModal = true">
          <Tooltip>
            <Icon name="ph:flag-bold" />
            <template #tooltip>
              <p>Report post</p>
            </template>
          </Tooltip>
        </Button>
      </div>
    </div>

    <Modal :open="editing" centered scrollable size="l" @close="editing = false">
      <template #header>
        <Flex column gap="xxs">
          <h3>Edit post</h3>
          <p class="text-color-light text-m">
            Avoid writing offensive things.
          </p>
        </Flex>
      </template>

      <RichTextEditor
        v-model="editedContent"
        :errors="editError"
        :media-context="userId ? `${data.discussion_id}/${userId}` : undefined"
        :media-bucket-id="FORUMS_BUCKET_ID"
        min-height="196px"
        class="mb-xs"
        placeholder="Edit your message. Do not leave it empty!"
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

    <ComplaintsManager
      v-model:open="showReportModal"
      :context-discussion-id="discussion?.id"
      :context-discussion-reply-id="data.id"
      start-with-submit
    />
  </div>
</template>

<style lang="scss" scoped>
@use '@/assets/breakpoints.scss' as *;

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

  &__nsfw {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    border-radius: var(--border-radius-l);
    background-color: var(--color-bg-raised);
    padding: var(--space-m);
    transition: var(--transition);
    color: var(--color-text-light);
    gap: var(--space-xxs);
    height: 100px;

    &:hover {
      background-color: var(--color-button-gray);
      gap: 0;
    }
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

@media screen and (max-width: $breakpoint-s) {
  .discussion-forum {
    display: flex;
    flex-direction: column-reverse;

    &__author {
      width: 100%;
      padding: var(--space-xs);
      border-right: none;
    }

    &__content {
      width: 100%;
      border-top-left-radius: var(--border-radius-m);
      border-bottom-left-radius: 0;
      border-bottom-right-radius: 0;
    }

    &__timestamp {
      margin-top: var(--space-m);
    }
  }
}
</style>
