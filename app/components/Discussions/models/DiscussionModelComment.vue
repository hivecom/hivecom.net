<script setup lang="ts">
import type { Comment, DiscussionSettings, ProvidedDiscussion } from '../Discussion.types'
import { Alert, Button, Card, Flex, Modal, Switch, Tooltip } from '@dolanske/vui'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import DiscussionActionsToolbar from '@/components/Discussions/DiscussionActionsToolbar.vue'
import { resolvePlainTextMentions } from '@/components/Editor/plugins/mentions'
import RichTextEditor from '@/components/Editor/RichTextEditor.vue'
import ReactionsSelect from '@/components/Reactions/ReactionsSelect.vue'
import ComplaintsManager from '@/components/Shared/ComplaintsManager.vue'
import ConfirmModal from '@/components/Shared/ConfirmModal.vue'
import MarkdownPreview from '@/components/Shared/MarkdownPreview.vue'
import MDRenderer from '@/components/Shared/MDRenderer.vue'
import UserAvatar from '@/components/Shared/UserAvatar.vue'
import UserDisplay from '@/components/Shared/UserDisplay.vue'
import UserName from '@/components/Shared/UserName.vue'
import { stripMarkdown } from '@/lib/markdownProcessors'
import { useBreakpoint } from '@/lib/mediaQuery'
import { FORUMS_BUCKET_ID } from '@/lib/storageAssets'
import { DISCUSSION_KEYS } from '../Discussion.keys'

const props = defineProps<Props>()

const emit = defineEmits<{
  copyLink: []
  scrollReply: []
  openReplies: []
}>()

dayjs.extend(relativeTime)

interface Props {
  data: Comment
  threadReplyCount?: number
}

const data = toRef(props, 'data')

const { timestamps } = inject(DISCUSSION_KEYS.discussionSettings) as DiscussionSettings
const viewMode = inject(DISCUSSION_KEYS.viewMode, ref<'flat' | 'threaded'>('flat'))

const discussion = inject(DISCUSSION_KEYS.discussion) as ProvidedDiscussion
const canBypassLock = inject(DISCUSSION_KEYS.canBypassLock, ref(false))

const userId = useUserId()
const supabase = useSupabaseClient()

const { user: currentUserData } = useDataUser(userId, { includeRole: true })

const modifierId = computed(() => {
  const { modified_at, created_at, modified_by, created_by } = data.value
  if (modified_at === created_at || !modified_by || modified_by === created_by)
    return null
  return modified_by
})
const { user: modifierUser } = useDataUser(modifierId, { userTtl: 10 * 60 * 1000 })

const COMMENT_TRUNCATE = 96

const setReplyToComment = inject(DISCUSSION_KEYS.setReplyToComment) as (data: Comment) => void

// ── Off-topic ─────────────────────────────────────────────────────────────────

const canMarkOfftopic = inject(DISCUSSION_KEYS.canMarkOfftopic, ref(false))
const toggleOfftopic = inject(DISCUSSION_KEYS.toggleOfftopic) as (comment: Comment) => Promise<void>
const offtopicLoading = ref(false)

async function handleToggleOfftopic() {
  offtopicLoading.value = true
  await toggleOfftopic(data.value)
  offtopicLoading.value = false
}

// ── NSFW ──────────────────────────────────────────────────────────────────────

// When the parent thread's fullscreen NSFW overlay has already been dismissed
// (or warnings are disabled in settings), we skip the per-reply gate entirely.
const threadNsfwRevealed = inject(DISCUSSION_KEYS.threadNsfwRevealed, ref(false))
const _showNSFWWarning = ref(!!data.value.is_nsfw)
const showNSFWWarning = computed({
  get: () => !!data.value.is_nsfw && !threadNsfwRevealed.value && _showNSFWWarning.value,
  set: (val: boolean) => { _showNSFWWarning.value = val },
})

// ── Deletion ──────────────────────────────────────────────────────────────────

const deleteComment = inject(DISCUSSION_KEYS.deleteComment) as (id: string) => Promise<void>
const loadingDeletion = ref(false)
const showDeleteModal = ref(false)

function handleDeletion() {
  loadingDeletion.value = true
  deleteComment(data.value.id)
    .finally(() => {
      loadingDeletion.value = false
    })
}

// ── Editing ───────────────────────────────────────────────────────────────────

const editing = ref(false)
const editedContent = ref('')
const editedIsNsfw = ref(false)
const editLoading = ref(false)
const editError = ref<string[]>([])

function startEditing() {
  editing.value = true
  editedContent.value = data.value.markdown
  editedIsNsfw.value = !!data.value.is_nsfw
}

function endEditing() {
  editing.value = false
  editedContent.value = ''
  editedIsNsfw.value = false
  editError.value = []
}

