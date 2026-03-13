<script setup lang="ts">
import type { QueryData } from '@supabase/supabase-js'
import type { TablesInsert, TablesUpdate } from '@/types/database.overrides'
import { Alert, Badge, Button, defineTable, Flex, Pagination, Table } from '@dolanske/vui'
import { capitalize, computed, watch } from 'vue'
import AdminActions from '@/components/Admin/Shared/AdminActions.vue'
import TableSkeleton from '@/components/Admin/Shared/TableSkeleton.vue'
import TableContainer from '@/components/Shared/TableContainer.vue'
import TimestampDate from '@/components/Shared/TimestampDate.vue'
import { useAdminCrudTable } from '@/composables/useAdminCrudTable'
import { useBreakpoint } from '@/lib/mediaQuery'
import { getReferendumStatus, getReferendumStatusVariant, getVoteCount } from '@/lib/referendums'
import ReferendumDetails from './ReferendumDetails.vue'
import ReferendumFilters from './ReferendumFilters.vue'
import ReferendumForm from './ReferendumForm.vue'

interface SelectOption {
  label: string
  value: string
}

const supabase = useSupabaseClient()
const userId = useUserId()
const isBelowMedium = useBreakpoint('<m')

const referendumsQuery = supabase.from('referendums').select(`
  *,
  vote_count:referendum_votes(count)
`)

type QueryReferendum = QueryData<typeof referendumsQuery>[0]

interface TransformedReferendum extends Record<string, unknown> {
  'Title': string
  'Status': string
  'Vote Count': number
  'Date Start': string
}

// Filter states kept local since they go beyond simple search
const statusFilter = ref<SelectOption[]>([])
const typeFilter = ref<SelectOption[]>([])

const statusOptions: SelectOption[] = [
  { label: 'Active', value: 'active' },
  { label: 'Concluded', value: 'concluded' },
  { label: 'Upcoming', value: 'upcoming' },
]

const typeOptions: SelectOption[] = [
  { label: 'Single Choice', value: 'single' },
  { label: 'Multiple Choice', value: 'multiple' },
]

const refreshSignal = defineModel<number>('refreshSignal', { default: 0 })

const {
  items: _referendums,
  loading,
  errorMessage,
  filteredRows: searchFilteredRows,
  totalCount,
  filteredCount: _searchFilteredCount,
  search,
  selectedItem: selectedReferendum,
  showDetails: showReferendumDetails,
  showForm: showReferendumForm,
  isEditMode,
  canManageResource,
  canCreate,
  adminTablePerPage,
  viewItem: viewReferendum,
  openAdd: openAddReferendumForm,
  openEdit: openEditReferendumForm,
  handleEditFromDetails,
  refresh: fetchReferendums,
} = useAdminCrudTable<QueryReferendum, TransformedReferendum>({
  resourceType: 'referendums',
  queryParamKey: 'referendum',
  refreshSignal,
  fetch: async () => {
    const { data, error } = await referendumsQuery
    if (error)
      throw error
    return data ?? []
  },
  transform: item => ({
    'Title': item.title,
    'Status': getReferendumStatus(item),
    'Vote Count': getVoteCount(item),
    'Date Start': item.date_start,
  }),
  defaultSort: { column: 'Date Start', direction: 'desc' },
})

// Apply local filters on top of the composable's search-filtered rows
const filteredData = computed(() => {
  return searchFilteredRows.value.filter((row) => {
    if (statusFilter.value.length > 0) {
      const selected = statusFilter.value.map(o => o.value)
      if (!selected.includes(getReferendumStatus(row._original)))
        return false
    }

    if (typeFilter.value.length > 0) {
      const selected = typeFilter.value.map(o => o.value)
      const currentType = row._original.multiple_choice ? 'multiple' : 'single'
      if (!selected.includes(currentType))
        return false
    }

    return true
  })
})

const filteredCount = computed(() => filteredData.value.length)
const isFiltered = computed(() => filteredCount.value !== totalCount.value)

const { headers, rows, pagination, setPage, setSort, options } = defineTable(filteredData, {
  pagination: { enabled: true, perPage: adminTablePerPage.value },
  select: false,
})

watch(adminTablePerPage, (perPage) => {
  options.value.pagination.perPage = perPage
  setPage(1)
})

setSort('Date Start', 'desc')

