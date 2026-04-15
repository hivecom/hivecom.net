<script setup lang="ts">
import type { Ref } from 'vue'
import type { Tables, TablesInsert, TablesUpdate } from '@/types/database.overrides'
import { Alert, Badge, Button, defineTable, Flex, paginate, Pagination, Table } from '@dolanske/vui'
import { watchDebounced } from '@vueuse/core'
import { capitalize, computed, inject, onBeforeMount, ref, watch } from 'vue'
import AdminActions from '@/components/Admin/Shared/AdminActions.vue'
import TableSkeleton from '@/components/Admin/Shared/TableSkeleton.vue'
import CountDisplay from '@/components/Shared/CountDisplay.vue'
import TableContainer from '@/components/Shared/TableContainer.vue'
import TimestampDate from '@/components/Shared/TimestampDate.vue'
import { useTableActions } from '@/composables/useTableActions'
import { useBreakpoint } from '@/lib/mediaQuery'
import { getReferendumStatus, getReferendumStatusVariant } from '@/lib/referendums'
import ReferendumDetails from './ReferendumDetails.vue'
import ReferendumFilters from './ReferendumFilters.vue'
import ReferendumForm from './ReferendumForm.vue'

// ─── Types ────────────────────────────────────────────────────────────────────

interface SelectOption {
  label: string
  value: string
}

interface RpcReferendum {
  id: number
  title: string
  description: string | null
  date_start: string
  date_end: string
  is_public: boolean
  multiple_choice: boolean
  choices: string[]
  created_at: string
  modified_at: string | null
  created_by: string | null
  modified_by: string | null
  vote_count: number
  total_count: number
}

// ─── Signals & routing ────────────────────────────────────────────────────────

const refreshSignal = defineModel<number>('refreshSignal', { default: 0 })

const supabase = useSupabaseClient()
const userId = useUserId()
const route = useRoute()
const router = useRouter()

// ─── Permissions ──────────────────────────────────────────────────────────────

const { canManageResource, canCreate } = useTableActions('referendums')

// ─── Layout ───────────────────────────────────────────────────────────────────

const isBelowMedium = useBreakpoint('<m')

// ─── Filter options ───────────────────────────────────────────────────────────

const statusOptions: SelectOption[] = [
  { label: 'Active', value: 'active' },
  { label: 'Concluded', value: 'concluded' },
  { label: 'Upcoming', value: 'upcoming' },
]

const typeOptions: SelectOption[] = [
  { label: 'Single Choice', value: 'single' },
  { label: 'Multiple Choice', value: 'multiple' },
]

const visibilityOptions: SelectOption[] = [
  { label: 'Public', value: 'public' },
  { label: 'Private', value: 'private' },
]

// ─── State ────────────────────────────────────────────────────────────────────

const loading = ref(false)
const initialLoad = ref(true)
const errorMessage = ref('')
const items = ref<RpcReferendum[]>([])

const search = ref('')
const statusFilter = ref<SelectOption[]>([])
const typeFilter = ref<SelectOption[]>([])
const visibilityFilter = ref<SelectOption[]>([])

// ─── Pagination & sort ────────────────────────────────────────────────────────

const page = ref(1)
const adminTablePerPage = inject<Ref<number>>('adminTablePerPage', computed(() => 10))
const totalCount = ref(0)

const sortCol = ref('date_start')
const sortDir = ref<'asc' | 'desc'>('desc')

const paginationState = computed(() => paginate(totalCount.value, page.value, adminTablePerPage.value))
const shouldShowPagination = computed(() => totalCount.value > adminTablePerPage.value)

// ─── Detail / form state ──────────────────────────────────────────────────────

const selectedReferendum = ref<RpcReferendum | null>(null)

// Cast for child components that expect Tables<'referendums'>
const selectedReferendumAsTable = computed<Tables<'referendums'> | null>(() =>
  selectedReferendum.value as unknown as Tables<'referendums'> | null,
)
const showReferendumDetails = ref(false)
const showReferendumForm = ref(false)
const isEditMode = ref(false)

// ─── Derived ──────────────────────────────────────────────────────────────────

const isFiltered = computed(() =>
  search.value.trim() !== ''
  || (statusFilter.value ?? []).length > 0
  || (typeFilter.value ?? []).length > 0
  || (visibilityFilter.value ?? []).length > 0,
)

// ─── VUI defineTable (for TableSelectionProvideSymbol context) ───────────────

const { rows } = defineTable(items, { pagination: { enabled: false }, select: false })

// ─── Sorting ─────────────────────────────────────────────────────────────────

const sortColMap: Record<string, string> = {
  'Title': 'title',
  'Date Start': 'date_start',
  'Vote Count': 'votes',
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
}

function sortIcon(label: string): string {
  const col = sortColMap[label]
  if (!col || sortCol.value !== col)
    return 'ph:arrows-down-up'
  return sortDir.value === 'asc' ? 'ph:arrow-up' : 'ph:arrow-down'
}