async function submitEdit() {
  if (editedContent.value.trim().length === 0) {
    editError.value = ['You must provide a message']
    return
  }

  editLoading.value = true

  // Resolve any plain-text @username mentions that were typed in plain-text
  // mode - the RichTextEditor's handleSubmit does this automatically, but the
  // edit modal calls supabase directly and bypasses that path.
  const resolvedMarkdown = await resolvePlainTextMentions(editedContent.value, supabase)

  const res = await supabase
    .from('discussion_replies')
    .update({ markdown: resolvedMarkdown, is_nsfw: editedIsNsfw.value })
    .eq('id', data.value.id)
    .single()

  if (res.error) {
    editError.value = [res.error.message]
  }
  else {
    data.value.markdown = resolvedMarkdown
    data.value.is_nsfw = editedIsNsfw.value
    data.value.modified_at = dayjs().toISOString()
    data.value.modified_by = userId.value ?? data.value.modified_by
    _showNSFWWarning.value = editedIsNsfw.value
    endEditing()
  }

  editLoading.value = false
}

watch(editedContent, () => editError.value = [])

// ── Reporting ─────────────────────────────────────────────────────────────────

const showReportModal = ref(false)

// ── Toolbar timestamps ────────────────────────────────────────────────────────

const postedAtFormatted = computed(() => dayjs(data.value.created_at).fromNow())
const editedAtFormatted = computed(() => {
  if (data.value.modified_at === data.value.created_at)
    return null
  return dayjs(data.value.modified_at).fromNow()
})

// ── Breakpoint ────────────────────────────────────────────────────────────────

const isMobile = useBreakpoint('<s')

// ── Reactions ─────────────────────────────────────────────────────────────────

const { displayReactions, toggleReaction } = useReactions({
  table: 'discussion_replies',
  rowId: data.value.id,
  initialReactions: data.value.reactions,
})
</script>

