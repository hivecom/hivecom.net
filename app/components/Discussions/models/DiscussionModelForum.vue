<script setup lang="ts">
import type { Comment, ProvidedDiscussion } from '../Discussion.types'
import { Alert, Avatar, Badge, Button, Card, Divider, Flex, Modal, Switch, Tooltip } from '@dolanske/vui'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import DiscussionActionsToolbar from '@/components/Discussions/DiscussionActionsToolbar.vue'
import { resolvePlainTextMentions } from '@/components/Editor/plugins/mentions'
import RichTextEditor from '@/components/Editor/RichTextEditor.vue'
import BannerDisplay from '@/components/Profile/Banner/BannerDisplay.vue'
import ReactionsList from '@/components/Reactions/ReactionsList.vue'
import ReactionsSelect from '@/components/Reactions/ReactionsSelect.vue'
import BadgeCircle from '@/components/Shared/BadgeCircle.vue'
import ComplaintsManager from '@/components/Shared/ComplaintsManager.vue'
import ConfirmModal from '@/components/Shared/ConfirmModal.vue'
import CountDisplay from '@/components/Shared/CountDisplay.vue'
import MarkdownPreview from '@/components/Shared/MarkdownPreview.vue'
import MarkdownRenderer from '@/components/Shared/MarkdownRenderer.vue'
import TinyBadge from '@/components/Shared/TinyBadge.vue'
import SharedUserAvatar from '@/components/Shared/UserAvatar.vue'
import UserName from '@/components/Shared/UserName.vue'
import UserPreviewHover from '@/components/Shared/UserPreviewHover.vue'
import UserRole from '@/components/Shared/UserRole.vue'
import { useBadgeDiscussionReplyCount } from '@/composables/useBadgeDiscussionReplyCount'
import { useBulkDataUser } from '@/composables/useDataUser'
import { useDataUserDiscussionCount } from '@/composables/useDataUserDiscussionCount'
import { extractMentionIds } from '@/lib/markdownProcessors'
import { useBreakpoint } from '@/lib/mediaQuery'
import { FORUMS_BUCKET_ID } from '@/lib/storageAssets'
import { getCountryInfo } from '@/lib/utils/country'
import { DISCUSSION_KEYS } from '../Discussion.keys'

const props = defineProps<Props>()

const emit = defineEmits<{
  copyLink: []
  scrollReply: []
  interact: []
  openReplies: []
}>()

dayjs.extend(relativeTime)

interface Props {
  data: Comment
  threadReplyCount?: number
}

const data = toRef(props, 'data')

const userId = useUserId()
const supabase = useSupabaseClient()
const currentUser = useSupabaseUser()

const { user: currentUserData } = useDataUser(userId, { includeRole: true })

const isMobile = useBreakpoint('<s')

const viewMode = inject(DISCUSSION_KEYS.viewMode, ref<'flat' | 'threaded'>('flat'))
const discussion = inject(DISCUSSION_KEYS.discussion) as ProvidedDiscussion
const canBypassLock = inject(DISCUSSION_KEYS.canBypassLock, ref(false))

const authorId = computed(() => data.value.created_by ?? null)
const { count: discussionCount } = useDataUserDiscussionCount(authorId)
const { count: replyCount } = useBadgeDiscussionReplyCount(authorId)

const { user } = useDataUser(data.value.created_by!, {
  includeRole: true,
  includeAvatar: true,
  userTtl: 10 * 60 * 1000,
  avatarTtl: 30 * 60 * 1000,
})

// Role variant for TinyBadge on mobile
const ROLE_SEPARATOR_RE = /[-_]/g
const roleVariant = computed(() => {
  switch (user.value?.role) {
    case 'admin': return 'danger'
    case 'moderator': return 'info'
    case 'music-bot': return 'warning'
    default: return 'success'
  }
})
const roleDisplay = computed(() => {
  const role = user.value?.role ?? 'user'
  return role
    .replace(ROLE_SEPARATOR_RE, ' ')
    .split(' ')
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
})
const shouldDisplayRole = computed(() => user.value?.role && user.value.role !== 'user')

