<script setup lang="ts">
import type { Comment, ProvidedDiscussion } from '../Discussion.types'
import { Alert, Button, ButtonGroup, Card, Divider, Flex, Modal, Switch, Tooltip } from '@dolanske/vui'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import { resolvePlainTextMentions } from '@/components/Editor/plugins/mentions'
import RichTextEditor from '@/components/Editor/RichTextEditor.vue'
import ReactionsSelect from '@/components/Reactions/ReactionsSelect.vue'
import BadgeCircle from '@/components/Shared/BadgeCircle.vue'
import ComplaintsManager from '@/components/Shared/ComplaintsManager.vue'
import ConfirmModal from '@/components/Shared/ConfirmModal.vue'
import MarkdownPreview from '@/components/Shared/MarkdownPreview.vue'
import MDRenderer from '@/components/Shared/MDRenderer.vue'
import UserDisplay from '@/components/Shared/UserDisplay.vue'
import UserName from '@/components/Shared/UserName.vue'
import UserPreviewHover from '@/components/Shared/UserPreviewHover.vue'
import UserRole from '@/components/Shared/UserRole.vue'
import { useCacheBadgeDiscussionReplyCount } from '@/composables/useCacheBadgeDiscussionReplyCount'
import { useBulkUserData } from '@/composables/useCacheUserData'
import { useCacheUserDiscussionCount } from '@/composables/useCacheUserDiscussionCount'
import { extractMentionIds } from '@/lib/markdownProcessors'
import { useBreakpoint } from '@/lib/mediaQuery'
import { FORUMS_BUCKET_ID } from '@/lib/storageAssets'
import { getCountryInfo } from '@/lib/utils/country'
import { DISCUSSION_KEYS } from '../Discussion.keys'

const props = defineProps<Props>()

const emit = defineEmits<{
  copyLink: []
  scrollReply: []
}>()

dayjs.extend(relativeTime)

interface Props {
  data: Comment
}

const data = toRef(props, 'data')

const userId = useUserId()
const supabase = useSupabaseClient()
const currentUser = useSupabaseUser()

const { user: currentUserData } = useCacheUserData(userId, { includeRole: true })

const isMobile = useBreakpoint('<s')

const viewMode = inject(DISCUSSION_KEYS.viewMode, ref<'flat' | 'threaded'>('flat'))
const discussion = inject(DISCUSSION_KEYS.discussion) as ProvidedDiscussion
const canBypassLock = inject(DISCUSSION_KEYS.canBypassLock, ref(false))

const authorId = computed(() => data.value.created_by ?? null)
const { count: discussionCount } = useCacheUserDiscussionCount(authorId)
const { count: replyCount } = useCacheBadgeDiscussionReplyCount(authorId)

const { user } = useCacheUserData(data.value.created_by!, {
  includeRole: true,
  includeAvatar: true,
  userTtl: 10 * 60 * 1000,
  avatarTtl: 30 * 60 * 1000,
})

// Only fetch modifier data when the message was edited by someone other than the author
const modifierId = computed(() => {
  const { modified_at, created_at, modified_by, created_by } = data.value
  if (modified_at === created_at || !modified_by || modified_by === created_by)
    return null
  return modified_by
})
const { user: modifierUser } = useCacheUserData(modifierId, { userTtl: 10 * 60 * 1000 })

const country = computed(() => getCountryInfo(user.value?.country))

const setReplyToComment = inject(DISCUSSION_KEYS.setReplyToComment) as (data: Comment) => void
const setQuoteOfComment = inject(DISCUSSION_KEYS.setQuoteOfComment) as (data: Comment) => void

const replyMentionIds = computed(() => extractMentionIds(data.value.reply?.markdown ?? ''))
const { users: replyMentionUsers } = useBulkUserData(replyMentionIds)
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

// Comment deletion
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
</script>

