<script setup lang="ts">
import type { QueryData } from '@supabase/supabase-js'

import type { Tables, TablesInsert, TablesUpdate } from '@/types/database.types'
import { Alert, Button, defineTable, Flex, Pagination, Table } from '@dolanske/vui'
import { computed, onBeforeMount, ref } from 'vue'
import AdminActions from '@/components/Admin/Shared/AdminActions.vue'
import TableSkeleton from '@/components/Admin/Shared/TableSkeleton.vue'

import TableContainer from '@/components/Shared/TableContainer.vue'
import TimestampDate from '@/components/Shared/TimestampDate.vue'
import ServerDetails from './ServerDetails.vue'
import ServerFilters from './ServerFilters.vue'
import ServerForm from './ServerForm.vue'
import ServerStatusIndicator from './ServerStatusIndicator.vue'

// Define interface for transformed server data
interface TransformedServer {
  'Address': string
  'Status': 'active' | 'inactive'
  'Docker Control': boolean
  'Created': string
  '_original': Tables<'servers'>
}

// Define interface for Select options
interface SelectOption {
  label: string
  value: string
}

// Define model value for refresh signal to parent
const refreshSignal = defineModel<number>('refreshSignal', { default: 0 })

// Get admin permissions
const { canManageResource, canCreate } = useTableActions('servers')

// Define query
const supabase = useSupabaseClient()
const userId = useUserId()
const serversQuery = supabase.from('servers').select('*')

// Data states
const loading = ref(true)
const errorMessage = ref('')
const servers = ref<QueryData<typeof serversQuery>>([])
const search = ref('')
const statusFilter = ref<SelectOption[]>()

// Server detail state
const selectedServer = ref<Tables<'servers'> | null>(null)
const showServerDetails = ref(false)

// Server form state
const showServerForm = ref(false)
const isEditMode = ref(false)

// Status options for filter
const statusOptions: SelectOption[] = [
  { label: 'Active', value: 'active' },
  { label: 'Inactive', value: 'inactive' },
]

// Filter based on search and status
const filteredData = computed<TransformedServer[]>(() => {
  const filtered = servers.value.filter((item: Tables<'servers'>) => {
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
      const statusFilterValue = statusFilter.value[0]?.value
      const status = item.active ? 'active' : 'inactive'
      if (status !== statusFilterValue) {
        return false
      }
    }

    return true
  })

  // Transform the data into explicit key-value pairs
  return filtered.map((server: Tables<'servers'>) => ({
    'Address': server.address,
    'Status': server.active ? 'active' : 'inactive',
    'Docker Control': server.docker_control,
    'Created': server.created_at,
    // Keep the original object to use when emitting events
    '_original': server,
  }))
})
const totalCount = computed(() => servers.value.length)
const filteredCount = computed(() => filteredData.value.length)
const isFiltered = computed(() => Boolean(
  search.value
  || (statusFilter.value && statusFilter.value.length > 0),
))

// Table configuration
const { headers, rows, pagination, setPage, setSort } = defineTable(filteredData, {
  pagination: {
    enabled: true,
    perPage: 10,
  },
  select: false,
})

// Set default sorting.
setSort('Address', 'asc')

// Fetch servers data
async function fetchServers() {
  loading.value = true
  errorMessage.value = ''

  try {
    const { data, error } = await serversQuery

    if (error) {
      throw error
    }

    servers.value = data || []
    // Increment the refresh signal to notify the parent
    refreshSignal.value = (refreshSignal.value || 0) + 1
  }
  catch (error: unknown) {
    errorMessage.value = error instanceof Error ? error.message : 'An error occurred while loading servers'
  }
  finally {
    loading.value = false
  }
}

// Handle row click - View server details
function viewServer(server: Tables<'servers'>) {
  selectedServer.value = server
  showServerDetails.value = true
}

// Open the add server form
function openAddServerForm() {
  selectedServer.value = null
  isEditMode.value = false
  showServerForm.value = true
}

// Open the edit server form
function openEditServerForm(server: Tables<'servers'>, event?: Event) {
  if (event)
    event.stopPropagation()
  selectedServer.value = server
  isEditMode.value = true
  showServerForm.value = true
}

// Handle edit from ServerDetails
function handleEditFromDetails(server: Tables<'servers'>) {
  openEditServerForm(server)
}

