<script setup lang="ts">
import type { Tables } from '@/types/database.types'
import { Badge, Button, Card, Divider, Flex, Grid, pushToast, Sheet } from '@dolanske/vui'
import DiscussionActions from '@/components/Admin/Discussions/DiscussionActions.vue'
import ConfirmModal from '@/components/Shared/ConfirmModal.vue'
import MDRenderer from '@/components/Shared/MDRenderer.vue'
import Metadata from '@/components/Shared/Metadata.vue'
import TimestampDate from '@/components/Shared/TimestampDate.vue'
import UserLink from '@/components/Shared/UserLink.vue'

type DiscussionRecord = Tables<'discussions'>

interface ContextLink {
  label: string
  href: string
  icon: string
}

const props = defineProps<{
  discussion: DiscussionRecord | null
}>()

const emit = defineEmits<{
  updated: [discussion: DiscussionRecord]
  deleted: [discussionId: string]
}>()

const isOpen = defineModel<boolean>('isOpen')

const supabase = useSupabaseClient()
const { hasPermission } = useAdminPermissions()

const canUpdate = computed(() =>
  hasPermission('discussions.update') || hasPermission('discussions.manage'),
)

const canDelete = computed(() =>
  hasPermission('discussions.delete') || hasPermission('discussions.manage'),
)

const deleteLoading = ref(false)
const showDeleteConfirm = ref(false)

const lastUpdatedAt = computed<string | null>(() => props.discussion?.modified_at ?? props.discussion?.created_at ?? null)

const fetchedMarkdown = ref<string | null>(null)
const contentLoading = ref(false)

const discussionMarkdown = computed(() => {
  if (!props.discussion)
    return ''
  const markdown = (props.discussion as { markdown?: string | null }).markdown
  return markdown ?? fetchedMarkdown.value ?? ''
})

const threadReplyCountText = computed(() => {
  const count = props.discussion?.reply_count ?? 0
  const betweenCount = Math.max(count - 1, 0)
  const label = betweenCount === 1 ? 'reply' : 'replies'
  return `${betweenCount} ${label} in between`
})

const hasReplies = computed(() => (props.discussion?.reply_count ?? 0) > 0)
const showRepliesBetween = computed(() => (props.discussion?.reply_count ?? 0) > 1)

const lastReply = ref<Tables<'discussion_replies'> | null>(null)
const lastReplyLoading = ref(false)

const lastReplyAuthorId = computed<string | null>(() =>
  lastReply.value?.created_by ?? null,
)

const lastReplyTimestamp = computed<string | null>(() =>
  lastReply.value?.created_at ?? null,
)

const lastActivityAt = computed<string | null>(() =>
  lastReply.value?.created_at ?? props.discussion?.created_at ?? null,
)

const lastActivityUserId = computed<string | null>(() =>
  lastReply.value?.created_by ?? props.discussion?.created_by ?? null,
)

const contextLinks = computed<ContextLink[]>(() => {
  if (!props.discussion)
    return []

  const links: ContextLink[] = []

  if (props.discussion.discussion_topic_id) {
    links.push({
      label: `Forum topic · ${props.discussion.discussion_topic_id}`,
      href: `/forum?activeTopicId=${encodeURIComponent(props.discussion.discussion_topic_id)}`,
      icon: 'ph:chats',
    })
  }

  if (props.discussion.profile_id) {
    links.push({
      label: `Profile discussion · ${props.discussion.profile_id}`,
      href: `/profile/${props.discussion.profile_id}`,
      icon: 'ph:user-circle',
    })
  }

  if (props.discussion.project_id) {
    links.push({
      label: `Project thread · ${props.discussion.project_id}`,
      href: `/community/projects/${props.discussion.project_id}`,
      icon: 'ph:folder',
    })
  }

  if (props.discussion.event_id) {
    links.push({
      label: `Event thread · ${props.discussion.event_id}`,
      href: `/events/${props.discussion.event_id}`,
      icon: 'ph:calendar',
    })
  }

  if (props.discussion.gameserver_id) {
    links.push({
      label: `Gameserver thread · ${props.discussion.gameserver_id}`,
      href: `/servers/gameservers/${props.discussion.gameserver_id}`,
      icon: 'ph:computer-tower',
    })
  }

  if (props.discussion.referendum_id) {
    links.push({
      label: `Referendum thread · ${props.discussion.referendum_id}`,
      href: `/votes/${props.discussion.referendum_id}`,
      icon: 'ph:user-sound',
    })
  }

  if (props.discussion.discussion_topic_id) {
    links.push({
      label: `Forum thread · ${props.discussion.id}`,
      href: `/forum/${props.discussion.id}`,
      icon: 'ph:chat-circle',
    })
  }

  return links
})

