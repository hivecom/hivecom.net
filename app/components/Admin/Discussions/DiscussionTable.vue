<script setup lang="ts">
import type { QueryData } from '@supabase/supabase-js'
import type { Ref } from 'vue'
import type { Tables } from '@/types/database.types'

import { Alert, Badge, defineTable, Flex, Pagination, Table } from '@dolanske/vui'
import { computed, inject, onBeforeMount, ref, watch } from 'vue'

import DiscussionActions from '@/components/Admin/Discussions/DiscussionActions.vue'
import DiscussionDetails from '@/components/Admin/Discussions/DiscussionDetails.vue'
import DiscussionFilters from '@/components/Admin/Discussions/DiscussionFilters.vue'
import TableSkeleton from '@/components/Admin/Shared/TableSkeleton.vue'
import TableContainer from '@/components/Shared/TableContainer.vue'
import UserLink from '@/components/Shared/UserLink.vue'
import { getUserActivityStatus } from '@/lib/lastSeen'
import { useBreakpoint } from '@/lib/mediaQuery'

interface SelectOption {
  label: string
  value: string
}

const refreshSignal = defineModel<number>('refreshSignal', { default: 0 })

const supabase = useSupabaseClient()
const route = useRoute()
const router = useRouter()

const { hasPermission } = useAdminPermissions()

const canView = computed(() =>
  hasPermission('discussions.read') || hasPermission('discussions.manage'),
)
const canUpdate = computed(() =>
  hasPermission('discussions.update') || hasPermission('discussions.manage'),
)
const canDelete = computed(() =>
  hasPermission('discussions.delete') || hasPermission('discussions.manage'),
)

const canManageActions = computed(() =>
  canUpdate.value || canDelete.value,
)

if (!canView.value) {
  throw createError({
    statusCode: 403,
    statusMessage: 'Insufficient permissions to view discussions',
  })
}

const discussionsQuery = supabase
  .from('discussions')
  .select(`
    id,
    title,
    description,
    created_at,
    created_by,
    modified_at,
    modified_by,
    is_locked,
    is_sticky,
    is_archived,
    reply_count,
    view_count,
    slug,
    discussion_topic_id,
    profile_id,
    project_id,
    event_id,
    gameserver_id,
    referendum_id,
    created_by_profile:profiles!discussions_created_by_fkey(id, username),
    profile:profiles!discussions_profile_id_fkey(id, username),
    project:projects(id, title),
    event:events(id, title),
    gameserver:gameservers(id, name),
    referendum:referendums(id, title),
    discussion_topic:discussion_topics(name),
    last_reply:discussion_replies!discussion_replies_discussion_id_fkey(created_at, created_by, modified_at, modified_by)
  `)
  .order('modified_at', { ascending: false })
  .order('created_at', { foreignTable: 'discussion_replies', ascending: false })
  .limit(1, { foreignTable: 'discussion_replies' })

type QueryDiscussion = QueryData<typeof discussionsQuery>[0]

interface TransformedDiscussion {
  'Title': string
  'Context': string
  'Replies': number
  'Views': number
  'Last Active': number
  'Author': string | null
  '_original': QueryDiscussion
}

const loading = ref(true)
const errorMessage = ref('')
const discussions = ref<QueryData<typeof discussionsQuery>>([])

const search = ref('')
const statusFilter = ref<SelectOption[]>([])
const contextFilter = ref<SelectOption[]>([])

const statusOptions: SelectOption[] = [
  { label: 'Open', value: 'open' },
  { label: 'Locked', value: 'locked' },
  { label: 'Pinned', value: 'pinned' },
  { label: 'Archived', value: 'archived' },
]

const contextOptions: SelectOption[] = [
  { label: 'Forum', value: 'forum' },
  { label: 'Profiles', value: 'profiles' },
  { label: 'Projects', value: 'projects' },
  { label: 'Events', value: 'events' },
  { label: 'Gameservers', value: 'gameservers' },
  { label: 'Referendums', value: 'referendums' },
  { label: 'Other', value: 'other' },
]

const isBelowMedium = useBreakpoint('<m')

const selectedDiscussion = ref<QueryDiscussion | null>(null)
const showDiscussionDetails = ref(false)

