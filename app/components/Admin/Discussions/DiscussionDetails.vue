<script setup lang="ts">
import type { StorageAsset } from '@/lib/storageAssets'
import type { Tables } from '@/types/database.overrides'
import { Alert, Badge, Button, Card, CopyClipboard, Divider, Dropdown, DropdownTitle, Flex, Grid, pushToast, searchString, Sheet, Tooltip } from '@dolanske/vui'
import DiscussionActions from '@/components/Admin/Discussions/DiscussionActions.vue'
import DiscussionEditSheet from '@/components/Admin/Discussions/DiscussionEditSheet.vue'
import MDRenderer from '@/components/Shared/MDRenderer.vue'
import Metadata from '@/components/Shared/Metadata.vue'
import TimestampDate from '@/components/Shared/TimestampDate.vue'
import UserLink from '@/components/Shared/UserLink.vue'
import { useDataForumTopics } from '@/composables/useDataForumTopics'
import { formatBytes, FORUMS_BUCKET_ID, isImageAsset, listStorageFilesRecursive, normalizePrefix } from '@/lib/storageAssets'

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
  hasPermission('discussions.update'),
)

const editSheetOpen = ref(false)

const lastUpdatedAt = computed<string | null>(() => props.discussion?.modified_at ?? props.discussion?.created_at ?? null)

const fetchedMarkdown = ref<string | null>(null)
const contentLoading = ref(false)

const assets = ref<StorageAsset[]>([])
const assetsLoading = ref(false)
const assetsError = ref('')

const assetsSummary = computed(() => {
  const count = assets.value.length
  return `${count} asset${count === 1 ? '' : 's'}`
})

const assetsPrefix = computed(() => normalizePrefix(props.discussion?.id ?? ''))

async function fetchDiscussionAssets() {
  assets.value = []
  assetsError.value = ''

  if (!props.discussion?.id)
    return

  const prefix = assetsPrefix.value
  if (!prefix)
    return

  assetsLoading.value = true

  try {
    assets.value = await listStorageFilesRecursive(supabase, FORUMS_BUCKET_ID, prefix)
  }
  catch (error: unknown) {
    assetsError.value = error instanceof Error ? error.message : 'Unable to load assets'
  }
  finally {
    assetsLoading.value = false
  }
}

function openAssetUrl(asset: StorageAsset) {
  if (!asset.publicUrl)
    return

  window.open(asset.publicUrl, '_blank', 'noopener')
}

function getAssetUploaderId(asset: StorageAsset): string | null {
  if (!props.discussion?.id)
    return null

  const segments = normalizePrefix(asset.path).split('/').filter(Boolean)
  if (segments.length < 2)
    return null
  if (segments[0] !== props.discussion.id)
    return null

  return segments[1] || null
}

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
    const discussionSlug = props.discussion.slug ?? props.discussion.id
    links.push({
      label: `Forum thread · ${discussionSlug}`,
      href: `/forum/${discussionSlug}`,
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
    void fetchDiscussionAssets()
  },
  { immediate: true },
)

function handleClose() {
  isOpen.value = false
}

// Orphan reassignment
const isOrphaned = computed(() => !!props.discussion && contextLinks.value.length === 0)

const reassignLoading = ref(false)
const reassignSearch = ref('')

// Topics served from shared cache
const { topics: reassignTopics } = useDataForumTopics()

const filteredReassignTopics = computed(() => {
  return reassignTopics.value
    .filter(t => !t.is_archived)
    .filter(t => reassignSearch.value ? searchString([t.name], reassignSearch.value) : true)
    .sort((a, b) => a.name.localeCompare(b.name))
})

// Topics are pre-loaded by useDataForumTopics - no explicit fetch needed
async function loadReassignTopics() {}

