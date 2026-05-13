<script setup lang="ts">
import type { FlatSortColumn, StorageAsset } from '@/lib/storageAssets'
import type { Tables } from '@/types/database.overrides'
import { Alert, Badge, Button, Card, Dropdown, DropdownTitle, Flex, Grid, paginate, Pagination, pushToast, searchString, Select, Sheet } from '@dolanske/vui'
import AssetGrid from '@/components/Admin/Assets/AssetGrid.vue'
import DiscussionActions from '@/components/Admin/Discussions/DiscussionActions.vue'
import DiscussionEditSheet from '@/components/Admin/Discussions/DiscussionEditSheet.vue'
import CountDisplay from '@/components/Shared/CountDisplay.vue'
import MarkdownRenderer from '@/components/Shared/MarkdownRenderer.vue'
import Metadata from '@/components/Shared/Metadata.vue'
import TimestampDate from '@/components/Shared/TimestampDate.vue'
import UserLink from '@/components/Shared/UserLink.vue'
import { useDataForumTopics } from '@/composables/useDataForumTopics'
import { useDiscussionCache } from '@/composables/useDiscussionCache'
import { useBreakpoint } from '@/lib/mediaQuery'
import { FORUMS_BUCKET_ID, listStorageObjectsFlat, normalizePrefix } from '@/lib/storageAssets'

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
const discussionCache = useDiscussionCache()

const isMobile = useBreakpoint('<s')

const canUpdate = computed(() =>
  hasPermission('discussions.update'),
)

const editSheetOpen = ref(false)

const lastUpdatedAt = computed<string | null>(() => props.discussion?.modified_at ?? props.discussion?.created_at ?? null)

const fetchedMarkdown = ref<string | null>(null)
const contentLoading = ref(false)

const assetsPrefix = computed(() => {
  const id = props.discussion?.id
  return id ? `${normalizePrefix(id)}/` : ''
})

// ── Assets fetch / sort / pagination ─────────────────────────────────────────

const PAGE_SIZE = 10

const assets = ref<StorageAsset[]>([])
const assetsLoading = ref(false)
const assetsReloading = ref(false)
const assetsError = ref('')
const assetsTotalCount = ref(0)
const assetsPage = ref(1)

const assetsPaginationState = computed(() => paginate(assetsTotalCount.value, assetsPage.value, PAGE_SIZE))
const assetsShouldPaginate = computed(() => assetsTotalCount.value > PAGE_SIZE)
const assetsSummary = computed(() => {
  const count = assetsTotalCount.value
  return `${count} asset${count === 1 ? '' : 's'}`
})

type AssetSortOption = 'newest' | 'oldest' | 'name-asc' | 'name-desc' | 'size-desc' | 'size-asc'

const assetSortOptions = [
  { label: 'Newest first', value: 'newest' as AssetSortOption },
  { label: 'Oldest first', value: 'oldest' as AssetSortOption },
  { label: 'Name (A → Z)', value: 'name-asc' as AssetSortOption },
  { label: 'Name (Z → A)', value: 'name-desc' as AssetSortOption },
  { label: 'Size (largest)', value: 'size-desc' as AssetSortOption },
  { label: 'Size (smallest)', value: 'size-asc' as AssetSortOption },
]

const assetSortOption = ref<AssetSortOption>('newest')

const assetSortModel = computed<{ label: string, value: AssetSortOption }[] | undefined>({
  get() {
    const match = assetSortOptions.find(o => o.value === assetSortOption.value)
    return match ? [match] : undefined
  },
  set(selection) {
    assetSortOption.value = selection?.[0]?.value ?? 'newest'
    assetsPage.value = 1
    void fetchDiscussionAssets()
  },
})

function assetSortParams(): { column: FlatSortColumn, order: 'asc' | 'desc' } {
  switch (assetSortOption.value) {
    case 'oldest': return { column: 'updated_at', order: 'asc' }
    case 'name-asc': return { column: 'name', order: 'asc' }
    case 'name-desc': return { column: 'name', order: 'desc' }
    case 'size-desc': return { column: 'size', order: 'desc' }
    case 'size-asc': return { column: 'size', order: 'asc' }
    case 'newest':
    default: return { column: 'updated_at', order: 'desc' }
  }
}

async function fetchDiscussionAssets() {
  if (!assetsPrefix.value)
    return

  assetsError.value = ''
  if (assets.value.length) {
    assetsReloading.value = true
  }
  else {
    assetsLoading.value = true
  }

  try {
    const { assets: files, totalCount } = await listStorageObjectsFlat(supabase, FORUMS_BUCKET_ID, {
      prefix: assetsPrefix.value,
      limit: PAGE_SIZE,
      offset: (assetsPage.value - 1) * PAGE_SIZE,
      sortBy: assetSortParams(),
    })
    assets.value = files
    assetsTotalCount.value = totalCount
  }
  catch (e: unknown) {
    assetsError.value = e instanceof Error ? e.message : 'Unable to load assets'
  }
  finally {
    assetsLoading.value = false
    assetsReloading.value = false
  }
}