const focusedDiscussionId = computed(() => {
  const discussionQuery = route.query.discussion
  if (typeof discussionQuery === 'string')
    return discussionQuery
  if (Array.isArray(discussionQuery) && discussionQuery[0])
    return discussionQuery[0]
  return ''
})

const adminTablePerPage = inject<Ref<number>>('adminTablePerPage', computed(() => 10))

type DiscussionReply = Pick<Tables<'discussion_replies'>, 'created_at' | 'created_by' | 'modified_at' | 'modified_by'>

function getLastReply(discussion: QueryDiscussion): DiscussionReply | null {
  const replies = (discussion.last_reply ?? []) as DiscussionReply[]
  return replies[0] ?? null
}

function getLastActiveAt(discussion: QueryDiscussion): string | null {
  const lastReply = getLastReply(discussion)
  return lastReply?.modified_at ?? lastReply?.created_at ?? discussion.modified_at ?? discussion.created_at ?? null
}

function getLastReplierId(discussion: QueryDiscussion): string | null {
  const lastReply = getLastReply(discussion)
  return lastReply?.created_by ?? discussion.created_by ?? null
}

function getLastActiveMs(discussion: QueryDiscussion): number {
  const lastActiveAt = getLastActiveAt(discussion)
  if (!lastActiveAt)
    return 0

  const timestamp = new Date(lastActiveAt).getTime()
  return Number.isNaN(timestamp) ? 0 : timestamp
}