async function fetchLastReply() {
  lastReply.value = null
  if (!props.discussion?.id)
    return

  lastReplyLoading.value = true

  try {
    const { data, error } = await supabase
      .from('discussion_replies')
      .select('id, markdown, created_at, created_by, modified_at, modified_by')
      .eq('discussion_id', props.discussion.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error)
      throw error

    lastReply.value = data
  }
  catch {
    lastReply.value = null
  }
  finally {
    lastReplyLoading.value = false
  }
}

async function fetchDiscussionContent() {
  fetchedMarkdown.value = null
  if (!props.discussion?.id)
    return

  const directMarkdown = (props.discussion as { markdown?: string | null }).markdown
  if (directMarkdown) {
    fetchedMarkdown.value = directMarkdown
    return
  }

  contentLoading.value = true

  try {
    const { data, error } = await supabase
      .from('discussions')
      .select('markdown')
      .eq('id', props.discussion.id)
      .maybeSingle()

    if (error)
      throw error

    fetchedMarkdown.value = data?.markdown ?? ''
  }
  catch {
    fetchedMarkdown.value = ''
  }
  finally {
    contentLoading.value = false
  }
}

watch(
  () => props.discussion?.id,
  () => {
    void fetchLastReply()
    void fetchDiscussionContent()
  },
  { immediate: true },
)

async function handleDelete() {
  if (!props.discussion)
    return

  deleteLoading.value = true

  try {
    const { error } = await supabase
      .from('discussions')
      .delete()
      .eq('id', props.discussion.id)

    if (error)
      throw error

    emit('deleted', props.discussion.id)
    showDeleteConfirm.value = false
    isOpen.value = false
    pushToast('Discussion deleted')
  }
  catch (error) {
    pushToast('Failed to delete discussion', {
      description: error instanceof Error ? error.message : 'Unknown error',
    })
  }
  finally {
    deleteLoading.value = false
  }
}

function handleClose() {
  isOpen.value = false
}
</script>