function setAssetsPage(n: number) {
  assetsPage.value = n
  void fetchDiscussionAssets()
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
      label: `Forum topic - ${props.discussion.discussion_topic_id}`,
      href: `/forum?activeTopicId=${encodeURIComponent(props.discussion.discussion_topic_id)}`,
      icon: 'ph:chats',
    })
  }

  if (props.discussion.profile_id) {
    links.push({
      label: `Profile discussion - ${props.discussion.profile_id}`,
      href: `/profile/${props.discussion.profile_id}`,
      icon: 'ph:user-circle',
    })
  }

  if (props.discussion.project_id) {
    links.push({
      label: `Project thread - ${props.discussion.project_id}`,
      href: `/community/projects/${props.discussion.project_id}`,
      icon: 'ph:folder',
    })
  }

  if (props.discussion.event_id) {
    links.push({
      label: `Event thread - ${props.discussion.event_id}`,
      href: `/events/${props.discussion.event_id}`,
      icon: 'ph:calendar',
    })
  }

  if (props.discussion.gameserver_id) {
    links.push({
      label: `Gameserver thread - ${props.discussion.gameserver_id}`,
      href: `/servers/gameservers/${props.discussion.gameserver_id}`,
      icon: 'ph:computer-tower',
    })
  }

  if (props.discussion.referendum_id) {
    links.push({
      label: `Referendum thread - ${props.discussion.referendum_id}`,
      href: `/votes/${props.discussion.referendum_id}`,
      icon: 'ph:user-sound',
    })
  }

  if (props.discussion.theme_id) {
    links.push({
      label: `Theme - ${props.discussion.theme_id}`,
      href: `/themes/${props.discussion.theme_id}`,
      icon: 'ph:paint-brush',
    })
  }

  if (props.discussion.discussion_topic_id) {
    const discussionSlug = props.discussion.slug ?? props.discussion.id
    links.push({
      label: `Forum thread - ${discussionSlug}`,
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
    assetsPage.value = 1
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

    if (data) {
      discussionCache.set(data as Tables<'discussions'>)
      emit('updated', data as DiscussionRecord)
    }

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
            <NuxtLink :to="`/forum/${props.discussion.slug ?? props.discussion.id}`" target="_blank">
              {{ props.discussion.title || 'Untitled discussion' }}
            </NuxtLink>
          </p>
        </Flex>

        <Flex y-center gap="xs">
          <DiscussionActions
            v-if="props.discussion && canUpdate"
            :discussion="props.discussion"
            hide-pin-button
            :show-labels="!isMobile"
            :size="isMobile ? 'm' : undefined"
            @updated="emit('updated', $event as DiscussionRecord)"
          />

          <Button
            v-if="canUpdate && isMobile"
            variant="gray"
            square
            @click="editSheetOpen = true"
          >
            <Icon name="ph:pencil-simple" />
          </Button>
          <Button
            v-else-if="canUpdate"
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
            <CountDisplay :value="props.discussion.reply_count" />
          </Grid>

          <Grid class="detail-item" expand columns="1fr 2fr">
            <span class="text-color-light text-bold">Views:</span>
            <CountDisplay :value="props.discussion.view_count" />
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
          <MarkdownRenderer v-if="discussionMarkdown" :md="discussionMarkdown" />
          <p v-else-if="contentLoading" class="text-color-lighter text-s">
            Loading content...
          </p>
          <p v-else class="text-color-lighter text-s">
            No content provided.
          </p>
        </Flex>
      </Card>

      <template v-if="hasReplies">
        <Flex v-if="showRepliesBetween" expand x-center class="py-xs">
          <span class="text-color-lighter text-s">{{ threadReplyCountText }}</span>
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
            <MarkdownRenderer v-else-if="lastReply?.markdown" :md="lastReply.markdown" />
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
          <Flex x-between y-center expand>
            <Flex y-center gap="xs">
              <h5 class="text-bold">
                Assets
              </h5>
              <span class="text-xxs text-color-light">Forums bucket - {{ assetsSummary }}</span>
            </Flex>
            <Flex y-center gap="s">
              <Select
                v-model="assetSortModel"
                :options="assetSortOptions"
                placeholder="Sort"
                single
                size="s"
                style="width: 160px;"
              />
            </Flex>
          </Flex>

          <Alert v-if="assetsError" variant="danger">
            {{ assetsError }}
          </Alert>

          <p v-else-if="assetsLoading" class="text-color-lighter text-xs">
            Loading assets...
          </p>

          <template v-else-if="assets.length">
            <Flex expand column gap="s" class="assets-content" :class="{ 'is-reloading': assetsReloading }">
              <AssetGrid
                :assets="assets"
                :is-forums-bucket="true"
                :forum-context-id="props.discussion?.id"
                click-to-preview
              />
              <Flex v-if="assetsShouldPaginate" x-center y-center expand>
                <Pagination :pagination="assetsPaginationState" @change="setAssetsPage" />
              </Flex>
            </Flex>
          </template>

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
.assets-content {
  transition: opacity var(--transition-slow);

  &.is-reloading {
    opacity: 0.4;
    pointer-events: none;
  }
}

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
