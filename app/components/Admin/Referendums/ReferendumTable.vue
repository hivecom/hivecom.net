<script setup lang="ts">
import type { QueryData } from '@supabase/supabase-js'
import type { TablesInsert, TablesUpdate } from '@/types/database.types'

import { Alert, Badge, Button, defineTable, Flex, Pagination, Table } from '@dolanske/vui'
import { capitalize } from 'vue'
import AdminActions from '@/components/Admin/Shared/AdminActions.vue'

import TableSkeleton from '@/components/Admin/Shared/TableSkeleton.vue'
import TableContainer from '@/components/Shared/TableContainer.vue'
import TimestampDate from '@/components/Shared/TimestampDate.vue'
import ReferendumDetails from './ReferendumDetails.vue'
import ReferendumFilters from './ReferendumFilters.vue'
import ReferendumForm from './ReferendumForm.vue'

// Type from the query result
type QueryReferendum = QueryData<typeof referendumsQuery>[0]

// Define interface for transformed referendum data
interface TransformedReferendum {
  'Title': string
  'Status': string
  'Vote Count': number
  'Date Start': string
  '_original': QueryReferendum
}

// Interface for Select options
interface SelectOption {
  label: string
  value: string
}

// Define model value for refresh signal to parent
const refreshSignal = defineModel<number>('refreshSignal', { default: 0 })

// Get admin permissions
const { canManageResource, canCreate } = useTableActions('referendums')

// Define query
const supabase = useSupabaseClient()
const userId = useUserId()
const referendumsQuery = supabase.from('referendums').select(`
  *,
  vote_count:referendum_votes(count)
`)

// Data states
const loading = ref(true)
const errorMessage = ref('')
const referendums = ref<QueryData<typeof referendumsQuery>>([])
const search = ref('')

// Filter states
const statusFilter = ref<SelectOption[]>([])
const typeFilter = ref<SelectOption[]>([])

// Status options for filtering
const statusOptions: SelectOption[] = [
  { label: 'Active', value: 'active' },
  { label: 'Concluded', value: 'concluded' },
  { label: 'Upcoming', value: 'upcoming' },
]

// Type options for filtering
const typeOptions: SelectOption[] = [
  { label: 'Single Choice', value: 'single' },
  { label: 'Multiple Choice', value: 'multiple' },
]

// Referendum detail state
const selectedReferendum = ref<QueryReferendum | null>(null)
const showReferendumDetails = ref(false)

// Referendum form state
const showReferendumForm = ref(false)
const isEditMode = ref(false)

// Helper function to determine referendum status
function getReferendumStatus(referendum: QueryReferendum): string {
  const now = new Date()
  const start = new Date(referendum.date_start)
  const end = new Date(referendum.date_end)

  if (now < start)
    return 'upcoming'
  if (now > end)
    return 'concluded'
  return 'active'
}

// Helper function to get vote count
function getVoteCount(referendum: QueryReferendum): number {
  return referendum.vote_count?.[0]?.count || 0
}

