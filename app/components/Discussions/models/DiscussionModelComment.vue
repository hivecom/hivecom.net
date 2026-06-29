<script setup lang="ts">
import type { Comment, DiscussionSettings, ProvidedDiscussion, RawComment } from '../Discussion.types'
import type { Tables } from '@/types/database.overrides'
import { Alert, Badge, Button, Card, Flex, Modal, Switch, Tooltip } from '@dolanske/vui'
import { defineAsyncComponent, ref } from 'vue'
import DiscussionActionsToolbar from '@/components/Discussions/DiscussionActionsToolbar.vue'
import ModalDeleteReply from '@/components/Discussions/ModalDeleteReply.vue'
import { resolvePlainTextMentions } from '@/components/Editor/plugins/mentions'
import ReactionsList from '@/components/Reactions/ReactionsList.vue'
import ReactionsSelect from '@/components/Reactions/ReactionsSelect.vue'
import ComplaintsManager from '@/components/Shared/ComplaintsManager.vue'
import ConfirmModal from '@/components/Shared/ConfirmModal.vue'
import CountDisplay from '@/components/Shared/CountDisplay.vue'
import MarkdownPreview from '@/components/Shared/MarkdownPreview.vue'
import MarkdownRenderer from '@/components/Shared/MarkdownRenderer.vue'
import UserAvatar from '@/components/Shared/UserAvatar.vue'
import UserDisplay from '@/components/Shared/UserDisplay.vue'
import UserName from '@/components/Shared/UserName.vue'
import { useDiscussionCache } from '@/composables/useDiscussionCache'
import { useEffectiveRole } from '@/composables/useEffectiveRole'
import { stripMarkdown } from '@/lib/markdownProcessors'
import { useBreakpoint } from '@/lib/mediaQuery'
import { FORUMS_BUCKET_ID } from '@/lib/storageAssets'
import { fromNow, fullDateTime } from '@/lib/utils/date'
import { DISCUSSION_KEYS } from '../Discussion.keys'

const props = defineProps<Props>()

const emit = defineEmits<{
  copyLink: []
  scrollReply: []
  openReplies: []
}>()

const RichTextEditor = defineAsyncComponent(() => import('@/components/Editor/RichTextEditor.vue'))

const markdownEditor = ref<InstanceType<typeof RichTextEditor> | null>(null)

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
const discussionCache = useDiscussionCache()

const { user: currentUserData } = useDataUser(userId, { includeRole: true })
const { isAdmin, role: effectiveRole } = useEffectiveRole()

const effectiveUserData = computed(() =>
  currentUserData.value ? { ...currentUserData.value, role: effectiveRole.value } : null,
)

const modifierId = computed(() => {
  const { modified_at, created_at, modified_by, created_by } = data.value
  if (modified_at === created_at || !modified_by || modified_by === created_by)
    return null
  return modified_by
})
const { user: modifierUser } = useDataUser(modifierId, { userTtl: 10 * 60 * 1000 })

const COMMENT_TRUNCATE = 96

const setReplyToComment = inject(DISCUSSION_KEYS.setReplyToComment) as (data: Comment) => void
const setQuoteOfComment = inject(DISCUSSION_KEYS.setQuoteOfComment) as (data: Comment) => void

// ── Off-topic ─────────────────────────────────────────────────────────────────

const canMarkOfftopic = inject(DISCUSSION_KEYS.canMarkOfftopic, ref(false))
const toggleOfftopic = inject(DISCUSSION_KEYS.toggleOfftopic) as (comment: Comment) => Promise<void>
const offtopicLoading = ref(false)

async function handleToggleOfftopic() {
  offtopicLoading.value = true
  await toggleOfftopic(data.value)
  offtopicLoading.value = false
}

const isPinned = computed(() => discussion?.value?.pinned_reply_id === data.value.id)
const pinnedLoading = ref(false)