async function handleReferendumSave(referendumData: TablesInsert<'referendums'> | TablesUpdate<'referendums'>) {
  try {
    if (isEditMode.value && selectedReferendum.value) {
      const { error } = await supabase
        .from('referendums')
        .update({
          ...referendumData,
          modified_at: new Date().toISOString(),
          modified_by: userId.value ?? null,
        })
        .eq('id', selectedReferendum.value.id)
      if (error)
        throw error
    }
    else {
      const { error } = await supabase
        .from('referendums')
        .insert({
          ...referendumData,
          created_by: userId.value ?? null,
          modified_by: userId.value ?? null,
          modified_at: new Date().toISOString(),
        } as TablesInsert<'referendums'>)
      if (error)
        throw error
    }

    showReferendumForm.value = false
    await fetchReferendums()
  }
  catch (err: unknown) {
    errorMessage.value = err instanceof Error ? err.message : 'An error occurred while saving the referendum'
  }
}

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
  catch (err: unknown) {
    errorMessage.value = err instanceof Error ? err.message : 'An error occurred while deleting the referendum'
  }
}

function clearFilters() {
  search.value = ''
  statusFilter.value = []
  typeFilter.value = []
}
</script>

<template>
  <!-- Error message -->
  <Alert v-if="errorMessage" variant="danger">
    {{ errorMessage }}
  </Alert>

  <!-- Loading state -->
  <template v-else-if="loading">
    <Flex gap="s" column expand>
      <Flex :column="isBelowMedium" :x-between="!isBelowMedium" :x-start="isBelowMedium" y-center gap="s" expand>
        <ReferendumFilters
          v-model:search="search"
          v-model:status-filter="statusFilter"
          v-model:type-filter="typeFilter"
          :status-options="statusOptions"
          :type-options="typeOptions"
          :expand="isBelowMedium"
          @clear-filters="clearFilters"
        />

        <Flex
          gap="s"
          :y-center="!isBelowMedium"
          :y-start="isBelowMedium"
          :wrap="isBelowMedium"
          :x-end="!isBelowMedium"
          :x-center="isBelowMedium"
          :x-start="isBelowMedium"
          :expand="isBelowMedium"
          :column-reverse="isBelowMedium"
        >
          <span class="text-color-lighter text-s" :class="{ 'text-center': isBelowMedium }">Total -</span>

          <Button v-if="canCreate" variant="accent" :expand="isBelowMedium" loading>
            <template #start>
              <Icon name="ph:plus" />
            </template>
            Add Referendum
          </Button>
        </Flex>
      </Flex>

      <TableSkeleton :columns="5" :rows="10" :show-actions="canManageResource" />
    </Flex>
  </template>

  <Flex v-else gap="s" column expand>
    <Flex :column="isBelowMedium" :x-between="!isBelowMedium" :x-start="isBelowMedium" y-center gap="s" expand>
      <ReferendumFilters
        v-model:search="search"
        v-model:status-filter="statusFilter"
        v-model:type-filter="typeFilter"
        :status-options="statusOptions"
        :type-options="typeOptions"
        :expand="isBelowMedium"
        @clear-filters="clearFilters"
      />

      <Flex
        gap="s"
        :y-center="!isBelowMedium"
        :y-start="isBelowMedium"
        :wrap="isBelowMedium"
        :x-end="!isBelowMedium"
        :x-center="isBelowMedium"
        :x-start="isBelowMedium"
        :expand="isBelowMedium"
        :column-reverse="isBelowMedium"
      >
        <span class="text-color-lighter text-s" :class="{ 'text-center': isBelowMedium }">
          {{ isFiltered ? `Filtered ${filteredCount}` : `Total ${totalCount}` }}
        </span>

        <Button v-if="canCreate" variant="accent" :expand="isBelowMedium" @click="openAddReferendumForm">
          <template #start>
            <Icon name="ph:plus" />
          </template>
          Add Referendum
        </Button>
      </Flex>
    </Flex>

    <TableContainer>
      <Table.Root v-if="rows && rows.length > 0" separate-cells :loading="loading" class="mb-l">
        <template #header>
          <Table.Head v-for="header in headers.filter(h => h.label !== '_original')" :key="header.label" sort :header />
          <Table.Head
            v-if="canManageResource"
            key="actions"
            :header="{ label: 'Actions',
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
                :variant="getReferendumStatusVariant(referendum.Status as 'active' | 'upcoming' | 'concluded')"
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
                button-size="s"
                @edit="(item) => openEditReferendumForm(item as QueryReferendum)"
                @delete="(item) => handleReferendumDelete((item as QueryReferendum).id)"
              />
            </Table.Cell>
          </tr>
        </template>

        <template v-if="filteredData.length > adminTablePerPage" #pagination>
          <Pagination :pagination="pagination" @change="setPage" />
        </template>
      </Table.Root>
    </TableContainer>

    <Flex v-if="!loading && (!rows || rows.length === 0)" expand>
      <Alert variant="info" class="w-100">
        No referendums found
      </Alert>
    </Flex>
  </Flex>

  <ReferendumDetails
    v-model:is-open="showReferendumDetails"
    :referendum="selectedReferendum"
    @edit="handleEditFromDetails"
    @delete="(item) => handleReferendumDelete(item.id)"
  />

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