<template>
  <div class="discussion-comment">
    <Flex y-center x-between>
      <Flex y-center x-start>
        <UserAvatar size="s" :user-id="data.created_by" show-preview linked />
        <UserName size="m" show-preview :user-id="data.created_by" />
        <Tooltip v-if="timestamps" :delay="500">
          <p class="discussion-comment__timestamp">
            {{ dayjs(data.created_at).fromNow() }}
            <span v-if="data.modified_at !== data.created_at" class="discussion-comment__edited">(edited)</span>
          </p>
          <template #tooltip>
            <p>{{ dayjs(data.created_at).format('MMM D, YYYY [at] h:mm A') }}</p>
            <p v-if="data.modified_at !== data.created_at">
              Edited {{ dayjs(data.modified_at).format('MMM D, YYYY [at] h:mm A') }}{{ modifierId && modifierUser ? ` by ${modifierUser.username}` : '' }}
            </p>
          </template>
        </Tooltip>
        <button v-if="threadReplyCount && threadReplyCount > 0 && !isMobile" class="discussion-comment__reply-count" @click.stop="emit('openReplies')">
          {{ threadReplyCount }} {{ threadReplyCount === 1 ? 'reply' : 'replies' }}
        </button>
      </Flex>

      <!-- Mobile: reaction button (only when no reactions exist) + three-dot trigger -->
      <Flex v-if="isMobile" y-center gap="xxs">
        <ReactionsSelect v-if="userId && displayReactions.length === 0" @reaction="(emote) => toggleReaction(emote)">
          <template #default="{ toggle }">
            <Button size="s" square plain @click="toggle">
              <Icon name="ph:smiley-bold" />
            </Button>
          </template>
        </ReactionsSelect>
        <DiscussionActionsToolbar
          :data="data"
          :user-id="userId"
          :current-user-data="currentUserData"
          :can-bypass-lock="canBypassLock"
          :can-mark-offtopic="canMarkOfftopic"
          :offtopic-loading="offtopicLoading"
          :loading-deletion="loadingDeletion"
          :show-n-s-f-w-warning="showNSFWWarning"
          :posted-at="postedAtFormatted"
          :edited-at="editedAtFormatted"
          :modifier-id="modifierId"
          @reply="setReplyToComment(data)"
          @copy-link="emit('copyLink')"
          @start-editing="startEditing"
          @delete="showDeleteModal = true"
          @toggle-offtopic="handleToggleOfftopic"
          @report="showReportModal = true"
        />
      </Flex>
    </Flex>

    <Tooltip v-if="data.reply && viewMode !== 'threaded'" :delay="750">
      <button class="discussion-comment__reply" :class="{ 'discussion-comment__reply--me': data.reply.created_by === currentUserData?.id }" @click="emit('scrollReply')">
        <Icon name="ph:arrow-elbow-up-right" />
        <p v-if="data.reply.created_by !== currentUserData?.id" class="discussion-comment__reply-user">
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

    <!-- NSFW gate -->
    <button v-if="showNSFWWarning" class="discussion-comment__nsfw" @click="showNSFWWarning = false">
      <Icon class="text-color-accent" name="ph:warning" />
      <p>Potentially sensitive content - click to reveal</p>
    </button>

    <MDRenderer v-else :md="data.markdown" skeleton-height="24px" />

    <Flex v-if="displayReactions.length > 0" y-center x-start gap="xxs" class="discussion-comment__reactions">
      <ReactionsList :reactions="displayReactions" :disabled="!userId" @toggle="(emote, provider) => toggleReaction(emote, provider)" />
      <ReactionsSelect v-if="userId" @reaction="(emote) => toggleReaction(emote)" />
    </Flex>

    <div class="discussion-comment__actions">
      <ReactionsSelect v-if="userId && !isMobile" @reaction="(emote) => toggleReaction(emote)">
        <template #default="{ toggle }">
          <Button size="s" square @click="toggle">
            <Tooltip>
              <Icon name="ph:smiley-bold" />
              <template #tooltip>
                <p>Add reactions</p>
              </template>
            </Tooltip>
          </Button>
        </template>
      </ReactionsSelect>

      <!-- Desktop floating actions (hidden on mobile - toolbar is in the header row instead) -->
      <DiscussionActionsToolbar
        v-if="!isMobile"
        :data="data"
        :user-id="userId"
        :current-user-data="currentUserData"
        :can-bypass-lock="canBypassLock"
        :can-mark-offtopic="canMarkOfftopic"
        :offtopic-loading="offtopicLoading"
        :loading-deletion="loadingDeletion"
        :show-n-s-f-w-warning="showNSFWWarning"
        :posted-at="postedAtFormatted"
        :edited-at="editedAtFormatted"
        :modifier-id="modifierId"
        @reply="setReplyToComment(data)"
        @copy-link="emit('copyLink')"
        @start-editing="startEditing"
        @delete="showDeleteModal = true"
        @toggle-offtopic="handleToggleOfftopic"
        @report="showReportModal = true"
      />
    </div>

    <ConfirmModal
      :open="showDeleteModal"
      :confirm-loading="loadingDeletion"
      title="Delete comment"
      description="Please confirm the deletion. This action cannot be undone."
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

    <!-- Edit modal -->
    <Modal :open="editing" centered scrollable size="m" @close="endEditing">
      <template #header>
        <h3>Edit comment</h3>
      </template>

      <Alert v-if="data.reply" icon-align="start" class="mb-s">
        <MarkdownPreview :markdown="data.reply.markdown" :max-length="164" />
      </Alert>

      <RichTextEditor
        v-model="editedContent"
        :errors="editError"
        :media-context="currentUserData ? `${data.discussion_id}/${currentUserData.id}` : undefined"
        :media-bucket-id="FORUMS_BUCKET_ID"
        min-height="128px"
        show-attachment-button
        placeholder="Edit your comment. Do not leave it empty!"
        class="mb-xs"
      />

      <template #footer>
        <Flex gap="s" x-between y-center>
          <Switch v-model="editedIsNsfw" label="NSFW" />
          <Flex gap="s">
            <Button plain :inert="editLoading" @click="endEditing">
              Cancel
            </Button>
            <Button variant="accent" :inert="editLoading" :loading="editLoading" @click="submitEdit">
              Update
            </Button>
          </Flex>
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

<style scoped lang="scss">
.discussion-comment {
  display: flex;
  flex-direction: column;
  padding-block: var(--space-xxs);
  margin-block: var(--space-xs);

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

  &:has(.reactions-anchor-active),
  &:hover {
    .discussion-comment__actions {
      opacity: 1;
      z-index: 10;
      visibility: visible;
    }
  }

  &__nsfw {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    margin-left: 40px;
    margin-block: var(--space-xxs);
    padding: var(--space-xxs) var(--space-s);
    border-radius: var(--border-radius-m);
    background-color: var(--color-bg-raised);
    color: var(--color-text-light);
    font-size: var(--font-size-s);
    transition: var(--transition-fast);
    width: fit-content;

    &:hover {
      background-color: var(--color-button-gray-hover);
    }
  }

  &__bottom {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    padding-left: 40px;
    margin-top: var(--space-xxs);
  }

  &__timestamp {
    font-size: var(--font-size-xs);
    color: var(--color-text-lighter);
    flex-shrink: 0;
  }

  &__reply-count {
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    font-size: var(--font-size-xs);
    color: var(--color-text-lighter);
    transition: color var(--transition-fast);

    &:hover {
      color: var(--color-text);
    }
  }

  &__edited {
    font-size: inherit;
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
    padding: 2px var(--space-xs);
    margin-left: 40px;
    gap: 4px;
    margin-bottom: 4px;
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

  &__reactions {
    margin-left: 40px;
    margin-top: 2px;
  }
}
</style>