async function handleTogglePin() {
  if (!discussion?.value || pinnedLoading.value)
    return

  pinnedLoading.value = true

  const nextValue = isPinned.value ? null : data.value.id
  const res = await supabase
    .from('discussions')
    .update({ pinned_reply_id: nextValue })
    .eq('id', discussion.value.id)
    .select('*')
    .single()

  if (!res.error && res.data && discussion.value) {
    discussion.value.pinned_reply_id = res.data.pinned_reply_id
    discussionCache.set(res.data as Tables<'discussions'>)
  }

  pinnedLoading.value = false
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
const forceDeleteComment = inject(DISCUSSION_KEYS.forceDeleteComment) as (id: string) => Promise<void>
const loadingDeletion = ref(false)
const showDeleteModal = ref(false)
const showForceDeleteModal = ref(false)
const loadingForceDeletion = ref(false)

function handleDeletion() {
  loadingDeletion.value = true
  deleteComment(data.value.id)
    .finally(() => {
      loadingDeletion.value = false
    })
}

function handleForceDeletion() {
  loadingForceDeletion.value = true
  forceDeleteComment(data.value.id)
    .finally(() => {
      loadingForceDeletion.value = false
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

  // Upload any pending blob-placeholder media before reading the markdown,
  // otherwise blob: URLs get persisted and render as missing media. The editor
  // surfaces its own error toast on failure, so we just abort here.
  const uploaded = await markdownEditor.value?.flushPendingUploads()
  if (uploaded === false) {
    editLoading.value = false
    return
  }

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
    data.value.modified_at = new Date().toISOString()
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

const postedAtFormatted = computed(() => fromNow(data.value.created_at))
const editedAtFormatted = computed(() => {
  if (data.value.modified_at === data.value.created_at)
    return null
  return fromNow(data.value.modified_at)
})

// ── Breakpoint ────────────────────────────────────────────────────────────────

const isMobile = useBreakpoint('<s')

// ── Reactions ─────────────────────────────────────────────────────────────────

const { displayReactions, toggleReaction } = useReactions({
  table: 'discussion_replies',
  rowId: data.value.id,
  initialReactions: data.value.reactions,
})

// ── Lazy-load missing reply ───────────────────────────────────────────────────

// If the comment has a reply_to_id but the reply wasn't joined in the initial
// query (e.g. it wasn't in the loaded window), fetch it on demand.
const fetchedReply = ref<RawComment | null>(null)
const replyLoading = ref(false)

const resolvedReply = computed(() => data.value.reply ?? fetchedReply.value)

watch(
  () => data.value.reply_to_id,
  async (replyToId) => {
    if (!replyToId || data.value.reply != null || fetchedReply.value != null || replyLoading.value)
      return
    replyLoading.value = true
    const { data: row } = await supabase
      .from('discussion_replies')
      .select('id, created_at, created_by, modified_at, modified_by, discussion_id, markdown, reply_to_id, is_deleted, is_nsfw, is_offtopic, reactions')
      .eq('id', replyToId)
      .single()
    if (row)
      fetchedReply.value = row as import('../Discussion.types').RawComment
    replyLoading.value = false
  },
  { immediate: true },
)
</script>

<template>
  <div class="discussion-comment">
    <!-- Desktop floating actions (hover-revealed) - first child so sticky works from top -->
    <div v-if="!isMobile && !data.is_deleted" class="discussion-forum__actions-anchor discussion-comment__actions-anchor">
      <div class="discussion-comment__actions">
        <ReactionsSelect v-if="userId && !data.is_deleted" @reaction="(emote) => toggleReaction(emote)">
          <template #default="{ toggle }">
            <Tooltip>
              <Button size="s" square @click="toggle">
                <Icon name="ph:smiley-bold" />
              </Button>
              <template #tooltip>
                <p>Add reactions</p>
              </template>
            </Tooltip>
          </template>
        </ReactionsSelect>

        <DiscussionActionsToolbar
          :data="data"
          :user-id="userId"
          :current-user-data="effectiveUserData"
          :can-bypass-lock="canBypassLock"
          :can-mark-offtopic="canMarkOfftopic"
          :offtopic-loading="offtopicLoading"
          :loading-deletion="loadingDeletion"
          :pinned-loading="pinnedLoading"
          :show-n-s-f-w-warning="showNSFWWarning"
          :posted-at="postedAtFormatted"
          :edited-at="editedAtFormatted"
          :modifier-id="modifierId"
          @reply="setReplyToComment(data)"
          @quote="setQuoteOfComment(data)"
          @copy-link="emit('copyLink')"
          @start-editing="startEditing"
          @delete="showDeleteModal = true"
          @toggle-offtopic="handleToggleOfftopic"
          @toggle-pin="handleTogglePin"
          @report="showReportModal = true"
        />
      </div>
    </div>

    <Flex y-center x-between>
      <Flex y-center x-start expand>
        <template v-if="data.is_deleted">
          <UserAvatar size="s" class="discussion-comment__deleted-avatar" />
        </template>
        <template v-else>
          <UserAvatar size="s" :user-id="data.created_by" show-preview linked />
          <UserName size="m" show-preview :user-id="data.created_by" />
        </template>
        <Tooltip v-if="timestamps" :delay="500">
          <p class="discussion-comment__timestamp">
            {{ fromNow(data.created_at) }}
            <span v-if="data.modified_at !== data.created_at" class="discussion-comment__edited">(edited)</span>
          </p>
          <template #tooltip>
            <p>{{ fullDateTime(data.created_at) }}</p>
            <p v-if="data.modified_at !== data.created_at">
              Edited {{ fullDateTime(data.modified_at) }}{{ modifierId && modifierUser ? ` by ${modifierUser.username}` : '' }}
            </p>
          </template>
        </Tooltip>
        <button v-if="threadReplyCount && threadReplyCount > 0 && !isMobile" class="discussion-comment__reply-count text-xs" @click.stop="emit('openReplies')">
          <CountDisplay class="text-xs" :value="threadReplyCount ?? 0" /> {{ threadReplyCount === 1 ? 'reply' : 'replies' }}
        </button>

        <Badge v-if="isPinned" variant="accent" size="s" style="margin-right:2px" filled>
          <Icon name="ph:push-pin" class="text-color-invert" />
          <template v-if="!isMobile">
            Pinned
          </template>
        </Badge>
      </Flex>

      <!-- Mobile: reaction button (only when no reactions exist) + three-dot trigger -->
      <Flex v-if="isMobile && !data.is_deleted" y-center gap="xxs">
        <ReactionsSelect v-if="userId && !data.is_deleted && displayReactions.length === 0" @reaction="(emote) => toggleReaction(emote)">
          <template #default="{ toggle }">
            <Button size="s" square plain @click="toggle">
              <Icon name="ph:smiley-bold" />
            </Button>
          </template>
        </ReactionsSelect>
        <DiscussionActionsToolbar
          :data="data"
          :user-id="userId"
          :current-user-data="effectiveUserData"
          :can-bypass-lock="canBypassLock"
          :can-mark-offtopic="canMarkOfftopic"
          :offtopic-loading="offtopicLoading"
          :loading-deletion="loadingDeletion"
          :pinned-loading="pinnedLoading"
          :show-n-s-f-w-warning="showNSFWWarning"
          :posted-at="postedAtFormatted"
          :edited-at="editedAtFormatted"
          :modifier-id="modifierId"
          @reply="setReplyToComment(data)"
          @quote="setQuoteOfComment(data)"
          @copy-link="emit('copyLink')"
          @start-editing="startEditing"
          @delete="showDeleteModal = true"
          @toggle-offtopic="handleToggleOfftopic"
          @toggle-pin="handleTogglePin"
          @report="showReportModal = true"
        />
      </Flex>
    </Flex>

    <template v-if="(resolvedReply != null || replyLoading) && viewMode !== 'threaded'">
      <div v-if="replyLoading && resolvedReply == null" class="discussion-comment__reply">
        <Icon name="ph:arrow-elbow-up-right" />
        <p class="discussion-comment__reply-user text-color-lighter">
          Loading...
        </p>
      </div>
      <Tooltip v-else-if="resolvedReply && !resolvedReply.is_deleted" :delay="750" :disabled="resolvedReply.markdown.length <= COMMENT_TRUNCATE">
        <button class="discussion-comment__reply" :class="{ 'discussion-comment__reply--me': resolvedReply.created_by === currentUserData?.id }" @click="emit('scrollReply')">
          <Icon name="ph:arrow-elbow-up-right" />
          <p v-if="resolvedReply.created_by !== currentUserData?.id" class="discussion-comment__reply-user">
            <UserDisplay class="inline-block" size="s" :user-id="resolvedReply.created_by" hide-avatar />:
          </p>
          <p v-else class="discussion-comment__reply-user">
            You:
          </p>
          <p class="text-overflow-1">
            {{ stripMarkdown(resolvedReply.markdown, 512) }}
          </p>
        </button>
        <template #tooltip>
          <MarkdownRenderer
            style="max-width: 256px"
            :md="resolvedReply.markdown"
            skeleton-height="0px"
          />
        </template>
      </Tooltip>
      <div v-else-if="resolvedReply" class="discussion-comment__reply discussion-comment__reply--deleted">
        <Icon name="ph:trash" />
        <p class="discussion-comment__reply-user">
          Original reply was deleted
        </p>
      </div>
    </template>

    <!-- Tombstone: soft-deleted reply -->
    <p v-if="data.is_deleted" class="discussion-comment__deleted">
      <Flex y-center x-start gap="xxs">
        <Tooltip v-if="isAdmin" placement="top">
          <Button plain square size="s" class="discussion-comment__force-delete-icon" :loading="loadingForceDeletion" @click.stop="showForceDeleteModal = true">
            <Icon name="ph:trash" />
          </Button>
          <template #tooltip>
            <p>Permanently delete</p>
          </template>
        </Tooltip>
        <Icon v-else name="ph:trash" />
        This reply was deleted.
      </Flex>
    </p>

    <template v-else>
      <!-- NSFW gate -->
      <button v-if="showNSFWWarning" class="discussion-comment__nsfw" @click="showNSFWWarning = false">
        <Icon class="text-color-accent" name="ph:warning" />
        <p>Potentially sensitive content - click to reveal</p>
      </button>

      <MarkdownRenderer v-else :md="data.markdown" skeleton-height="24px" />
    </template>

    <Flex v-if="!data.is_deleted && displayReactions.length > 0" y-center x-start gap="xxs" class="discussion-comment__reactions">
      <ReactionsList :reactions="displayReactions" :disabled="!userId" @toggle="toggleReaction" />
      <ReactionsSelect v-if="userId" @reaction="toggleReaction" />
    </Flex>

    <!-- Force delete confirmation modal (admin only) -->
    <ModalDeleteReply
      :open="showForceDeleteModal"
      :loading="loadingForceDeletion"
      @close="showForceDeleteModal = false"
      @confirm="handleForceDeletion"
    />

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
        <MarkdownRenderer :md="data.markdown" skeleton-height="0px" />
      </Card>
    </ConfirmModal>

    <!-- Edit modal -->
    <Modal :open="editing" centered scrollable size="m" :can-dismiss="false" @close="endEditing">
      <template #header>
        <h4>Edit comment</h4>
      </template>

      <Alert v-if="resolvedReply" icon-align="start" class="mb-s">
        <MarkdownPreview :markdown="resolvedReply.markdown" :max-length="164" />
      </Alert>

      <RichTextEditor
        ref="markdownEditor"
        v-model="editedContent"
        :errors="editError"
        :media-context="currentUserData ? `${data.discussion_id}/${currentUserData.id}` : undefined"
        :media-bucket-id="FORUMS_BUCKET_ID"
        min-height="128px"
        show-expand-button
        always-show-expand-button
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
    left: 34px;
    top: 4px;
    bottom: 0px;
    right: 0;

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

    .discussion-comment__actions-anchor {
      z-index: var(--z-active);
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

  &__deleted {
    margin-left: 40px;
    margin-right: 4px;
    color: var(--color-text-lighter);
    font-size: var(--font-size-s);
    font-style: italic;
    padding: var(--space-xxs) 0 var(--space-xs);

    .iconify {
      opacity: 0.5;
    }
  }

  &__force-delete-icon {
    color: inherit !important;

    &:hover .iconify {
      opacity: 1;
    }
  }

  &__deleted-avatar {
    opacity: 0.25;
    filter: grayscale(1);
  }

  &__reply {
    display: flex;
    align-items: center;
    text-align: left;
    border-radius: var(--border-radius-pill);
    background-color: var(--color-bg-raised);
    position: relative;
    width: fit-content;
    padding: 2px var(--space-xs);
    margin-left: 40px;
    gap: 4px;
    margin-bottom: 4px;
    cursor: pointer;
    transition: var(--transition-fast);
    max-width: 328px;

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

    &--deleted {
      border-radius: var(--border-radius-pill);
      cursor: default;
      pointer-events: none;

      :deep(.user-display__link .user-display__username),
      p,
      .iconify {
        color: var(--color-text-lighter) !important;
      }
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

  &__actions-anchor {
    position: absolute;
    top: var(--space-xxs);
    right: 0;
    min-height: 0;
    max-height: 0;
    overflow: visible;
    z-index: 10;
    transform: translateY(-50%);
  }

  &__actions {
    display: flex;
    gap: 3px;
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