// ─── Fetch ────────────────────────────────────────────────────────────────────

async function fetchReferendums() {
  loading.value = true
  errorMessage.value = ''

  try {
    const pStatus = (statusFilter.value ?? []).map(o => o.value)
    const pType = (typeFilter.value ?? []).map(o => o.value)
    const pVisibility = (visibilityFilter.value ?? []).map(o => o.value)

    const { data, error } = await supabase.rpc('get_admin_referendums_paginated', {
      p_search: search.value,
      p_status: pStatus,
      p_type: pType,
      p_visibility: pVisibility,
      p_sort_col: sortCol.value,
      p_sort_dir: sortDir.value,
      p_limit: adminTablePerPage.value,
      p_offset: (page.value - 1) * adminTablePerPage.value,
    })

    if (error)
      throw error

    const fetched = (data ?? []) as RpcReferendum[]
    items.value = fetched
    totalCount.value = fetched[0]?.total_count ?? 0
  }
  catch (err) {
    errorMessage.value = err instanceof Error ? err.message : 'Failed to load referendums'
  }
  finally {
    initialLoad.value = false
    loading.value = false
  }
}

// ─── Pagination handler ───────────────────────────────────────────────────────

function setPage(n: number) {
  page.value = n
}

// ─── Selection / sheet actions ────────────────────────────────────────────────

function viewReferendum(referendum: RpcReferendum) {
  selectedReferendum.value = referendum
  showReferendumDetails.value = true
}

function openAddReferendumForm() {
  selectedReferendum.value = null
  isEditMode.value = false
  showReferendumForm.value = true
}

function openEditReferendumForm(referendum: RpcReferendum) {
  selectedReferendum.value = referendum
  isEditMode.value = true
  showReferendumForm.value = true
}

function handleEditFromDetails(referendum: RpcReferendum) {
  openEditReferendumForm(referendum)
  showReferendumDetails.value = false
}

// ─── Save / delete ────────────────────────────────────────────────────────────

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

    showReferendumDetails.value = false
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
  visibilityFilter.value = []
  page.value = 1
}

// ─── URL deep-link ────────────────────────────────────────────────────────────

watch(showReferendumDetails, (isOpen) => {
  if (isOpen && selectedReferendum.value) {
    void router.replace({ query: { ...route.query, referendum: selectedReferendum.value.id } })
    return
  }
  if (isOpen)
    return
  if (route.query.referendum == null)
    return
  const { referendum: _referendum, ...rest } = route.query
  void router.replace({ query: rest })
})

// Only open the details panel once after the initial load completes.
// Do NOT watch loading.value - that would re-run every time a fetch starts/ends.
watch(
  () => route.query.referendum,
  (referendumId) => {
    if (loading.value || !referendumId)
      return
    const id = Number.parseInt(String(referendumId), 10)
    if (Number.isNaN(id))
      return
    const match = items.value.find(r => r.id === id)
    if (match)
      viewReferendum(match)
  },
)

// ─── Watchers for filters / perPage / refreshSignal ──────────────────────────

watchDebounced(search, () => {
  page.value = 1
  void fetchReferendums()
}, { debounce: 300 })

watch([statusFilter, typeFilter, visibilityFilter], () => {
  page.value = 1
  void fetchReferendums()
}, { deep: true })

watch([sortCol, sortDir], () => {
  page.value = 1
  void fetchReferendums()
})

watch(page, () => {
  void fetchReferendums()
})

watch(adminTablePerPage, () => {
  if (page.value !== 1) {
    setPage(1)
    // page watch fires fetch
  }
  else {
    void fetchReferendums()
  }
})

watch(() => refreshSignal.value, (newValue, oldValue) => {
  if (newValue !== oldValue && newValue > 0)
    void fetchReferendums()
}, { immediate: false })

// ─── Lifecycle ────────────────────────────────────────────────────────────────

onBeforeMount(async () => {
  await fetchReferendums()
  // Honour any ?referendum= query param present on initial load
  const referendumId = route.query.referendum
  if (!referendumId)
    return
  const id = Number.parseInt(String(referendumId), 10)
  if (Number.isNaN(id))
    return
  const match = items.value.find(r => r.id === id)
  if (match)
    viewReferendum(match)
})
</script>