// Filter based on search, status, and type
const filteredData = computed<TransformedReferendum[]>(() => {
  const filtered = referendums.value.filter((item: QueryReferendum) => {
    // Filter by search term
    if (search.value && !Object.values(item).some((value) => {
      if (value === null || value === undefined)
        return false
      return String(value).toLowerCase().includes(search.value.toLowerCase())
    })) {
      return false
    }

    // Filter by status
    if (statusFilter.value && statusFilter.value.length > 0) {
      const selectedStatuses = statusFilter.value.map((option: SelectOption) => option.value)
      const currentStatus = getReferendumStatus(item)
      if (!selectedStatuses.includes(currentStatus)) {
        return false
      }
    }

    // Filter by type
    if (typeFilter.value && typeFilter.value.length > 0) {
      const selectedTypes = typeFilter.value.map((option: SelectOption) => option.value)
      const currentType = item.multiple_choice ? 'multiple' : 'single'
      if (!selectedTypes.includes(currentType)) {
        return false
      }
    }

    return true
  })

  return filtered.map((referendum: QueryReferendum) => ({
    'Title': referendum.title,
    'Status': getReferendumStatus(referendum),
    'Vote Count': getVoteCount(referendum),
    'Date Start': referendum.date_start,
    '_original': referendum,
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
setSort('Date Start', 'desc')

// Fetch referendums data
async function fetchReferendums() {
  loading.value = true
  errorMessage.value = ''

  try {
    const { data, error } = await referendumsQuery

    if (error) {
      throw error
    }

    referendums.value = data || []
    // Increment the refresh signal to notify the parent
    refreshSignal.value = (refreshSignal.value || 0) + 1
  }
  catch (error: unknown) {
    errorMessage.value = error instanceof Error ? error.message : 'An error occurred while loading referendums'
  }
  finally {
    loading.value = false
  }
}

// Handle row click - View referendum details
function viewReferendum(referendum: QueryReferendum) {
  selectedReferendum.value = referendum
  showReferendumDetails.value = true
}

// Open the add referendum form
function openAddReferendumForm() {
  selectedReferendum.value = null
  isEditMode.value = false
  showReferendumForm.value = true
}

// Open the edit referendum form
function openEditReferendumForm(referendum: QueryReferendum, event?: Event) {
  // Prevent the click from triggering the view details
  if (event)
    event.stopPropagation()

  selectedReferendum.value = referendum
  isEditMode.value = true
  showReferendumForm.value = true
}

// Handle edit from ReferendumDetails
function handleEditFromDetails(referendum: QueryReferendum) {
  openEditReferendumForm(referendum)
}

// Handle referendum save (both create and update)
async function handleReferendumSave(referendumData: TablesInsert<'referendums'> | TablesUpdate<'referendums'>) {
  try {
    if (isEditMode.value && selectedReferendum.value) {
      // Update existing referendum
      const updateData = {
        ...referendumData,
        modified_at: new Date().toISOString(),
        modified_by: userId.value ?? null,
      }

      const { error } = await supabase
        .from('referendums')
        .update(updateData)
        .eq('id', selectedReferendum.value.id)

      if (error)
        throw error
    }
    else {
      // Create new referendum with creation and modification tracking
      const createData = {
        ...referendumData,
        created_by: userId.value ?? null,
        modified_by: userId.value ?? null,
        modified_at: new Date().toISOString(),
      }

      const { error } = await supabase
        .from('referendums')
        .insert(createData as TablesInsert<'referendums'>)

      if (error)
        throw error
    }

    // Refresh referendums data and close form
    showReferendumForm.value = false
    await fetchReferendums()
  }
  catch (error: unknown) {
    errorMessage.value = error instanceof Error ? error.message : 'An error occurred while saving the referendum'
  }
}

// Handle referendum deletion
async function handleReferendumDelete(referendumId: number) {
  try {
    const { error } = await supabase
      .from('referendums')
      .delete()
      .eq('id', referendumId)

    if (error)
      throw error

    showReferendumForm.value = false
    await fetchReferendums()
  }
  catch (error: unknown) {
    errorMessage.value = error instanceof Error ? error.message : 'An error occurred while deleting the referendum'
  }
}

// Clear all filters
function clearFilters() {
  search.value = ''
  statusFilter.value = []
  typeFilter.value = []
}

// Lifecycle hooks
onBeforeMount(fetchReferendums)
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
        <ReferendumFilters
          v-model:search="search"
          v-model:status-filter="statusFilter"
          v-model:type-filter="typeFilter"
          :status-options="statusOptions"
          :type-options="typeOptions"
          @clear-filters="clearFilters"
        />

        <Button v-if="canCreate" variant="accent" loading>
          <template #start>
            <Icon name="ph:plus" />
          </template>
          Add Referendum
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
      <ReferendumFilters
        v-model:search="search"
        v-model:status-filter="statusFilter"
        v-model:type-filter="typeFilter"
        :status-options="statusOptions"
        :type-options="typeOptions"
        @clear-filters="clearFilters"
      />

      <Button v-if="canCreate" variant="accent" @click="openAddReferendumForm">
        <template #start>
          <Icon name="ph:plus" />
        </template>
        Add Referendum
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
          <tr v-for="referendum in rows" :key="referendum._original.id" class="clickable-row" @click="viewReferendum(referendum._original as QueryReferendum)">
            <Table.Cell>
              <span>{{ referendum.Title }}</span>
            </Table.Cell>
            <Table.Cell>
              <Badge
                size="xs"
                :variant="referendum.Status === 'active' ? 'success' : referendum.Status === 'upcoming' ? 'warning' : 'neutral'"
              >
                {{ capitalize(referendum.Status) }}
              </Badge>
            </Table.Cell>
            <Table.Cell>{{ referendum['Vote Count'] }}</Table.Cell>
            <Table.Cell>
              <TimestampDate :date="referendum['Date Start']" />
            </Table.Cell>
            <Table.Cell v-if="canManageResource" @click.stop>
              <AdminActions
                resource-type="referendums"
                :item="referendum._original"
                @edit="(referendumItem) => openEditReferendumForm(referendumItem as QueryReferendum)"
                @delete="(referendumItem) => handleReferendumDelete((referendumItem as QueryReferendum).id)"
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
        No referendums found
      </Alert>
    </Flex>
  </Flex>

  <!-- Referendum Detail Sheet -->
  <ReferendumDetails
    v-model:is-open="showReferendumDetails"
    :referendum="selectedReferendum"
    @edit="handleEditFromDetails"
    @delete="(referendumItem) => handleReferendumDelete(referendumItem.id)"
  />

  <!-- Referendum Form Sheet (for both create and edit) -->
  <ReferendumForm
    v-model:is-open="showReferendumForm"
    :referendum="selectedReferendum"
    :is-edit-mode="isEditMode"
    @save="handleReferendumSave"
    @delete="handleReferendumDelete"
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
</style>