async function reassignToTopic(topicId: string) {
  if (!props.discussion)
    return

  reassignLoading.value = true

  try {
    const { data, error } = await supabase
      .from('discussions')
      .update({ discussion_topic_id: topicId })
      .eq('id', props.discussion.id)
      .select()
      .maybeSingle()

    if (error)
      throw error

    if (data)
      emit('updated', data as DiscussionRecord)

    pushToast('Discussion reassigned to topic')
  }
  catch (error) {
    pushToast('Failed to reassign discussion', {
      description: error instanceof Error ? error.message : 'Unknown error',
    })
  }
  finally {
    reassignLoading.value = false
  }
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
            hide-pin-button
            show-labels
            @updated="emit('updated', $event as DiscussionRecord)"
          />

          <Button
            v-if="canUpdate"
            variant="gray"
            @click="editSheetOpen = true"
          >
            <template #start>
              <Icon name="ph:pencil-simple" />
            </template>
            Edit
          </Button>
        </Flex>
      </Flex>
    </template>

    <Flex v-if="props.discussion" column gap="m" class="discussion-detail">
      <Card class="card-bg">
        <Flex column gap="l">
          <Grid class="detail-item" expand columns="1fr 2fr">
            <span class="text-color-light text-bold">UUID:</span>
            <CopyClipboard :text="props.discussion.id">
              <code class="discussion-code">{{ props.discussion.id }}</code>
            </CopyClipboard>
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
            <CopyClipboard v-if="props.discussion.slug" :text="props.discussion.slug">
              <code class="discussion-code">{{ props.discussion.slug }}</code>
            </CopyClipboard>
            <span v-else class="text-color-lighter">-</span>
          </Grid>

          <Grid class="detail-item" expand columns="1fr 2fr">
            <span class="text-color-light text-bold">Created:</span>
            <TimestampDate size="s" :date="props.discussion.created_at" />
          </Grid>

          <Grid class="detail-item" expand columns="1fr 2fr">
            <span class="text-color-light text-bold">Last Updated:</span>
            <TimestampDate size="s" :date="lastUpdatedAt" />
          </Grid>

          <Grid v-if="lastActivityUserId" class="detail-item" expand columns="1fr 2fr">
            <span class="text-color-light text-bold">Last activity:</span>
            <Flex y-center gap="xs">
              <TimestampDate size="s" :date="lastActivityAt" />
              <UserLink :user-id="lastActivityUserId" placeholder="Unknown" class="text-m" show-avatar />
            </Flex>
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
          <Flex x-between y-center>
            <h5 class="text-bold">
              Context
            </h5>
            <Dropdown v-if="canUpdate" placement="bottom-end">
              <template #trigger="{ toggle, isOpen: dropdownOpen }">
                <Button size="s" variant="gray" outline @click="loadReassignTopics(), toggle()">
                  <template #start>
                    <Icon name="ph:arrow-fat-lines-right" :size="14" />
                  </template>
                  Reassign
                  <template #end>
                    <Icon :name="dropdownOpen ? 'ph:caret-up' : 'ph:caret-down'" :size="14" />
                  </template>
                </Button>
              </template>
              <template #default="{ close }">
                <DropdownTitle>
                  <Input v-model="reassignSearch" placeholder="Search topics..." expand focus />
                </DropdownTitle>
                <Flex column gap="xxs">
                  <button
                    v-for="topic in filteredReassignTopics"
                    :key="topic.id"
                    class="reassign-topic-button"
                    @click="reassignToTopic(topic.id), close()"
                  >
                    {{ topic.name }}
                  </button>
                </Flex>
                <p v-if="filteredReassignTopics.length === 0" class="text-color-lighter text-xs">
                  No topics found.
                </p>
              </template>
            </Dropdown>
          </Flex>
          <template v-if="isOrphaned">
            <Alert variant="danger" filled>
              This discussion is orphaned - it has no associated topic or context.
            </Alert>
          </template>
          <Flex v-else gap="xs" wrap>
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
        <Flex column gap="s">
          <Flex x-between y-center>
            <h5 class="text-bold">
              Assets
            </h5>
            <span class="text-xxs text-color-light">
              Forums bucket · {{ assetsSummary }}
            </span>
          </Flex>

          <Alert v-if="assetsError" variant="danger">
            {{ assetsError }}
          </Alert>

          <p v-else-if="assetsLoading" class="text-color-lighter text-xs">
            Loading assets...
          </p>

          <Grid
            v-else-if="assets.length"
            expand
            columns="repeat(auto-fill, minmax(200px, 1fr))"
            gap="s"
          >
            <Card v-for="asset in assets" :key="asset.path" class="card-bg">
              <Flex column gap="xs">
                <Flex
                  y-center
                  x-center
                  class="card-bg"
                  style="height: 120px; border-radius: var(--border-radius-s); overflow: hidden;"
                >
                  <template v-if="isImageAsset(asset) && asset.publicUrl">
                    <img :src="asset.publicUrl" :alt="asset.name" style="width: 100%; height: 100%; object-fit: cover;">
                  </template>
                  <template v-else>
                    <Icon name="ph:file" size="24" />
                  </template>
                </Flex>

                <Flex column gap="xxs">
                  <strong class="text-xs">{{ asset.name }}</strong>
                  <span class="text-xxs text-color-light">{{ formatBytes(asset.size) }}</span>
                  <Flex y-center gap="xxs">
                    <span class="text-xxs text-color-light">Uploaded by</span>
                    <UserLink :user-id="getAssetUploaderId(asset)" placeholder="Unknown" class="text-xxs" />
                  </Flex>
                </Flex>

                <Flex gap="xs" y-center>
                  <CopyClipboard :text="asset.publicUrl || ''" confirm>
                    <Tooltip>
                      <Button
                        size="s"
                        variant="gray"
                        square
                        :disabled="!asset.publicUrl"
                      >
                        <Icon name="ph:link-simple" />
                      </Button>
                      <template #tooltip>
                        <p>Copy URL</p>
                      </template>
                    </Tooltip>
                  </CopyClipboard>
                  <Tooltip>
                    <Button
                      size="s"
                      variant="gray"
                      square
                      :disabled="!asset.publicUrl"
                      @click="openAssetUrl(asset)"
                    >
                      <Icon name="ph:arrow-square-out" />
                    </Button>
                    <template #tooltip>
                      <p>Open</p>
                    </template>
                  </Tooltip>
                </Flex>
              </Flex>
            </Card>
          </Grid>

          <p v-else class="text-color-lighter text-xs">
            No assets found for this discussion.
          </p>
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

  <DiscussionEditSheet
    v-model:is-open="editSheetOpen"
    :discussion="props.discussion"
    @updated="emit('updated', $event)"
    @deleted="emit('deleted', $event)"
  />
</template>

<style scoped lang="scss">
.discussion-code {
  font-family: monospace;
  font-size: var(--font-size-s);
  background-color: var(--color-bg-lowered);
  padding: 2px 6px;
  border-radius: var(--border-radius-xs);
  word-break: break-all;
}

.reassign-topic-button {
  display: flex;
  width: 100%;
  padding: var(--space-xs);
  align-items: flex-start;
  border-radius: var(--border-radius-m);
  font-size: var(--font-size-s);

  &:hover {
    background-color: var(--color-button-gray-hover);
  }
}
</style>