// Only fetch modifier data when the message was edited by someone other than the author
const modifierId = computed(() => {
  const { modified_at, created_at, modified_by, created_by } = data.value
  if (modified_at === created_at || !modified_by || modified_by === created_by)
    return null
  return modified_by
})
const { user: modifierUser } = useDataUser(modifierId, { userTtl: 10 * 60 * 1000 })

const country = computed(() => getCountryInfo(user.value?.country))

const setReplyToComment = inject(DISCUSSION_KEYS.setReplyToComment) as (data: Comment) => void
const setQuoteOfComment = inject(DISCUSSION_KEYS.setQuoteOfComment) as (data: Comment) => void

// ── Lazy-load missing reply ───────────────────────────────────────────────────

// If the comment has a reply_to_id but the reply wasn't joined in the initial
// query (e.g. it wasn't in the loaded window), fetch it on demand.
const fetchedReply = ref<import('../Discussion.types').RawComment | null>(null)
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

const replyMentionIds = computed(() => extractMentionIds(resolvedReply.value?.markdown ?? ''))
const { users: replyMentionUsers } = useBulkDataUser(replyMentionIds)
const replyMentionLookup = computed<Record<string, string>>(() => {
  const lookup: Record<string, string> = {}
  for (const [id, u] of replyMentionUsers.value.entries()) {
    if (u?.username)
      lookup[id] = u.username
  }
  return lookup
})

// ── Off-topic ────────────────────────────────────────────────────────────────

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
    .select('pinned_reply_id')
    .single()

  if (!res.error && discussion.value) {
    discussion.value.pinned_reply_id = res.data.pinned_reply_id
  }

  pinnedLoading.value = false
}

// Comment deletion
const deleteComment = inject(DISCUSSION_KEYS.deleteComment) as (id: string) => Promise<void>
const forceDeleteComment = inject(DISCUSSION_KEYS.forceDeleteComment) as (id: string) => Promise<void>
const loadingDeletion = ref(false)
const showDeleteModal = ref(false)
const showForceDeleteModal = ref(false)
const loadingForceDeletion = ref(false)

const isAdmin = computed(() => currentUserData.value?.role === 'admin')

function handleDeletion() {
  loadingDeletion.value = true
  deleteComment(data.value.id)
    .then(() => {
      emit('interact')
    })
    .finally(() => {
      loadingDeletion.value = false
    })
}

function handleForceDeletion() {
  loadingForceDeletion.value = true
  forceDeleteComment(data.value.id)
    .then(() => {
      emit('interact')
    })
    .finally(() => {
      loadingForceDeletion.value = false
    })
}

// When the parent thread's fullscreen NSFW overlay has already been dismissed
// (or warnings are disabled in settings), we skip the per-reply gate entirely.
const threadNsfwRevealed = inject(DISCUSSION_KEYS.threadNsfwRevealed, ref(false))
const _showNSFWWarning = ref(!!props.data.is_nsfw)
const showNSFWWarning = computed({
  get: () => !!data.value.is_nsfw && !threadNsfwRevealed.value && _showNSFWWarning.value,
  set: (val: boolean) => { _showNSFWWarning.value = val },
})

// ── Editing ─────────────────────────────────────────────────────────────────

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
}

// I couldn't get the damn timestamps to update for whatever reason. So this
// counter simply forces the timestamp element to re-render after each edit
const timestampUpdateKey = ref(0)

// Also run an update interval every 60 seconds to update timestamps
useIntervalFn(() => {
  timestampUpdateKey.value++
}, 60000)

async function submit() {
  if (editedContent.value.length > 0) {
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
      // NOTE (jan): For some reason the `res.data` was null after updating. So
      // for now I am updating the value automatically, but preferable the whole
      // comment object should get replaced by `res.data`

      data.value.markdown = resolvedMarkdown
      data.value.is_nsfw = editedIsNsfw.value
      data.value.modified_at = dayjs().toISOString()
      data.value.modified_by = currentUser.value?.id ?? null
      // Re-apply the NSFW warning if the user toggled it back on
      _showNSFWWarning.value = editedIsNsfw.value

      timestampUpdateKey.value++
    }

    editLoading.value = false
    endEditing()
  }
  else {
    editError.value = ['You must provide a message']
  }
}

watch(editedContent, () => editError.value = [])