<template>
  <Flex column expand>
    <!-- Error message -->
    <Alert v-if="errorMessage" variant="danger">
      {{ errorMessage }}
    </Alert>

    <!-- Initial skeleton - only shown on first load -->
    <Flex v-else-if="initialLoad" gap="s" column expand>
      <Flex :column="isBelowMedium" :x-between="!isBelowMedium" :x-start="isBelowMedium" y-center gap="s" expand>
        <ReferendumFilters
          v-model:search="search"
          v-model:status-filter="statusFilter"
          v-model:type-filter="typeFilter"
          v-model:visibility-filter="visibilityFilter"
          :status-options="statusOptions"
          :type-options="typeOptions"
          :visibility-options="visibilityOptions"
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

    <Flex v-else gap="s" column expand>
      <Flex :column="isBelowMedium" :x-between="!isBelowMedium" :x-start="isBelowMedium" y-center gap="s" expand>
        <ReferendumFilters
          v-model:search="search"
          v-model:status-filter="statusFilter"
          v-model:type-filter="typeFilter"
          v-model:visibility-filter="visibilityFilter"
          :status-options="statusOptions"
          :type-options="typeOptions"
          :visibility-options="visibilityOptions"
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
            {{ isFiltered ? `Filtered ${totalCount}` : `Total ${totalCount}` }}
          </span>

          <Button v-if="canCreate" variant="accent" :expand="isBelowMedium" @click="openAddReferendumForm">
            <template #start>
              <Icon name="ph:plus" />
            </template>
            Add Referendum
          </Button>
        </Flex>
      </Flex>

      <div class="table-loading-wrapper" :class="{ 'table-loading': loading && !initialLoad }">
        <TableContainer>
          <Table.Root v-if="rows.length > 0" separate-cells class="mb-l">
            <template #header>
              <Table.Head class="sortable-head" @click="handleSort('Title')">
                <Flex gap="xs" y-center>
                  Title
                  <Icon :name="sortIcon('Title')" size="14" class="sort-icon" />
                </Flex>
              </Table.Head>
              <Table.Head>Status</Table.Head>
              <Table.Head class="sortable-head" @click="handleSort('Vote Count')">
                <Flex gap="xs" y-center>
                  Vote Count
                  <Icon :name="sortIcon('Vote Count')" size="14" class="sort-icon" />
                </Flex>
              </Table.Head>
              <Table.Head>Visibility</Table.Head>
              <Table.Head class="sortable-head" @click="handleSort('Date Start')">
                <Flex gap="xs" y-center>
                  Date Start
                  <Icon :name="sortIcon('Date Start')" size="14" class="sort-icon" />
                </Flex>
              </Table.Head>
              <Table.Head v-if="canManageResource">
                Actions
              </Table.Head>
            </template>

            <template #body>
              <tr
                v-for="referendum in items"
                :key="referendum.id"
                class="clickable-row"
                @click="viewReferendum(referendum)"
              >
                <Table.Cell>
                  <span>{{ referendum.title }}</span>
                </Table.Cell>
                <Table.Cell>
                  <Badge
                    size="xs"
                    :variant="getReferendumStatusVariant(getReferendumStatus(referendum))"
                  >
                    {{ capitalize(getReferendumStatus(referendum)) }}
                  </Badge>
                </Table.Cell>
                <Table.Cell>
                  <CountDisplay :value="referendum.vote_count" />
                </Table.Cell>
                <Table.Cell>
                  <Badge size="xs" :variant="referendum.is_public ? 'success' : 'neutral'">
                    <Icon :name="referendum.is_public ? 'ph:globe' : 'ph:lock'" />
                    {{ referendum.is_public ? 'Public' : 'Private' }}
                  </Badge>
                </Table.Cell>
                <Table.Cell>
                  <TimestampDate :date="referendum.date_start" />
                </Table.Cell>
                <Table.Cell v-if="canManageResource" @click.stop>
                  <AdminActions
                    resource-type="referendums"
                    :item="referendum as unknown as Record<string, unknown>"
                    button-size="s"
                    @edit="(item) => openEditReferendumForm(item as unknown as RpcReferendum)"
                    @delete="(item) => handleReferendumDelete((item as unknown as RpcReferendum).id)"
                  />
                </Table.Cell>
              </tr>
            </template>

            <template v-if="shouldShowPagination" #pagination>
              <Pagination :pagination="paginationState" @change="setPage" />
            </template>
          </Table.Root>

          <Alert v-else-if="!loading && rows.length === 0" variant="info">
            No referendums found
          </Alert>
        </TableContainer>
      </div>
    </Flex>

    <ReferendumDetails
      v-model:is-open="showReferendumDetails"
      :referendum="selectedReferendumAsTable"
      @edit="(item) => handleEditFromDetails(item as unknown as RpcReferendum)"
      @delete="(item) => handleReferendumDelete((item as unknown as { id: number }).id)"
    />

    <ReferendumForm
      v-model:is-open="showReferendumForm"
      :referendum="selectedReferendumAsTable"
      :is-edit-mode="isEditMode"
      @save="handleReferendumSave"
      @delete="handleReferendumDelete"
    />
  </Flex>
</template>

<style scoped lang="scss">
.mb-l {
  margin-bottom: var(--space-l);
}

.table-loading-wrapper {
  width: 100%;
  overflow: hidden;
  transition: opacity var(--transition-slow);
}

.table-loading {
  opacity: 0.4;
  pointer-events: none;
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