<template>
  <Sheet
    :open="!!props.discussion && isOpen"
    position="right"
    :card="{ separators: true }"
    :size="640"
    @close="handleClose"
  >
    <template #header>
      <Flex x-between y-center class="pr-s">
        <Flex column :gap="0">
          <h4>Discussion Details</h4>
          <p v-if="props.discussion" class="text-color-light text-xs">
            {{ props.discussion.title || 'Untitled discussion' }}
          </p>
        </Flex>

        <Flex y-center gap="xs">
          <DiscussionActions
            v-if="props.discussion && canUpdate"
            :discussion="props.discussion"
            show-labels
            @updated="emit('updated', $event)"
          />

          <Button
            v-if="props.discussion && canDelete"
            variant="danger"
            :loading="deleteLoading"
            @click="showDeleteConfirm = true"
          >
            <template #start>
              <Icon name="ph:trash" />
            </template>
            Delete
          </Button>
        </Flex>
      </Flex>
    </template>

    <Flex v-if="props.discussion" column gap="m" class="discussion-detail">
      <Card class="card-bg">
        <Flex column gap="l">
          <Grid class="detail-item" expand columns="1fr 2fr">
            <span class="text-color-light text-bold">ID:</span>
            <span>{{ props.discussion.id }}</span>
          </Grid>

          <Grid class="detail-item" expand columns="1fr 2fr">
            <span class="text-color-light text-bold">Title:</span>
            <span>{{ props.discussion.title || 'Untitled discussion' }}</span>
          </Grid>

          <Grid v-if="props.discussion.description" class="detail-item" expand columns="1fr 2fr">
            <span class="text-color-light text-bold">Description:</span>
            <span>{{ props.discussion.description }}</span>
          </Grid>

          <Grid class="detail-item" expand columns="1fr 2fr">
            <span class="text-color-light text-bold">Status:</span>
            <Flex gap="xs" y-center wrap>
              <Badge :variant="props.discussion.is_locked ? 'danger' : 'success'">
                {{ props.discussion.is_locked ? 'Locked' : 'Open' }}
              </Badge>
              <Badge v-if="props.discussion.is_sticky && props.discussion.discussion_topic_id" variant="accent">
                Pinned
              </Badge>
              <Badge v-if="props.discussion.is_archived" variant="warning">
                Archived
              </Badge>
            </Flex>
          </Grid>

          <Grid class="detail-item" expand columns="1fr 2fr">
            <span class="text-color-light text-bold">Replies:</span>
            <span>{{ props.discussion.reply_count }}</span>
          </Grid>

          <Grid class="detail-item" expand columns="1fr 2fr">
            <span class="text-color-light text-bold">Views:</span>
            <span>{{ props.discussion.view_count }}</span>
          </Grid>

          <Grid class="detail-item" expand columns="1fr 2fr">
            <span class="text-color-light text-bold">Slug:</span>
            <span>{{ props.discussion.slug || '-' }}</span>
          </Grid>

          <Grid class="detail-item" expand columns="1fr 2fr">
            <span class="text-color-light text-bold">Created:</span>
            <TimestampDate size="s" :date="props.discussion.created_at" />
          </Grid>

          <Grid class="detail-item" expand columns="1fr 2fr">
            <span class="text-color-light text-bold">Last Updated:</span>
            <TimestampDate size="s" :date="lastUpdatedAt" />
          </Grid>

          <Grid class="detail-item" expand columns="1fr 2fr">
            <span class="text-color-light text-bold">Last activity:</span>
            <Flex y-center gap="xs">
              <TimestampDate size="s" :date="lastActivityAt" />
              <UserLink :user-id="lastActivityUserId" placeholder="Unknown" class="text-m" show-avatar />
            </Flex>
          </Grid>

          <Grid class="detail-item" expand columns="1fr 2fr">
            <span class="text-color-light text-bold">Author:</span>
            <UserLink :user-id="props.discussion.created_by" placeholder="Unknown" class="text-m" show-avatar />
          </Grid>
        </Flex>
      </Card>

      <Card class="card-bg">
        <Flex column gap="s">
          <h5 class="text-bold">
            Content
          </h5>
          <MDRenderer v-if="discussionMarkdown" :md="discussionMarkdown" />
          <p v-else-if="contentLoading" class="text-color-lighter text-s">
            Loading content...
          </p>
          <p v-else class="text-color-lighter text-s">
            No content provided.
          </p>
        </Flex>
      </Card>

      <template v-if="hasReplies">
        <Flex v-if="showRepliesBetween" expand column gap="xs">
          <Divider />
          <Flex x-center expand>
            <span class="text-color-lighter text-xs">{{ threadReplyCountText }}</span>
          </Flex>
          <Divider />
        </Flex>

        <Card class="card-bg">
          <Flex column gap="s">
            <h5 class="text-bold">
              Latest reply
            </h5>
            <Flex y-center gap="xs">
              <UserLink :user-id="lastReplyAuthorId" placeholder="Unknown" class="text-m" show-avatar />
              <TimestampDate size="s" :date="lastReplyTimestamp" />
            </Flex>
            <span v-if="lastReplyLoading" class="text-color-lighter text-xs">
              Loading last reply...
            </span>
            <MDRenderer v-else-if="lastReply?.markdown" :md="lastReply.markdown" />
            <span v-else class="text-color-lighter text-xs">
              No replies yet
            </span>
          </Flex>
        </Card>
      </template>

      <Card class="card-bg">
        <Flex column gap="s">
          <h5 class="text-bold">
            Context
          </h5>
          <Flex gap="xs" wrap>
            <NuxtLink
              v-for="link in contextLinks"
              :key="link.href"
              :to="link.href"
              class="text-m text-color-accent"
            >
              <Button size="s" variant="gray">
                <template #start>
                  <Icon :name="link.icon" />
                </template>
                {{ link.label }}
              </Button>
            </NuxtLink>
          </Flex>
        </Flex>
      </Card>

      <Card class="card-bg">
        <Metadata
          :created-at="props.discussion.created_at"
          :created-by="props.discussion.created_by"
          :modified-at="props.discussion.modified_at"
          :modified-by="props.discussion.modified_by"
          show-system-user-for-missing-created-by
        />
      </Card>
    </Flex>
  </Sheet>

  <ConfirmModal
    v-model:open="showDeleteConfirm"
    :confirm="handleDelete"
    :confirm-loading="deleteLoading"
    title="Delete discussion"
    description="Are you sure you want to delete this discussion? This action cannot be undone."
    confirm-text="Delete"
    cancel-text="Cancel"
    :destructive="true"
  />
</template>
