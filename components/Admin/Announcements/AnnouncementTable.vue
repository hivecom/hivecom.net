<script setup lang="ts">
import type { QueryData } from '@supabase/supabase-js'
import type { TablesInsert, TablesUpdate } from '@/types/database.types'

import { Alert, Badge, Button, defineTable, Flex, Pagination, Table } from '@dolanske/vui'
import AdminActions from '@/components/Admin/Shared/AdminActions.vue'
import TableSkeleton from '@/components/Admin/Shared/TableSkeleton.vue'

import TableContainer from '@/components/Shared/TableContainer.vue'
import TimestampDate from '@/components/Shared/TimestampDate.vue'
import AnnouncementDetails from './AnnouncementDetails.vue'
import AnnouncementFilters from './AnnouncementFilters.vue'
import AnnouncementForm from './AnnouncementForm.vue'

// Type from the query result
type QueryAnnouncement = QueryData<typeof announcementsQuery>[0]

// Define interface for transformed announcement data
interface TransformedAnnouncement {
  Title: string
  Description: string | null
  Tags: string[] | null
  Pinned: boolean
  Created: string
  _original: QueryAnnouncement
}

// Define interface for Select options
interface SelectOption {
  label: string
  value: string
}

// Define model value for refresh signal to parent
const refreshSignal = defineModel<number>('refreshSignal', { default: 0 })

// Get admin permissions
const { canManageResource, canCreate } = useTableActions('announcements')

// Define query
const supabase = useSupabaseClient()
const user = useSupabaseUser()
const announcementsQuery = supabase.from('announcements').select(`
  *
`)

// Data states
const loading = ref(true)
const errorMessage = ref('')
const announcements = ref<QueryData<typeof announcementsQuery>>([])
const search = ref('')
const pinnedFilter = ref<SelectOption[]>()
const tagFilter = ref<SelectOption[]>([])

// Announcement detail state
const selectedAnnouncement = ref<QueryAnnouncement | null>(null)
const showAnnouncementDetails = ref(false)

// Announcement form state
const showAnnouncementForm = ref(false)
const isEditMode = ref(false)

// Filter options
const pinnedOptions: SelectOption[] = [
  { label: 'Pinned', value: 'true' },
  { label: 'Not Pinned', value: 'false' },
]

// Compute unique tag options from all announcements
const tagOptions = computed<SelectOption[]>(() => {
  const allTags = new Set<string>()
  announcements.value.forEach((announcement) => {
    if (announcement.tags) {
      announcement.tags.forEach(tag => allTags.add(tag))
    }
  })
  return Array.from(allTags).sort().map(tag => ({
    label: tag,
    value: tag,
  }))
})

// Filter based on search, pinned status, and tags
const filteredData = computed<TransformedAnnouncement[]>(() => {
  const filtered = announcements.value.filter((item) => {
    // Filter by search term
    if (search.value && !Object.values(item).some((value) => {
      if (value === null || value === undefined)
        return false
      return String(value).toLowerCase().includes(search.value.toLowerCase())
    })) {
      return false
    }

    // Filter by pinned status
    if (pinnedFilter.value && pinnedFilter.value.length > 0) {
      const isPinned = pinnedFilter.value.some(filter =>
        (filter.value === 'true' && item.pinned)
        || (filter.value === 'false' && !item.pinned),
      )
      if (!isPinned)
        return false
    }

    // Filter by tags
    if (tagFilter.value && tagFilter.value.length > 0) {
      const selectedTags = tagFilter.value.map((option: SelectOption) => option.value)
      if (!item.tags || !selectedTags.some((tag: string) => item.tags!.includes(tag))) {
        return false
      }
    }

    return true
  })

  // Transform the data into explicit key-value pairs
  return filtered.map(announcement => ({
    Title: announcement.title,
    Description: announcement.description || 'No description',
    Tags: announcement.tags || null,
    Pinned: announcement.pinned,
    Created: announcement.created_at,
    // Keep the original object to use when emitting events
    _original: announcement,
  }))
})

// Table configuration
const { headers, rows, pagination, setPage, setSort } = defineTable(filteredData, {
  pagination: {
    enabled: true,
    perPage: 10,
  },
  select: false,
})

