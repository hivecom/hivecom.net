<script setup lang="ts">
import type { ValidationError } from '@dolanske/v-valid'
import type { Comment, ProvidedDiscussion } from './Discussion.types'
import { Alert, Button, Flex, Tooltip } from '@dolanske/vui'
import { computed } from 'vue'
import RichTextEditor from '@/components/Editor/RichTextEditor.vue'
import MarkdownPreview from '@/components/Shared/MarkdownPreview.vue'
import UserName from '@/components/Shared/UserName.vue'
import { useBulkDataUser } from '@/composables/useDataUser'
import { extractMentionIds } from '@/lib/markdownProcessors'
import { FORUMS_BUCKET_ID } from '@/lib/storageAssets'
import { normalizeErrors } from '@/lib/utils/formatting'
import { DISCUSSION_KEYS } from './Discussion.keys'

interface Props {
  replyingTo: Comment | undefined
  message: string
  isNsfw: boolean
  errors: { message: ValidationError }
  formLoading: boolean
  placeholder: string
  userId: string | null | undefined
  canBypassLock: boolean
  floating: boolean
}

const {
  replyingTo,
  message,
  isNsfw,
  errors,
  formLoading,
  placeholder,
  userId,
  canBypassLock,
  floating,
} = defineProps<Props>()

const emit = defineEmits<{
  'update:replyingTo': [value: Comment | undefined]
  'update:message': [value: string]
  'update:isNsfw': [value: boolean]
  'submit': []
}>()

const discussion = inject(DISCUSSION_KEYS.discussion) as ProvidedDiscussion

const editorRef = useTemplateRef<{ focus: () => void }>('editor')

const replyMentionIds = computed(() => extractMentionIds(replyingTo?.markdown ?? ''))
const { users: replyMentionUsers } = useBulkDataUser(replyMentionIds)
const replyMentionLookup = computed<Record<string, string>>(() => {
  const lookup: Record<string, string> = {}
  for (const [id, u] of replyMentionUsers.value.entries()) {
    if (u?.username)
      lookup[id] = u.username
  }
  return lookup
})

defineExpose({
  focus: () => editorRef.value?.focus(),
})
</script>

<template>
  <!-- Authenticated: show editor -->
  <div
    v-if="userId"
    class="discussion__add"
    :class="{ 'discussion__add--floating': floating }"
  >
    <!-- Replying-to preview banner -->
    <Alert v-if="replyingTo">
      <Flex y-start gap="xl" x-between>
        <div>
          <span class="discussion__add--replying-label">
            Replying to
            <UserName size="s" show-preview :user-id="replyingTo.created_by" />:
          </span>
          <MarkdownPreview :markdown="replyingTo.markdown" :mention-lookup="replyMentionLookup" :max-length="240" />
        </div>
        <Tooltip>
          <Button square size="s" plain @click="emit('update:replyingTo', undefined)">
            <Icon name="ph:x" />
          </Button>
          <template #tooltip>
            <p>Remove attached reply</p>
          </template>
        </Tooltip>
      </Flex>
    </Alert>

    <!-- Archived state -->
    <div v-if="discussion?.is_archived">
      <Alert variant="warning">
        <template #icon>
          <Icon name="ph:archive" />
        </template>
        This discussion is archived
      </Alert>
    </div>

    <!-- Locked state - user cannot bypass -->
    <div v-else-if="discussion?.is_locked && !canBypassLock">
      <Alert variant="neutral">
        <template #icon>
          <Icon name="ph:lock" />
        </template>
        This discussion is locked
      </Alert>
    </div>

    <!-- Editor (shown when open, or when locked but user can bypass) -->
    <template v-else>
      <Alert v-if="discussion?.is_locked && canBypassLock" variant="warning">
        <template #icon>
          <Icon name="ph:lock" />
        </template>
        This discussion is locked. Only admins and moderators can post replies.
      </Alert>
      <RichTextEditor
        ref="editor"
        :model-value="message"
        :nsfw="isNsfw"
        min-height="64px"
        show-submit-options
        show-attachment-button
        :loading="formLoading"
        :errors="normalizeErrors(errors.message)"
        :placeholder="replyingTo ? 'Write your reply here...' : placeholder"
        :media-context="discussion?.id ? `${discussion.id}/${userId}` : 'staging'"
        :media-bucket-id="FORUMS_BUCKET_ID"
        @update:model-value="emit('update:message', $event ?? '')"
        @update:nsfw="emit('update:isNsfw', $event)"
        @submit="emit('submit')"
      />
    </template>
  </div>

  <!-- Unauthenticated nudge -->
  <div v-else class="discussion__add">
    <Alert variant="neutral">
      <Flex y-center x-between gap="m">
        <p>Sign in to join the discussion and add a reply.</p>
        <Tooltip placement="top">
          <template #tooltip>
            <p>Sign-in to start the conversation</p>
          </template>
          <Button variant="accent" disabled>
            Sign in
          </Button>
        </Tooltip>
      </Flex>
    </Alert>
  </div>
</template>
