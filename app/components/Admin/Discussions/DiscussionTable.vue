<script setup lang="ts">
import type { Ref } from 'vue'
import type { Tables } from '@/types/database.overrides'

import { Alert, Badge, Button, defineTable, Flex, paginate, Pagination, Table } from '@dolanske/vui'
import { watchDebounced } from '@vueuse/core'
import { computed, inject, onBeforeMount, ref, watch } from 'vue'
import DiscussionActions from '@/components/Admin/Discussions/DiscussionActions.vue'

import DiscussionDetails from '@/components/Admin/Discussions/DiscussionDetails.vue'
import DiscussionEditSheet from '@/components/Admin/Discussions/DiscussionEditSheet.vue'
import DiscussionFilters from '@/components/Admin/Discussions/DiscussionFilters.vue'
import TableSkeleton from '@/components/Admin/Shared/TableSkeleton.vue'
import CountDisplay from '@/components/Shared/CountDisplay.vue'
import TableContainer from '@/components/Shared/TableContainer.vue'
import UserLink from '@/components/Shared/UserLink.vue'
import { getUserActivityStatus } from '@/lib/lastSeen'
import { useBreakpoint } from '@/lib/mediaQuery'
import { getRouteQueryString } from '@/lib/utils/common'

interface SelectOption {
  label: string
  value: string
}

// ─── RPC return shape ─────────────────────────────────────────────────────────

interface RpcDiscussion {
  id: string
  title: string | null
  description: string | null
  slug: string | null
  created_at: string
  modified_at: string | null
  is_locked: boolean | null
  is_sticky: boolean | null
  is_archived: boolean | null
  is_draft: boolean | null
  reply_count: number | null
  view_count: number | null
  discussion_topic_id: string | null
  profile_id: string | null
  project_id: number | null
  event_id: number | null
  gameserver_id: number | null
  referendum_id: number | null
  created_by: string | null
  modified_by: string | null
  // Joined flat fields
  created_by_username: string | null
  profile_username: string | null
  project_title: string | null
  event_title: string | null
  gameserver_name: string | null
  referendum_title: string | null
  discussion_topic_name: string | null
  // Last reply
  last_reply_at: string | null
  last_reply_by: string | null
  // Pagination
  total_count: number
}

// ─── Signals & routing ────────────────────────────────────────────────────────

const refreshSignal = defineModel<number>('refreshSignal', { default: 0 })

const supabase = useSupabaseClient()
const route = useRoute()
const router = useRouter()

// ─── Permissions ──────────────────────────────────────────────────────────────

const { hasPermission } = useAdminPermissions()

const canView = computed(() => hasPermission('discussions.read'))
const canUpdate = computed(() => hasPermission('discussions.update'))
const canDelete = computed(() => hasPermission('discussions.delete'))
const canManageActions = computed(() => canUpdate.value || canDelete.value)

if (!canView.value) {
  throw createError({
    statusCode: 403,
    statusMessage: 'Insufficient permissions to view discussions',
  })
}

// ─── Filter options ───────────────────────────────────────────────────────────

const statusOptions: SelectOption[] = [
  { label: 'Open', value: 'open' },
  { label: 'Locked', value: 'locked' },
  { label: 'Pinned', value: 'pinned' },
  { label: 'Archived', value: 'archived' },
  { label: 'Draft', value: 'draft' },
]

const contextOptions: SelectOption[] = [
  { label: 'Events', value: 'events' },
  { label: 'Forum', value: 'general' },
  { label: 'Gameservers', value: 'gameservers' },
  { label: 'Orphaned', value: 'other' },
  { label: 'Profiles', value: 'profiles' },
  { label: 'Projects', value: 'projects' },
  { label: 'Referendums', value: 'referendums' },
]

// ─── Layout ───────────────────────────────────────────────────────────────────

const isBelowMedium = useBreakpoint('<m')

// ─── State ────────────────────────────────────────────────────────────────────

const loading = ref(true)
const initialLoad = ref(true)
const errorMessage = ref('')
const discussions = ref<RpcDiscussion[]>([])

const search = ref('')
const statusFilter = ref<SelectOption[]>([])
const contextFilter = ref<SelectOption[]>([])
const authorFilter = ref<{ id: string, username: string } | null>(null)

// ─── Pagination & sort ────────────────────────────────────────────────────────

const page = ref(1)
const adminTablePerPage = inject<Ref<number>>('adminTablePerPage', computed(() => 10))
const totalCount = ref(0)