// Set default sorting.
setSort('Created', 'desc')

// Fetch announcements data
async function fetchAnnouncements() {
  loading.value = true
  errorMessage.value = ''

  try {
    const { data, error } = await announcementsQuery

    if (error) {
      throw error
    }

    announcements.value = data || []
    // Increment the refresh signal to notify the parent
    refreshSignal.value = (refreshSignal.value || 0) + 1
  }
  catch (error: unknown) {
    errorMessage.value = error instanceof Error ? error.message : 'An error occurred while loading announcements'
  }
  finally {
    loading.value = false
  }
}

// Handle row click - View announcement details
function viewAnnouncement(announcement: QueryAnnouncement) {
  selectedAnnouncement.value = announcement
  showAnnouncementDetails.value = true
}

// Open the add announcement form
function openAddAnnouncementForm() {
  selectedAnnouncement.value = null
  isEditMode.value = false
  showAnnouncementForm.value = true
}

// Open the edit announcement form
function openEditAnnouncementForm(announcement: QueryAnnouncement, event?: Event) {
  // Prevent the click from triggering the view details
  if (event)
    event.stopPropagation()

  selectedAnnouncement.value = announcement
  isEditMode.value = true
  showAnnouncementForm.value = true
}

// Handle edit from AnnouncementDetails
function handleEditFromDetails(announcement: QueryAnnouncement) {
  openEditAnnouncementForm(announcement)
}

// Handle announcement save (both create and update)
async function handleAnnouncementSave(announcementData: TablesInsert<'announcements'> | TablesUpdate<'announcements'>) {
  try {
    if (isEditMode.value && selectedAnnouncement.value) {
      // Update existing announcement
      const updateData = {
        ...announcementData,
        modified_at: new Date().toISOString(),
        modified_by: user.value?.id,
      }

      const { error } = await supabase
        .from('announcements')
        .update(updateData)
        .eq('id', selectedAnnouncement.value.id)

      if (error)
        throw error
    }
    else {
      // Create new announcement with creation and modification tracking
      const createData = {
        ...announcementData,
        created_by: user.value?.id,
        modified_by: user.value?.id,
        modified_at: new Date().toISOString(),
      }

      const { error } = await supabase
        .from('announcements')
        .insert(createData as TablesInsert<'announcements'>)

      if (error)
        throw error
    }

    // Refresh announcements data and close form
    showAnnouncementForm.value = false
    await fetchAnnouncements()
  }
  catch (error: unknown) {
    errorMessage.value = error instanceof Error ? error.message : 'An error occurred while saving the announcement'
  }
}

// Handle announcement deletion
async function handleAnnouncementDelete(announcementId: number) {
  try {
    const { error } = await supabase
      .from('announcements')
      .delete()
      .eq('id', announcementId)

    if (error)
      throw error

    showAnnouncementForm.value = false
    await fetchAnnouncements()
  }
  catch (error: unknown) {
    errorMessage.value = error instanceof Error ? error.message : 'An error occurred while deleting the announcement'
  }
}

// Clear all filters
function clearFilters() {
  search.value = ''
  pinnedFilter.value = undefined
  tagFilter.value = []
}

// Lifecycle hooks
onBeforeMount(fetchAnnouncements)
</script>