<template>
  <div class="discussion-forum">
    <!-- Define a part of UI which can be used multiple times in the same component -->
    <DefineReusableUserInfo>
      <Flex column x-center y-center :gap="isMobile ? 'xs' : 's'">
        <SharedUserAvatar :user-id="data.created_by" :size="isMobile ? 'm' : 'l'" linked />
        <Flex wrap gap="xxs" y-center x-center>
          <UserName :user-id="data.created_by" show-preview />
          <BadgeCircle v-if="data.created_by === discussion?.created_by">
            <span class="text-xxs text-color-light">OP</span>
          </BadgeCircle>
          <UserRole :user-id="data.created_by" />
        </Flex>
      </Flex>
    </DefineReusableUserInfo>

    <!-- Author information -->
    <div class="discussion-forum__author">
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
        {{ discussionCount }} {{ discussionCount === 1 ? 'discussion' : 'discussions' }} / {{ replyCount }} {{ replyCount === 1 ? 'reply' : 'replies' }}
      </p>
      <Divider v-if="user?.introduction || user?.created_at || country" />
      <p v-if="user?.introduction" class="text-s text-center">
        {{ user.introduction }}
      </p>
    </div>

    <!-- Content -->
    <div class="discussion-forum__content">
      <!-- Reply information -->
      <Alert v-if="data.reply && viewMode !== 'threaded'" icon-align="start" role="button" class="discussion-forum__reply" @click="emit('scrollReply')">
        <p v-if="data.reply.created_by !== currentUserData?.id" class="discussion-forum__reply-user">
          <UserName size="s" show-preview :user-id="data.reply.created_by" /> wrote:
        </p>
        <p v-else class="discussion-forum__reply-user">
          You wrote:
        </p>
        <MarkdownPreview class="text-color-light" :markdown="data.reply.markdown" :mention-lookup="replyMentionLookup" :max-length="164" />
      </Alert>

      <!-- Content warning -->
      <button v-if="showNSFWWarning" class="discussion-forum__nsfw" @click="showNSFWWarning = false">
        <Icon class="text-color-accent" name="ph:caret-down" />
        <p>Click to reveal potentially sensitive content</p>
        <Icon class="text-color-accent" name="ph:caret-up" />
      </button>

      <!-- Content markdown -->
      <MDRenderer
        v-else
        :md="data.markdown"
        :skeleton-height="128"
      />

      <div class="flex-1" />

      <!-- Bottom row with timestamps and reactions -->
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
        </p>

        <Flex v-if="displayReactions.length > 0" y-center x-end gap="xxs">
          <ReactionsList :reactions="displayReactions" :disabled="!userId" @toggle="(emote, provider) => toggleReaction(emote, provider)" />
          <ReactionsSelect v-if="userId" @reaction="(emote) => toggleReaction(emote)" />
        </Flex>
      </Flex>

      <!-- Floating actions -->
      <div v-if="!showNSFWWarning" class="discussion-forum__actions">
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

        <ButtonGroup v-if="currentUserData">
          <template v-if="(!discussion?.is_locked || canBypassLock) && !discussion?.is_archived">
            <Button square size="s" @click="setReplyToComment(data)">
              <Tooltip>
                <Icon name="ph:arrow-elbow-up-left-bold" />
                <template #tooltip>
                  <p>Reply to <UserDisplay class="inline-block" size="s" :user-id="data.created_by" hide-avatar /></p>
                </template>
              </Tooltip>
            </Button>
            <Button square size="s" @click="setQuoteOfComment(data)">
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

        <ButtonGroup v-if="currentUserData && (currentUserData.id === data.created_by || currentUserData.role === 'admin' || currentUserData.role === 'moderator') && !discussion?.is_locked && !discussion?.is_archived">
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
              <MDRenderer :md="data.markdown" skeleton-height="48px" />
            </Card>
          </ConfirmModal>
        </ButtonGroup>

        <!-- Off-topic toggle + report grouped on the right -->
        <!-- Admins/mods can flag any reply including their own; plain OPs cannot flag themselves -->
        <ButtonGroup v-if="canMarkOfftopic && (canBypassLock || userId !== data.created_by) || (currentUserData && data.created_by !== currentUserData.id)">
          <Button
            v-if="canMarkOfftopic && (canBypassLock || userId !== data.created_by)"
            size="s"
            square
            :loading="offtopicLoading"
            :variant="data.is_offtopic ? 'danger' : 'gray'"
            @click="handleToggleOfftopic"
          >
            <Tooltip>
              <Icon :name="data.is_offtopic ? 'ph:warning-circle-fill' : 'ph:warning-circle'" />
              <template #tooltip>
                <p>{{ data.is_offtopic ? 'Remove off-topic flag' : 'Mark as off-topic' }}</p>
              </template>
            </Tooltip>
          </Button>
          <Button v-if="currentUserData && data.created_by !== currentUserData.id" size="s" square @click="showReportModal = true">
            <Tooltip>
              <Icon name="ph:flag-bold" />
              <template #tooltip>
                <p>Report post</p>
              </template>
            </Tooltip>
          </Button>
        </ButtonGroup>
      </div>
    </div>

    <!-- Edit Modal and Report Modal -->
    <Modal :open="editing" centered scrollable size="l" @close="editing = false">
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

  &:has(.reactions-anchor-active),
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
  }

  &__timestamp {
    flex-shrink: 0;
    display: flex;
    gap: var(--space-l);
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
    font-size: var(--font-size-s);
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
      border-bottom-right-radius: var(--border-radius-m);
    }

    &__content {
      width: 100%;
      border-top-left-radius: var(--border-radius-m);
      border-bottom-left-radius: 0;
      border-bottom-right-radius: 0;
    }

    &__actions {
      position: static;
      opacity: 1;
      z-index: auto;
      visibility: visible;
      order: -1;
      align-self: flex-end;
      margin-bottom: var(--space-xs);
    }

    &__timestamp {
      margin-top: var(--space-m);
    }
  }
}
</style>