const sortCol = ref('last_active')
const sortDir = ref<'asc' | 'desc'>('desc')

const paginationState = computed(() => paginate(totalCount.value, page.value, adminTablePerPage.value))
const shouldShowPagination = computed(() => totalCount.value > adminTablePerPage.value)

// ─── Detail / edit state ──────────────────────────────────────────────────────

const selectedDiscussion = ref<RpcDiscussion | null>(null)
const showDiscussionDetails = ref(false)

const editingDiscussion = ref<RpcDiscussion | null>(null)
const showDiscussionEdit = ref(false)

const focusedDiscussionId = computed(() => getRouteQueryString(route.query.discussion))

// ─── VUI defineTable (used only to provide TableSelectionProvideSymbol) ───────

defineTable(discussions, { pagination: { enabled: false }, select: false })

// ─── Helper functions ─────────────────────────────────────────────────────────

function getLastActiveAt(discussion: RpcDiscussion): string | null {
  return discussion.last_reply_at ?? discussion.created_at ?? null
}

function getLastReplierId(discussion: RpcDiscussion): string | null {
  return discussion.last_reply_by ?? discussion.created_by ?? null
}

function toActionsProps(discussion: RpcDiscussion) {
  return {
    id: discussion.id,
    is_locked: discussion.is_locked === true,
    is_sticky: discussion.is_sticky === true,
    discussion_topic_id: discussion.discussion_topic_id,
    is_archived: discussion.is_archived === true,
  }
}

function getLastActiveText(discussion: RpcDiscussion): string {
  const lastActiveAt = getLastActiveAt(discussion)
  if (!lastActiveAt)
    return 'Never'
  const timestamp = new Date(lastActiveAt)
  if (Number.isNaN(timestamp.getTime()))
    return 'Never'
  const status = getUserActivityStatus(timestamp)
  if (status.isActive)
    return 'Active now'
  return status.lastSeenText.replace('Last seen', 'Last active')
}

function getContextType(discussion: RpcDiscussion): string {
  if (discussion.profile_id)
    return 'profiles'
  if (discussion.project_id)
    return 'projects'
  if (discussion.event_id)
    return 'events'
  if (discussion.gameserver_id)
    return 'gameservers'
  if (discussion.referendum_id)
    return 'referendums'
  if (discussion.discussion_topic_id)
    return 'forum'
  return 'other'
}

function getContextLabel(discussion: RpcDiscussion): string {
  const context = getContextType(discussion)
  if (context === 'forum') {
    const topicName = discussion.discussion_topic_name
    return topicName ? `Forum - ${topicName}` : 'Forum'
  }
  if (context === 'profiles') {
    const profileName = discussion.profile_username ?? discussion.profile_id
    return profileName ? `Profile - ${profileName}` : 'Profile'
  }
  if (context === 'projects') {
    const projectTitle = discussion.project_title
    return projectTitle ? `Project - ${projectTitle}` : 'Project'
  }
  if (context === 'events') {
    const eventTitle = discussion.event_title
    return eventTitle ? `Event - ${eventTitle}` : 'Event'
  }
  if (context === 'gameservers') {
    const gameserverName = discussion.gameserver_name
    return gameserverName ? `Gameserver - ${gameserverName}` : 'Gameserver'
  }
  if (context === 'referendums') {
    const referendumTitle = discussion.referendum_title
    return referendumTitle ? `Referendum - ${referendumTitle}` : 'Referendum'
  }
  return 'Orphaned'
}

function getContextLink(discussion: RpcDiscussion): string | null {
  if (discussion.profile_id) {
    const profileName = discussion.profile_username ?? discussion.profile_id
    return `/profile/${profileName}`
  }
  if (discussion.project_id)
    return `/community/projects/${discussion.project_id}`
  if (discussion.event_id)
    return `/events/${discussion.event_id}`
  if (discussion.gameserver_id)
    return `/servers/gameservers/${discussion.gameserver_id}`
  if (discussion.referendum_id)
    return `/votes/${discussion.referendum_id}`
  if (discussion.discussion_topic_id)
    return `/forum?activeTopicId=${encodeURIComponent(discussion.discussion_topic_id)}`
  return null
}

// ─── Sorting ──────────────────────────────────────────────────────────────────