// Handle server save (create or update)
// ---
async function handleServerSave(serverData: TablesInsert<'servers'> | TablesUpdate<'servers'>) {
  console.warn('handleServerSave called with:', serverData)
  try {
    if (isEditMode.value && selectedServer.value) {
      // Update existing server
      const updateData = {
        ...serverData,
        modified_at: new Date().toISOString(),
        modified_by: userId.value ?? null,
      }
      const { error } = await supabase
        .from('servers')
        .update(updateData)
        .eq('id', selectedServer.value.id)
      if (error)
        throw error
    }
    else {
      // Create new server
      // Only include fields defined in TablesInsert<'servers'>
      const createData: TablesInsert<'servers'> = {
        address: serverData.address ?? '',
        active: serverData.active ?? true,
        docker_control: serverData.docker_control ?? false,
        docker_control_port: serverData.docker_control_port ?? undefined,
        docker_control_secure: serverData.docker_control_secure ?? false,
        docker_control_subdomain: serverData.docker_control_subdomain ?? undefined,
        created_by: userId.value ?? null,
        modified_by: userId.value ?? null,
        modified_at: new Date().toISOString(),
      }
      const { error } = await supabase
        .from('servers')
        .insert([createData])
      if (error)
        throw error
    }
    showServerForm.value = false
    await fetchServers()
  }
  catch (error: unknown) {
    errorMessage.value = error instanceof Error ? error.message : 'An error occurred while saving the server'
  }
}

// Handle server deletion
async function handleServerDelete(serverId: number) {
  console.warn('handleServerDelete called with:', serverId)
  try {
    const { error } = await supabase
      .from('servers')
      .delete()
      .eq('id', serverId)
    if (error)
      throw error
    showServerForm.value = false
    await fetchServers()
  }
  catch (error: unknown) {
    errorMessage.value = error instanceof Error ? error.message : 'An error occurred while deleting the server'
    showServerForm.value = false
  }
}

// Clear all filters
function clearFilters() {
  search.value = ''
  statusFilter.value = undefined
}

// Lifecycle hooks
onBeforeMount(fetchServers)
</script>

<template>
  <!-- Error message -->
  <Alert v-if="errorMessage" variant="danger">
    {{ errorMessage }}
  </Alert>

  <!-- Loading state -->
  <template v-else-if="loading">
    <Flex gap="s" column expand>
      <!-- Search and Filters -->
      <Flex x-between y-center expand>
        <ServerFilters
          v-model:search="search"
          v-model:status-filter="statusFilter"
          :status-options="statusOptions"
          @clear-filters="clearFilters"
        />
        <span class="text-color-lighter text-s">Total —</span>
      </Flex>

      <!-- Table skeleton -->
      <TableSkeleton
        :columns="4"
        :rows="10"
        :show-actions="canManageResource"
      />
    </Flex>
  </template>

  <Flex v-else gap="s" column expand>
    <!-- Header and filters -->
    <Flex x-between y-center expand>
      <ServerFilters
        v-model:search="search"
        v-model:status-filter="statusFilter"
        :status-options="statusOptions"
        @clear-filters="clearFilters"
      />
      <Flex gap="s" y-center>
        <span class="text-color-lighter text-s">
          {{ isFiltered ? `Filtered ${filteredCount}` : `Total ${totalCount}` }}
        </span>
        <Button v-if="canCreate" variant="accent" @click="openAddServerForm">
          <template #start>
            <Icon name="ph:plus" />
          </template>
          Add Server
        </Button>
      </Flex>
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
          <tr v-for="server in rows" :key="server._original.id" class="clickable-row" @click="viewServer(server._original)">
            <Table.Cell>{{ server.Address }}</Table.Cell>
            <Table.Cell>
              <ServerStatusIndicator :status="server.Status" show-label />
            </Table.Cell>
            <Table.Cell>{{ server['Docker Control'] ? 'Yes' : 'No' }}</Table.Cell>
            <Table.Cell>
              <TimestampDate :date="server.Created" />
            </Table.Cell>
            <Table.Cell v-if="canManageResource" @click.stop>
              <AdminActions
                resource-type="servers"
                :item="server._original"
                @edit="(item) => openEditServerForm(item as Tables<'servers'>)"
                @delete="(serverItem) => handleServerDelete((serverItem as Tables<'servers'>).id)"
              />
            </Table.Cell>
          </tr>
        </template>

        <template v-if="filteredData.length > 10" #pagination>
          <Pagination :pagination="pagination" @change="setPage" />
        </template>
      </Table.Root>

      <!-- No results message -->
      <Flex v-if="!loading && (!rows || rows.length === 0)" expand>
        <Alert variant="info" class="w-100">
          No servers found
        </Alert>
      </Flex>
    </TableContainer>
  </Flex>

  <!-- Server Detail Sheet -->
  <ServerDetails
    v-model:is-open="showServerDetails"
    :server="selectedServer"
    @edit="handleEditFromDetails"
  />

  <!-- Server Form Sheet (for both create and edit) -->
  <ServerForm
    v-model:is-open="showServerForm"
    :server="selectedServer"
    :is-edit-mode="isEditMode"
    @save="handleServerSave"
    @delete="handleServerDelete"
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