// Reports
const showReportModal = ref(false)
const [DefineReusableUserInfo, UserInfo] = createReusableTemplate()

// Reactions
const { displayReactions, toggleReaction } = useReactions({
  table: 'discussion_replies',
  rowId: data.value.id,
  initialReactions: data.value.reactions,
})

// Formatted timestamps for the toolbar sheet
const postedAtFormatted = computed(() => dayjs(data.value.created_at).fromNow())
const editedAtFormatted = computed(() => {
  if (data.value.modified_at === data.value.created_at)
    return null
  return dayjs(data.value.modified_at).fromNow()
})
</script>

<template>
  <div
    class="discussion-forum"
    :class="{
      'discussion-forum--pinned': isPinned,
    }"
  >
    <!-- Reusable desktop author block (avatar + name stacked) -->
    <DefineReusableUserInfo>
      <Flex column x-center y-center gap="s">
        <SharedUserAvatar :user-id="data.created_by" size="l" linked />
        <Flex wrap gap="xxs" y-center x-center>
          <UserName :user-id="data.created_by" />
          <BadgeCircle v-if="data.created_by === discussion?.created_by">
            <span class="text-xxs text-color-light">OP</span>
          </BadgeCircle>
          <UserRole :user-id="data.created_by" />
        </Flex>
      </Flex>
    </DefineReusableUserInfo>

    <!-- Desktop: left column author panel -->
    <div v-if="!isMobile" class="discussion-forum__author" :class="{ 'discussion-forum__author--deleted': data.is_deleted }">
      <!-- Deleted reply: muted placeholder instead of real profile -->
      <template v-if="data.is_deleted">
        <Flex column x-center y-center gap="s">
          <Avatar size="m" class="discussion-forum__deleted-avatar" />
        </Flex>
      </template>

      <template v-else>
        <UserPreviewHover v-if="currentUser || user" :user-id="data.created_by">
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
        <p class="author-meta mt-xs text-color-lightest">
          <CountDisplay class="text-s" :value="discussionCount ?? 0" /> {{ (discussionCount ?? 0) === 1 ? 'discussion' : 'discussions' }} / <CountDisplay class="text-s" :value="replyCount ?? 0" /> {{ (replyCount ?? 0) === 1 ? 'reply' : 'replies' }}
        </p>
        <Divider v-if="user?.introduction || user?.created_at || country" />
        <p v-if="user?.introduction" class="text-s text-center">
          {{ user.introduction }}
        </p>
      </template>
    </div>

    <!-- Content column: single div always mounted, chrome switches via v-if -->
    <div class="discussion-forum__content">
      <!-- Desktop floating actions (hover-revealed) - must be first child for sticky to work from top -->
      <div v-if="!isMobile && !showNSFWWarning && !data.is_deleted" class="discussion-forum__actions-anchor">
        <div class="discussion-forum__actions">
          <ReactionsSelect v-if="userId" @reaction="(emote) => toggleReaction(emote)">
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

          <DiscussionActionsToolbar
            :data="data"
            :user-id="userId"
            :current-user-data="currentUserData"
            :can-bypass-lock="canBypassLock"
            :can-mark-offtopic="canMarkOfftopic"
            :offtopic-loading="offtopicLoading"
            :loading-deletion="loadingDeletion"
            :pinned-loading="pinnedLoading"
            :show-n-s-f-w-warning="showNSFWWarning"
            :posted-at="postedAtFormatted"
            :edited-at="editedAtFormatted"
            :modifier-id="modifierId"
            @reply="setReplyToComment(data); emit('interact')"
            @quote="setQuoteOfComment(data); emit('interact')"
            @copy-link="emit('copyLink'); emit('interact')"
            @start-editing="startEditing"
            @delete="showDeleteModal = true"
            @toggle-offtopic="handleToggleOfftopic"
            @toggle-pin="handleTogglePin"
            @report="showReportModal = true"
          />
        </div>
      </div>

      <!-- Mobile header: author + toolbar (only rendered on mobile) -->
      <div v-if="isMobile" class="discussion-forum__mobile-header">
        <!-- Deleted reply: muted placeholder -->
        <template v-if="data.is_deleted">
          <Flex gap="xs" y-center>
            <Avatar size="s" class="discussion-forum__deleted-avatar" />
          </Flex>
        </template>

        <template v-else>
          <UserPreviewHover v-if="currentUser || user" :user-id="data.created_by">
            <Flex gap="xs" y-center>
              <SharedUserAvatar :user-id="data.created_by" size="s" linked class="discussion-forum__mobile-avatar" />
              <Flex wrap gap="xxs" y-center>
                <UserName :user-id="data.created_by" size="s" />
                <BadgeCircle v-if="data.created_by === discussion?.created_by">
                  <span class="text-xxs text-color-light">OP</span>
                </BadgeCircle>
                <TinyBadge v-if="shouldDisplayRole" :variant="roleVariant">
                  {{ roleDisplay }}
                </TinyBadge>
              </Flex>
            </Flex>
          </UserPreviewHover>
          <Flex v-else gap="xs" y-center>
            <SharedUserAvatar :user-id="data.created_by" size="s" linked class="discussion-forum__mobile-avatar" />
            <Flex wrap gap="xxs" y-center>
              <UserName :user-id="data.created_by" size="s" show-preview />
              <BadgeCircle v-if="data.created_by === discussion?.created_by">
                <span class="text-xxs text-color-light">OP</span>
              </BadgeCircle>
              <TinyBadge v-if="shouldDisplayRole" :variant="roleVariant">
                {{ roleDisplay }}
              </TinyBadge>
            </Flex>
          </Flex>

          <TinyBadge v-if="isPinned" variant="accent" filled>
            <Icon name="ph:push-pin" class="text-color-invert" />
          </TinyBadge>

          <div class="flex-1" />
        </template>

        <DiscussionActionsToolbar
          v-if="!data.is_deleted"
          :data="data"
          :user-id="userId"
          :current-user-data="currentUserData"
          :can-bypass-lock="canBypassLock"
          :can-mark-offtopic="canMarkOfftopic"
          :offtopic-loading="offtopicLoading"
          :loading-deletion="loadingDeletion"
          :pinned-loading="pinnedLoading"
          :show-n-s-f-w-warning="showNSFWWarning"
          :posted-at="postedAtFormatted"
          :edited-at="editedAtFormatted"
          :modifier-id="modifierId"
          @reply="setReplyToComment(data); emit('interact')"
          @quote="setQuoteOfComment(data); emit('interact')"
          @copy-link="emit('copyLink'); emit('interact')"
          @start-editing="startEditing"
          @delete="showDeleteModal = true"
          @toggle-offtopic="handleToggleOfftopic"
          @toggle-pin="handleTogglePin"
          @report="showReportModal = true"
        />
      </div>

      <!-- Shared body: reply quote + markdown (mounted once, always) -->
      <div class="discussion-forum__body">
        <!-- Tombstone: soft-deleted reply -->
        <template v-if="data.is_deleted">
          <Flex expand x-between class="discussion-forum__deleted-row">
            <p class="discussion-forum__deleted">
              <Icon name="ph:trash" />
              This reply was deleted.
            </p>
            <Tooltip v-if="isAdmin" placement="top">
              <Button
                size="s"
                square
                plain
                variant="danger"
                :loading="loadingForceDeletion"
                class="discussion-forum__force-delete"
                @click.stop="showForceDeleteModal = true"
              >
                <Icon name="ph:trash-simple-bold" class="text-color-red" />
              </Button>
              <template #tooltip>
                <p>Permanently delete</p>
              </template>
            </Tooltip>
          </Flex>
        </template>

        <template v-else>
          <Badge v-if="isPinned && !isMobile" variant="accent" filled class="mb-s">
            <Icon name="ph:push-pin" class="text-color-invert" />
            Pinned
          </Badge>

          <!-- Reply information -->
          <template v-if="(resolvedReply != null || replyLoading) && viewMode !== 'threaded'">
            <Alert v-if="replyLoading && resolvedReply == null" icon-align="start" class="discussion-forum__reply">
              <p class="discussion-forum__reply-user text-color-lighter">
                Loading...
              </p>
            </Alert>
            <Alert v-else-if="resolvedReply && !resolvedReply.is_deleted" icon-align="start" role="button" class="discussion-forum__reply" @click="emit('scrollReply')">
              <p v-if="resolvedReply.created_by !== currentUserData?.id" class="discussion-forum__reply-user">
                <UserName size="s" show-preview :user-id="resolvedReply.created_by" /> wrote:
              </p>
              <p v-else class="discussion-forum__reply-user">
                You wrote:
              </p>
              <MarkdownPreview class="text-color-light" :markdown="resolvedReply.markdown" :mention-lookup="replyMentionLookup" :max-length="164" />
            </Alert>
            <div v-else-if="resolvedReply" class="discussion-forum__reply discussion-forum__reply--deleted">
              <Icon name="ph:trash" />
              <p class="discussion-forum__reply-user">
                Original reply was deleted
              </p>
            </div>
          </template>

          <!-- Content warning -->
          <button v-if="showNSFWWarning" class="discussion-forum__nsfw" @click="showNSFWWarning = false">
            <Icon class="text-color-accent" name="ph:caret-down" />
            <p>Click to reveal potentially sensitive content</p>
            <Icon class="text-color-accent" name="ph:caret-up" />
          </button>

          <!-- Content markdown - rendered once regardless of layout -->
          <MarkdownRenderer
            v-else
            :md="data.markdown"
            :skeleton-height="128"
          />
        </template>
      </div>

      <!-- Desktop bottom row: timestamps + reactions (only rendered on desktop, hidden when deleted) -->
      <template v-if="!isMobile && !data.is_deleted">
        <div class="flex-1" />

        <Flex :key="timestampUpdateKey" wrap y-end x-between class="discussion-forum__bottom-row">
          <p class="discussion-forum__timestamp">
            <Tooltip :delay="500">
              <span>Posted {{ dayjs(data.created_at).fromNow() }}</span>
              <template #tooltip>
                <p>{{ dayjs(data.created_at).format('MMM D, YYYY [at] h:mm A') }}</p>
              </template>
            </Tooltip>
            <span v-if="data.modified_at !== data.created_at">
              <Tooltip :delay="500">
                <span>{{ `Edited ${dayjs(data.modified_at).fromNow()}` }}</span>
                <template #tooltip>
                  <p>{{ dayjs(data.modified_at).format('MMM D, YYYY [at] h:mm A') }}</p>
                </template>
              </Tooltip>
              <template v-if="modifierId && modifierUser">
                by <UserName size="s" show-preview :user-id="modifierId" />
              </template>
            </span>
            <button v-if="threadReplyCount && threadReplyCount > 0" class="discussion-forum__reply-count" @click.stop="emit('openReplies')">
              <CountDisplay :value="threadReplyCount ?? 0" /> {{ threadReplyCount === 1 ? 'reply' : 'replies' }}
            </button>
          </p>

          <div class="discussion-forum__reactions">
            <ReactionsList v-if="displayReactions.length > 0" :reactions="displayReactions" :disabled="!userId" @toggle="toggleReaction" />
            <ReactionsSelect v-if="userId && !showNSFWWarning && displayReactions.length > 0" @reaction="toggleReaction" />
          </div>
        </Flex>
      </template>

      <!-- User signature / banner — shown below the post body on desktop only -->
      <BannerDisplay v-if="!isMobile && !data.is_deleted && !showNSFWWarning" :user="user ?? null" />

      <!-- Mobile footer: reply count + reactions (only rendered on mobile when there's content) -->
      <div v-if="!data.is_deleted && isMobile && ((threadReplyCount && threadReplyCount > 0) || displayReactions.length > 0 || (userId && !showNSFWWarning))" class="discussion-forum__mobile-footer">
        <div class="discussion-forum__mobile-footer-row">
          <button v-if="threadReplyCount && threadReplyCount > 0" class="discussion-forum__reply-count" @click.stop="emit('openReplies')">
            <CountDisplay :value="threadReplyCount ?? 0" /> {{ threadReplyCount === 1 ? 'reply' : 'replies' }}
          </button>
          <!-- Empty div makes sure reactions are forced to flex end -->
          <div v-else />
          <div class="discussion-forum__reactions">
            <ReactionsList v-if="displayReactions.length > 0" :reactions="displayReactions" :disabled="!userId" @toggle="toggleReaction" />
            <ReactionsSelect v-if="userId && !showNSFWWarning" @reaction="toggleReaction" />
          </div>
        </div>
        <!-- User banner sits on its own full-width row below reply count + reactions -->
        <BannerDisplay v-if="!showNSFWWarning" :user="user ?? null" flush />
      </div>
    </div>

    <!-- Force delete confirmation modal (admin only) -->
    <Modal
      :open="showForceDeleteModal"
      size="s"
      centered
      @close="showForceDeleteModal = false"
    >
      <template #header>
        <h3>Permanently delete reply</h3>
      </template>

      <Flex column gap="m">
        <Alert variant="danger" icon-align="start">
          <p><strong>This cannot be undone.</strong> The reply row will be hard-deleted from the database.</p>
        </Alert>
        <p class="text-color-light text-m text-justified">
          If other replies quote or reply to this one, they will become orphaned - their reply context will break and the thread flow may appear confusing to readers. Force deletion is <strong class="text-m">heavily discouraged</strong> unless the reply has no dependents.
        </p>
      </Flex>

      <template #footer>
        <Flex x-end gap="s">
          <Button plain :inert="loadingForceDeletion" @click="showForceDeleteModal = false">
            Cancel
          </Button>
          <Button variant="danger" :loading="loadingForceDeletion" @click="handleForceDeletion">
            Permanently delete
          </Button>
        </Flex>
      </template>
    </Modal>

    <!-- Delete confirmation modal -->
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
        <MarkdownRenderer :md="data.markdown" skeleton-height="48px" />
      </Card>
    </ConfirmModal>

    <!-- Edit Modal -->
    <Modal :open="editing" centered scrollable size="l" :can-dismiss="false" @close="editing = false" @keydown.ctrl.enter.prevent="submit" @keydown.meta.enter.prevent="submit">
      <template #header>
        <h3>Edit post</h3>
        <p class="text-color-light">
          Avoid writing offensive things.
        </p>
      </template>

      <RichTextEditor
        v-model="editedContent"
        :errors="editError"
        :media-context="currentUserData ? `${data.discussion_id}/${currentUserData.id}` : undefined"
        :media-bucket-id="FORUMS_BUCKET_ID"
        show-expand-button
        show-attachment-button
        min-height="196px"
        class="mb-xs"
        placeholder="Edit your message. Do not leave it empty!"
      />

      <template #footer>
        <Flex gap="s" x-between y-center>
          <Switch v-model="editedIsNsfw" label="NSFW" />
          <Flex gap="s">
            <Button plain :inert="editLoading" @click="endEditing">
              Cancel
            </Button>
            <Button variant="accent" :inert="editLoading" :loading="editLoading" @click="submit">
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
  width: 100%;

  &:has(.reactions-anchor-active),
  &:hover {
    .discussion-forum__actions {
      opacity: 1;
      z-index: 10;
      visibility: visible;
    }

    .discussion-forum__actions-anchor {
      z-index: var(--z-active);
    }
  }

  &--highlight .discussion-forum__content {
    background-color: color-mix(in srgb, var(--color-accent) 5%, transparent);
  }

  &--pinned {
    border-color: var(--color-border-strong);
    box-shadow: 0 0 16px 1px color-mix(in srgb, var(--color-accent) 25%, transparent);
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
    margin-bottom: var(--space-xs);

    &:hover {
      background-color: var(--color-button-gray);
      gap: 0;
    }
  }

  &__bottom-row {
    margin-top: var(--space-s);
    gap: var(--space-xxs);
    min-height: 32px;
    align-items: flex-end;
  }

  &__mobile-header {
    display: flex;
    gap: var(--space-s);
    align-items: center;
    justify-content: space-between;
    padding: var(--space-s) var(--space-m);
    border-bottom: 1px solid var(--color-border);
    background-color: var(--color-bg);
    border-top-left-radius: var(--border-radius-m);
    border-top-right-radius: var(--border-radius-m);
  }

  &__mobile-footer {
    display: flex;
    flex-direction: column;
    gap: var(--space-xxs);
    padding: var(--space-s) var(--space-m);
    border-top: 1px solid var(--color-border);
    background-color: var(--color-bg-medium);
    border-bottom-left-radius: var(--border-radius-m);
    border-bottom-right-radius: var(--border-radius-m);
  }

  &__mobile-footer-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-xxs);
  }

  &__body {
    flex: 1;
  }

  &__reactions {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: var(--space-xxs);
    max-width: 100%;

    :deep(.reactions) {
      margin-left: 0;
      flex-wrap: wrap;
      justify-content: flex-end;
      max-width: 100%;
    }
  }

  &__timestamp {
    flex-shrink: 0;
    display: flex;
    gap: var(--space-l);

    * {
      font-size: var(--font-size-xs);
      color: var(--color-text-lighter);
    }
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

  &__reply {
    margin-bottom: var(--space-m);
    cursor: pointer;
    overflow-wrap: break-word;

    &:hover {
      background-color: var(--color-bg-raised);
    }

    &--deleted {
      display: flex;
      align-items: center;
      gap: var(--space-xs);
      padding: var(--space-xs) var(--space-s);
      border-radius: var(--border-radius-s);
      background-color: var(--color-bg-raised);
      color: var(--color-text-lighter);
      cursor: default;
      font-size: var(--font-size-s);
      margin-bottom: var(--space-m);

      &:hover {
        background-color: var(--color-bg-raised);
      }

      .iconify {
        opacity: 0.6;
      }
    }
  }

  &__reply-user {
    font-size: var(--font-size-s);
  }

  &__deleted-row {
    display: flex;
    align-items: center;
    gap: var(--space-s);
  }

  &__force-delete {
    opacity: 0;
    transition: opacity var(--transition-fast);

    .discussion-forum__deleted-row:hover & {
      opacity: 1;
    }

    @media screen and (max-width: $breakpoint-s) {
      opacity: 1;
    }
  }

  &__deleted {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    color: var(--color-text-lighter);
    font-size: var(--font-size-s);
    padding-block: 5px;

    .iconify {
      opacity: 0.5;
    }
  }

  &__deleted-avatar {
    opacity: 0.25;
    filter: grayscale(1);
  }

  &__author {
    display: flex;
    justify-content: flex-start;
    flex-direction: column;
    align-items: center;
    height: 100%;
    border-right: 1px solid var(--color-border);
    padding: var(--space-m);
    background-color: var(--color-bg);
    border-top-left-radius: var(--border-radius-m);
    border-bottom-left-radius: var(--border-radius-m);

    .author-meta {
      font-size: var(--font-size-xs);
      color: var(--color-text-lighter);
    }

    &--deleted {
      padding: var(--space-s);
    }
  }

  &__mobile-avatar {
    flex-shrink: 0;

    :deep(.vui-avatar) {
      --avatar-size: 20px !important;
    }
  }

  &__content {
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    padding: var(--space-m);
    padding-bottom: var(--space-s);
    background-color: var(--color-bg-medium);
    border-bottom-right-radius: var(--border-radius-m);
    border-top-right-radius: var(--border-radius-m);
    position: relative;
    height: 100%;
    max-width: 100vw;

    &:has(.discussion-forum__mobile-header) {
      background-color: transparent;
    }
  }

  &__badges {
    padding-left: 8px;
    height: 36px;
  }

  &__actions-anchor {
    position: sticky;
    top: 154px;
    min-height: 0;
    max-height: 0;
    overflow: visible;
    z-index: 10;
  }

  &__actions {
    display: flex;
    gap: 3px;
    position: absolute;
    right: 0;
    top: 0;
    opacity: 0;
    z-index: -1;
    visibility: hidden;
  }
}

@media screen and (max-width: $breakpoint-s) {
  .discussion-forum {
    display: flex;
    flex-direction: column;
    border-radius: var(--border-radius-m);

    &__content {
      width: 100%;
      border-top-right-radius: var(--border-radius-m);
      border-bottom-right-radius: var(--border-radius-m);
      // Reset desktop padding - mobile header/footer handle their own
      padding: 0;
      background-color: var(--color-bg-medium);
    }

    &__body {
      padding: var(--space-m);
      background-color: var(--color-bg-medium);
    }

    &--highlight {
      .discussion-forum__mobile-header,
      .discussion-forum__body,
      .discussion-forum__mobile-footer {
        background-color: color-mix(in srgb, var(--color-accent) 5%, transparent);
      }
    }
  }
}
</style>