// Maps display column label -> RPC p_sort_col value
const sortColMap: Record<string, string> = {
  'Title': 'title',
  'Replies': 'replies',
  'Views': 'views',
  'Last Active': 'last_active',
  'Author': 'created_at',
}

function handleSort(label: string) {
  const col = sortColMap[label]
  if (!col)
    return
  if (sortCol.value === col) {
    sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc'
  }
  else {
    sortCol.value = col
    sortDir.value = 'desc'
  }
  page.value = 1
  void fetchDiscussions()
}

function sortIcon(label: string): string {
  const col = sortColMap[label]
  if (!col || sortCol.value !== col)
    return 'ph:arrows-down-up'
  return sortDir.value === 'asc' ? 'ph:arrow-up' : 'ph:arrow-down'
}

// ─── Fetch ────────────────────────────────────────────────────────────────────

async function fetchDiscussions() {
  loading.value = true
  errorMessage.value = ''

  try {
    const pStatus = (statusFilter.value ?? []).map(o => o.value)
    const pContext = (contextFilter.value ?? []).map(o => o.value)

    const { data, error } = await supabase.rpc('get_admin_discussions_paginated', {
      p_search: search.value,
      p_status: pStatus,
      p_context: pContext,
      p_author_id: authorFilter.value?.id ?? null,
      p_sort_col: sortCol.value,
      p_sort_dir: sortDir.value,
      p_limit: adminTablePerPage.value,
      p_offset: (page.value - 1) * adminTablePerPage.value,
    })

    if (error)
      throw error

    const rows = (data ?? []) as RpcDiscussion[]
    discussions.value = rows
    totalCount.value = rows[0]?.total_count ?? 0
  }
  catch (err) {
    errorMessage.value = err instanceof Error ? err.message : 'Failed to load discussions'
  }
  finally {
    initialLoad.value = false
    loading.value = false
  }
}

// ─── Pagination handler ───────────────────────────────────────────────────────

function setPage(n: number) {
  page.value = n
  void fetchDiscussions()
}

// ─── Filters ─────────────────────────────────────────────────────────────────

const isFiltered = computed(() =>
  Boolean(
    search.value
    || (statusFilter.value && statusFilter.value.length > 0)
    || (contextFilter.value && contextFilter.value.length > 0)
    || authorFilter.value !== null,
  ),
)

function clearFilters() {
  search.value = ''
  statusFilter.value = []
  contextFilter.value = []
  authorFilter.value = null
}

// ─── Detail / edit handlers ───────────────────────────────────────────────────

function openDiscussionDetails(discussion: RpcDiscussion) {
  selectedDiscussion.value = discussion
  showDiscussionDetails.value = true
}

function openDiscussionEdit(discussion: RpcDiscussion) {
  editingDiscussion.value = discussion
  showDiscussionEdit.value = true
}

function openDiscussionById(discussionId: string): boolean {
  const match = discussions.value.find(d => d.id === discussionId)
  if (!match)
    return false
  openDiscussionDetails(match)
  return true
}

function handleDiscussionUpdated(_updated: Tables<'discussions'>) {
  // Re-fetch the current page so server state is the source of truth
  void fetchDiscussions()
}

function handleDiscussionDeleted(discussionId: string) {
  discussions.value = discussions.value.filter(d => d.id !== discussionId)
  totalCount.value = Math.max(0, totalCount.value - 1)
  if (selectedDiscussion.value?.id === discussionId) {
    selectedDiscussion.value = null
    showDiscussionDetails.value = false
  }
}

// ─── URL deep-link ────────────────────────────────────────────────────────────

watch(showDiscussionDetails, (isOpen) => {
  if (isOpen && selectedDiscussion.value) {
    router.replace({
      query: {
        ...route.query,
        discussion: selectedDiscussion.value.id,
      },
    })
    return
  }

  if (isOpen)
    return

  if (!route.query.discussion)
    return

  const { discussion: _discussion, ...rest } = route.query
  router.replace({ query: rest })
})

// Only open the details panel once after the initial load completes.
// Do NOT watch loading.value - that would re-run every time a fetch starts/ends.
watch(focusedDiscussionId, (discussionId) => {
  if (loading.value || !discussionId)
    return
  openDiscussionById(discussionId)
})

// ─── Watchers for filters / sort / perPage ────────────────────────────────────

watchDebounced(search, () => {
  page.value = 1
  void fetchDiscussions()
}, { debounce: 300 })