function getLastActiveText(discussion: QueryDiscussion): string {
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

function getContextType(discussion: QueryDiscussion) {
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

function getContextLabel(discussion: QueryDiscussion) {
  const context = getContextType(discussion)
  if (context === 'forum') {
    const topicName = discussion.discussion_topic?.name
    return topicName ? `Forum · ${topicName}` : 'Forum'
  }
  if (context === 'profiles') {
    const profileName = discussion.profile?.username ?? discussion.profile_id
    return profileName ? `Profile · ${profileName}` : 'Profile'
  }
  if (context === 'projects') {
    const projectTitle = discussion.project?.title
    return projectTitle ? `Project · ${projectTitle}` : 'Project'
  }
  if (context === 'events') {
    const eventTitle = discussion.event?.title
    return eventTitle ? `Event · ${eventTitle}` : 'Event'
  }
  if (context === 'gameservers') {
    const gameserverName = discussion.gameserver?.name
    return gameserverName ? `Gameserver · ${gameserverName}` : 'Gameserver'
  }
  if (context === 'referendums') {
    const referendumTitle = discussion.referendum?.title
    return referendumTitle ? `Referendum · ${referendumTitle}` : 'Referendum'
  }
  return 'Other'
}

function getContextLink(discussion: QueryDiscussion) {
  if (discussion.profile_id) {
    const profileName = discussion.profile?.username ?? discussion.profile_id
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

const filteredData = computed<TransformedDiscussion[]>(() => {
  const filtered = discussions.value.filter((discussion: QueryDiscussion) => {
    if (search.value) {
      const needle = search.value.toLowerCase()
      const haystack = [
        discussion.title,
        discussion.description,
        discussion.slug,
        discussion.created_by,
        discussion.modified_by,
        discussion.created_by_profile?.username,
        discussion.profile?.username,
        discussion.project?.title,
        discussion.event?.title,
        discussion.gameserver?.name,
        discussion.referendum?.title,
        discussion.discussion_topic?.name,
      ]
        .filter(Boolean)
        .map(value => String(value).toLowerCase())

      if (!haystack.some(value => value.includes(needle)))
        return false
    }

    const selectedStatuses = (statusFilter.value ?? []).map(option => option.value)
    if (selectedStatuses.length > 0) {
      const matchesOpen = selectedStatuses.includes('open') && !discussion.is_locked && !discussion.is_archived
      const matchesLocked = selectedStatuses.includes('locked') && discussion.is_locked
      const matchesPinned = selectedStatuses.includes('pinned') && discussion.is_sticky
      const matchesArchived = selectedStatuses.includes('archived') && discussion.is_archived

      if (!(matchesOpen || matchesLocked || matchesPinned || matchesArchived))
        return false
    }

    const selectedContexts = (contextFilter.value ?? []).map(option => option.value)
    if (selectedContexts.length > 0) {
      const contextType = getContextType(discussion)
      if (!selectedContexts.includes(contextType))
        return false
    }

    return true
  })

  return filtered.map((discussion: QueryDiscussion) => {
    const lastActiveMs = getLastActiveMs(discussion)

    return {
      'Title': discussion.title || 'Untitled discussion',
      'Context': getContextLabel(discussion),
      'Replies': discussion.reply_count ?? 0,
      'Views': discussion.view_count ?? 0,
      'Last Active': lastActiveMs,
      'Author': discussion.created_by ?? null,
      '_original': discussion,
    }
  })
})

const totalCount = computed(() => discussions.value.length)
const filteredCount = computed(() => filteredData.value.length)
const isFiltered = computed(() =>
  Boolean(
    search.value
    || (statusFilter.value && statusFilter.value.length > 0)
    || (contextFilter.value && contextFilter.value.length > 0),
  ),
)

const { headers, rows, pagination, setPage, setSort, options } = defineTable(filteredData, {
  pagination: {
    enabled: true,
    perPage: adminTablePerPage.value,
  },
  select: false,
})

watch(adminTablePerPage, (perPage) => {
  options.value.pagination.perPage = perPage
  setPage(1)
})

setSort('Last Active', 'desc')

function mergeDiscussion(existing: QueryDiscussion | undefined, updated: Tables<'discussions'>) {
  if (!existing)
    return updated as QueryDiscussion
  return { ...existing, ...updated }
}

function updateDiscussionInState(updated: Tables<'discussions'>) {
  const existing = discussions.value.find((item: QueryDiscussion) => item.id === updated.id)
  const merged = mergeDiscussion(existing, updated)
  discussions.value = discussions.value.map((item: QueryDiscussion) =>
    item.id === updated.id ? merged : item,
  )
}

async function fetchDiscussions() {
  loading.value = true
  errorMessage.value = ''

  try {
    const { data, error } = await discussionsQuery

    if (error)
      throw error

    discussions.value = data || []
  }
  catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Failed to load discussions'
  }
  finally {
    loading.value = false
  }
}

function openDiscussionDetails(discussion: QueryDiscussion) {
  selectedDiscussion.value = discussion
  showDiscussionDetails.value = true
}

function openDiscussionById(discussionId: string): boolean {
  const match = discussions.value.find((discussion: QueryDiscussion) => discussion.id === discussionId)
  if (!match)
    return false

  openDiscussionDetails(match)
  return true
}

function clearFilters() {
  search.value = ''
  statusFilter.value = []
  contextFilter.value = []
}

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

  const { discussion, ...rest } = route.query
  router.replace({ query: rest })
})

watch(
  () => [focusedDiscussionId.value, loading.value] as const,
  ([discussionId, isLoading]) => {
    if (isLoading)
      return
    if (!discussionId)
      return
    openDiscussionById(discussionId)
  },
  { immediate: true },
)

watch(() => refreshSignal.value, () => {
  if (refreshSignal.value > 0) {
    fetchDiscussions()
  }
})

onBeforeMount(fetchDiscussions)

function handleDiscussionUpdated(updated: Tables<'discussions'>) {
  updateDiscussionInState(updated)
  if (selectedDiscussion.value?.id === updated.id) {
    selectedDiscussion.value = mergeDiscussion(selectedDiscussion.value, updated)
  }
}

function handleDiscussionDeleted(discussionId: string) {
  discussions.value = discussions.value.filter((item: QueryDiscussion) => item.id !== discussionId)
  if (selectedDiscussion.value?.id === discussionId) {
    selectedDiscussion.value = null
    showDiscussionDetails.value = false
  }
}
</script>

<template>
  <Flex column gap="l" expand>
    <Alert v-if="errorMessage" variant="danger">
      {{ errorMessage }}
    </Alert>

    <template v-else-if="loading">
      <Flex gap="s" column expand>
        <Flex :column="isBelowMedium" :x-between="!isBelowMedium" :x-start="isBelowMedium" y-center gap="s" expand>
          <DiscussionFilters
            v-model:search="search"
            v-model:status-filter="statusFilter"
            v-model:context-filter="contextFilter"
            :status-options="statusOptions"
            :context-options="contextOptions"
            @clear-filters="clearFilters"
          />
        </Flex>

        <TableSkeleton :columns="6" :rows="10" />
      </Flex>
    </template>

    <template v-else>
      <Flex :column="isBelowMedium" :x-between="!isBelowMedium" :x-start="isBelowMedium" y-center gap="s" expand>
        <DiscussionFilters
          v-model:search="search"
          v-model:status-filter="statusFilter"
          v-model:context-filter="contextFilter"
          :status-options="statusOptions"
          :context-options="contextOptions"
          @clear-filters="clearFilters"
        />
        <Flex gap="s" expand x-end>
          <span class="text-color-lighter text-s">Total {{ totalCount }}</span>
          <span v-if="isFiltered" class="text-color-lighter text-s">Filtered {{ filteredCount }}</span>
        </Flex>
      </Flex>

      <TableContainer>
        <Table.Root v-if="rows.length > 0" separate-cells :loading="loading" class="mb-l">
          <template #header>
            <Table.Head v-for="header in headers.filter(header => header.label !== '_original')" :key="header.label" sort :header />
            <Table.Head
              key="status"
              :header="{ label: 'Status',
                         sortToggle: () => {} }"
            />
            <Table.Head
              v-if="canManageActions"
              key="actions"
              :header="{ label: 'Actions',
                         sortToggle: () => {} }"
            />
          </template>

          <template #body>
            <tr
              v-for="discussion in rows"
              :key="discussion._original.id"
              class="clickable-row"
              @click="openDiscussionDetails(discussion._original as QueryDiscussion)"
            >
              <Table.Cell>
                <Flex column :gap="0">
                  <span class="text-bold">{{ discussion.Title }}</span>
                  <span v-if="discussion._original.description" class="text-color-lighter text-xs description-truncate">
                    {{ discussion._original.description }}
                  </span>
                </Flex>
              </Table.Cell>

              <Table.Cell>
                <NuxtLink
                  v-if="getContextLink(discussion._original as QueryDiscussion)"
                  :to="getContextLink(discussion._original as QueryDiscussion)!"
                  class="text-m text-color-accent"
                  @click.stop
                >
                  {{ discussion.Context }}
                </NuxtLink>
                <span v-else>{{ discussion.Context }}</span>
              </Table.Cell>

              <Table.Cell>{{ discussion.Replies }}</Table.Cell>

              <Table.Cell>{{ discussion.Views }}</Table.Cell>

              <Table.Cell>
                <Flex column :gap="0">
                  <UserLink
                    :user-id="getLastReplierId(discussion._original as QueryDiscussion)"
                    placeholder="Unknown"
                    show-avatar
                  />
                  <span class="text-color-lighter text-xs">
                    {{ getLastActiveText(discussion._original as QueryDiscussion) }}
                  </span>
                </Flex>
              </Table.Cell>

              <Table.Cell>
                <UserLink :user-id="discussion.Author" placeholder="Unknown" show-avatar />
              </Table.Cell>

              <Table.Cell @click.stop>
                <Flex gap="xs" wrap>
                  <Badge :variant="discussion._original.is_locked ? 'danger' : 'success'">
                    {{ discussion._original.is_locked ? 'Locked' : 'Open' }}
                  </Badge>
                  <Badge v-if="discussion._original.is_sticky" variant="accent">
                    Pinned
                  </Badge>
                  <Badge v-if="discussion._original.is_archived" variant="warning">
                    Archived
                  </Badge>
                </Flex>
              </Table.Cell>

              <Table.Cell v-if="canManageActions" @click.stop>
                <DiscussionActions
                  v-if="canUpdate"
                  :discussion="discussion._original as QueryDiscussion"
                  size="s"
                  show-labels
                  @updated="handleDiscussionUpdated"
                />
              </Table.Cell>
            </tr>
          </template>

          <template v-if="filteredData.length > adminTablePerPage" #pagination>
            <Pagination :pagination="pagination" @change="setPage" />
          </template>
        </Table.Root>

        <Alert v-else variant="info">
          No discussions found
        </Alert>
      </TableContainer>
    </template>
  </Flex>

  <DiscussionDetails
    v-model:is-open="showDiscussionDetails"
    :discussion="selectedDiscussion"
    @updated="handleDiscussionUpdated"
    @deleted="handleDiscussionDeleted"
  />
</template>

<style scoped lang="scss">
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
</style>