<template>
  <!-- Error message -->
  <Alert v-if="errorMessage" variant="danger">
    {{ errorMessage }}
  </Alert>

  <!-- Loading state -->
  <template v-else-if="loading">
    <Flex gap="s" column expand>
      <!-- Header and filters -->
      <Flex x-between expand>
        <AnnouncementFilters
          v-model:search="search"
          v-model:pinned-filter="pinnedFilter"
          v-model:tag-filter="tagFilter"
          :pinned-options="pinnedOptions"
          :tag-options="tagOptions"
          @clear-filters="clearFilters"
        />

        <Button v-if="canCreate" variant="accent" loading>
          <template #start>
            <Icon name="ph:plus" />
          </template>
          Add Announcement
        </Button>
      </Flex>

      <!-- Table skeleton -->
      <TableSkeleton
        :columns="5"
        :rows="10"
        :show-actions="canManageResource"
      />
    </Flex>
  </template>

  <Flex v-else gap="s" column expand>
    <!-- Header and filters -->
    <Flex x-between expand>
      <AnnouncementFilters
        v-model:search="search"
        v-model:pinned-filter="pinnedFilter"
        v-model:tag-filter="tagFilter"
        :pinned-options="pinnedOptions"
        :tag-options="tagOptions"
        @clear-filters="clearFilters"
      />

      <Button v-if="canCreate" variant="accent" @click="openAddAnnouncementForm">
        <template #start>
          <Icon name="ph:plus" />
        </template>
        Add Announcement
      </Button>
    </Flex>

    <TableContainer>
      <Table.Root v-if="rows && rows.length > 0" separate-cells :loading="loading" class="mb-l">
        <template #header>
          <Table.Head v-for="header in headers.filter(header => header.label !== '_original')" :key="header.label" sort :header />
          <Table.Head
            v-if="canManageResource"
            key="actions" :header="{ label: 'Actions',
                                     sortToggle: () => {} }"
          />
        </template>

        <template #body>
          <tr v-for="announcement in rows" :key="announcement._original.id" class="clickable-row" @click="viewAnnouncement(announcement._original as QueryAnnouncement)">
            <Table.Cell>{{ announcement.Title }}</Table.Cell>
            <Table.Cell>{{ announcement.Description }}</Table.Cell>
            <Table.Cell>
              <div v-if="announcement.Tags && announcement.Tags.length > 0" class="tags-cell">
                <Badge
                  v-for="tag in announcement.Tags"
                  :key="tag"
                  size="xs"
                  variant="neutral"
                  class="table-tag"
                >
                  {{ tag }}
                </Badge>
              </div>
              <span v-else class="color-text-light">No tags</span>
            </Table.Cell>
            <Table.Cell>
              <Icon v-if="announcement.Pinned" name="ph:push-pin-fill" class="color-accent" />
              <span v-else class="color-text-light">—</span>
            </Table.Cell>
            <Table.Cell>
              <TimestampDate :date="announcement.Created" />
            </Table.Cell>
            <Table.Cell v-if="canManageResource" @click.stop>
              <AdminActions
                resource-type="announcements"
                :item="announcement._original"
                @edit="(announcementItem) => openEditAnnouncementForm(announcementItem as QueryAnnouncement)"
                @delete="(announcementItem) => handleAnnouncementDelete((announcementItem as QueryAnnouncement).id)"
              />
            </Table.Cell>
          </tr>
        </template>

        <template v-if="filteredData.length > 10" #pagination>
          <Pagination :pagination="pagination" @change="setPage" />
        </template>
      </Table.Root>
    </TableContainer>

    <!-- No results message -->
    <Flex v-if="!loading && (!rows || rows.length === 0)" expand>
      <Alert variant="info" class="w-100">
        No announcements found
      </Alert>
    </Flex>
  </Flex>

  <!-- Announcement Detail Sheet -->
  <AnnouncementDetails
    v-model:is-open="showAnnouncementDetails"
    :announcement="selectedAnnouncement"
    @edit="handleEditFromDetails"
    @delete="(announcementItem) => handleAnnouncementDelete(announcementItem.id)"
  />

  <!-- Announcement Form Sheet (for both create and edit) -->
  <AnnouncementForm
    v-model:is-open="showAnnouncementForm"
    :announcement="selectedAnnouncement"
    :is-edit-mode="isEditMode"
    @save="handleAnnouncementSave"
    @delete="handleAnnouncementDelete"
  />
</template>

<style scoped lang="scss">
.mb-l {
  margin-bottom: var(--space-l);
}
.w-100 {
  width: 100%;
}

td {
  vertical-align: middle;
}

.clickable-row:hover {
  td {
    cursor: pointer;
    background-color: var(--color-bg-raised);
  }
}

.tags-cell {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-xs);
  max-width: 200px; // Limit width to prevent table from becoming too wide

  .table-tag {
    font-size: var(--font-size-xxs);
    white-space: nowrap;
  }
}
</style>