watch([statusFilter, contextFilter], () => {
  page.value = 1
  void fetchDiscussions()
}, { deep: true })

watch(authorFilter, () => {
  page.value = 1
  void fetchDiscussions()
})

watch(adminTablePerPage, () => {
  if (page.value !== 1) {
    page.value = 1
    // fall through to explicit call below
  }
  void fetchDiscussions()
})

watch(() => refreshSignal.value, (val) => {
  if (val > 0)
    void fetchDiscussions()
})

// ─── Lifecycle ────────────────────────────────────────────────────────────────

onBeforeMount(async () => {
  await fetchDiscussions()
  // After the initial load, honour any ?discussion= query param
  const discussionId = focusedDiscussionId.value
  if (discussionId)
    openDiscussionById(discussionId)
})
</script>

<template>
  <Flex column gap="l" expand>
    <Alert v-if="errorMessage" variant="danger">
      {{ errorMessage }}
    </Alert>

    <Flex v-else-if="initialLoad" gap="s" column expand>
      <Flex :column="isBelowMedium" :x-between="!isBelowMedium" :x-start="isBelowMedium" y-center gap="s" expand>
        <DiscussionFilters
          v-model:search="search"
          v-model:status-filter="statusFilter"
          v-model:context-filter="contextFilter"
          v-model:author-filter="authorFilter"
          :status-options="statusOptions"
          :context-options="contextOptions"
          @clear-filters="clearFilters"
        />
      </Flex>
      <TableSkeleton :columns="6" :rows="10" />
    </Flex>

    <Flex v-else gap="s" column expand>
      <Flex :column="isBelowMedium" :x-between="!isBelowMedium" :x-start="isBelowMedium" y-center gap="s" expand>
        <DiscussionFilters
          v-model:search="search"
          v-model:status-filter="statusFilter"
          v-model:context-filter="contextFilter"
          v-model:author-filter="authorFilter"
          :status-options="statusOptions"
          :context-options="contextOptions"
          @clear-filters="clearFilters"
        />
        <Flex gap="s" style="min-width: 100px" x-end>
          <span class="text-color-lighter text-s">
            {{ isFiltered ? `Filtered ${totalCount}` : `Total ${totalCount}` }}
          </span>
        </Flex>
      </Flex>

      <div class="table-loading-wrapper" :class="{ 'table-loading': loading && !initialLoad }">
        <TableContainer>
          <Table.Root v-if="discussions.length > 0" separate-cells class="mb-l">
            <template #header>
              <!-- Title -->
              <Table.Head class="sortable-head" @click="handleSort('Title')">
                <Flex gap="xs" y-center>
                  Title
                  <Icon :name="sortIcon('Title')" size="14" class="sort-icon" />
                </Flex>
              </Table.Head>

              <!-- Context - not sortable -->
              <Table.Head>Context</Table.Head>

              <!-- Replies -->
              <Table.Head class="sortable-head" @click="handleSort('Replies')">
                <Flex gap="xs" y-center>
                  Replies
                  <Icon :name="sortIcon('Replies')" size="14" class="sort-icon" />
                </Flex>
              </Table.Head>

              <!-- Views -->
              <Table.Head class="sortable-head" @click="handleSort('Views')">
                <Flex gap="xs" y-center>
                  Views
                  <Icon :name="sortIcon('Views')" size="14" class="sort-icon" />
                </Flex>
              </Table.Head>

              <!-- Last Active -->
              <Table.Head class="sortable-head" @click="handleSort('Last Active')">
                <Flex gap="xs" y-center>
                  Last Active
                  <Icon :name="sortIcon('Last Active')" size="14" class="sort-icon" />
                </Flex>
              </Table.Head>

              <!-- Author -->
              <Table.Head class="sortable-head" @click="handleSort('Author')">
                <Flex gap="xs" y-center>
                  Author
                  <Icon :name="sortIcon('Author')" size="14" class="sort-icon" />
                </Flex>
              </Table.Head>

              <!-- Status - not sortable -->
              <Table.Head>Status</Table.Head>

              <!-- Actions - not sortable -->
              <Table.Head v-if="canManageActions">
                Actions
              </Table.Head>
            </template>

            <template #body>
              <tr
                v-for="discussion in discussions"
                :key="discussion.id"
                class="clickable-row"
                @click="openDiscussionDetails(discussion)"
              >
                <!-- Title + description -->
                <Table.Cell>
                  <Flex column :gap="0">
                    <span class="text-bold">{{ discussion.title || 'Untitled discussion' }}</span>
                    <span v-if="discussion.description" class="text-color-lighter text-xs description-truncate">
                      {{ discussion.description }}
                    </span>
                  </Flex>
                </Table.Cell>

                <!-- Context -->
                <Table.Cell>
                  <NuxtLink
                    v-if="getContextLink(discussion)"
                    :to="getContextLink(discussion)!"
                    class="text-m text-color-accent"
                    @click.stop
                  >
                    {{ getContextLabel(discussion) }}
                  </NuxtLink>
                  <span v-else :class="{ 'text-color-red': getContextType(discussion) === 'other' }">
                    {{ getContextLabel(discussion) }}
                  </span>
                </Table.Cell>

                <!-- Replies -->
                <Table.Cell>
                  <CountDisplay :value="discussion.reply_count ?? 0" />
                </Table.Cell>

                <!-- Views -->
                <Table.Cell>
                  <CountDisplay :value="discussion.view_count ?? 0" />
                </Table.Cell>

                <!-- Last Active -->
                <Table.Cell>
                  <Flex column :gap="0">
                    <UserLink
                      :user-id="getLastReplierId(discussion)"
                      placeholder="Unknown"
                      show-avatar
                    />
                    <span class="text-color-lighter text-xs">
                      {{ getLastActiveText(discussion) }}
                    </span>
                  </Flex>
                </Table.Cell>

                <!-- Author -->
                <Table.Cell>
                  <UserLink :user-id="discussion.created_by" placeholder="Unknown" show-avatar />
                </Table.Cell>

                <!-- Status badges -->
                <Table.Cell @click.stop>
                  <Flex gap="xs" wrap>
                    <Badge :variant="discussion.is_locked ? 'danger' : 'success'">
                      {{ discussion.is_locked ? 'Locked' : 'Open' }}
                    </Badge>
                    <Badge v-if="discussion.is_sticky" variant="accent">
                      Pinned
                    </Badge>
                    <Badge v-if="discussion.is_archived" variant="warning">
                      Archived
                    </Badge>
                    <Badge v-if="discussion.is_draft" variant="neutral">
                      Draft
                    </Badge>
                  </Flex>
                </Table.Cell>

                <!-- Actions -->
                <Table.Cell v-if="canManageActions" @click.stop>
                  <Flex gap="xs">
                    <DiscussionActions
                      v-if="canUpdate"
                      :discussion="toActionsProps(discussion)"
                      size="s"
                      hide-pin-button
                      @updated="handleDiscussionUpdated"
                    />
                    <Button
                      v-if="canUpdate"
                      size="s"
                      variant="gray"
                      square
                      @click="openDiscussionEdit(discussion)"
                    >
                      <Icon name="ph:pencil-simple" />
                    </Button>
                  </Flex>
                </Table.Cell>
              </tr>
            </template>

            <template v-if="shouldShowPagination" #pagination>
              <Pagination :pagination="paginationState" @change="setPage" />
            </template>
          </Table.Root>

          <Alert v-else-if="!loading" variant="info">
            No discussions found
          </Alert>
        </TableContainer>
      </div>
    </Flex>

    <DiscussionDetails
      v-model:is-open="showDiscussionDetails"
      :discussion="(selectedDiscussion as unknown as Tables<'discussions'>)"
      @updated="handleDiscussionUpdated"
      @deleted="handleDiscussionDeleted"
    />

    <DiscussionEditSheet
      v-model:is-open="showDiscussionEdit"
      :discussion="(editingDiscussion as unknown as Tables<'discussions'>)"
      @updated="handleDiscussionUpdated"
      @deleted="handleDiscussionDeleted"
    />
  </Flex>
</template>

<style scoped lang="scss">
.table-loading-wrapper {
  width: 100%;
  overflow: hidden;
  transition: opacity var(--transition-slow);
}

.table-loading {
  opacity: 0.4;
  pointer-events: none;
}

.mb-l {
  margin-bottom: var(--space-l);
}

.clickable-row:hover {
  td {
    cursor: pointer;
    background-color: var(--color-bg-raised);
  }
}

td {
  vertical-align: middle;
}

.description-truncate {
  max-width: 320px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sortable-head {
  cursor: pointer;
  user-select: none;

  &:hover {
    background-color: var(--color-bg-raised);
  }
}

.sort-icon {
  flex-shrink: 0;
}
</style>
