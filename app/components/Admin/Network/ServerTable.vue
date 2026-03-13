<script setup lang="ts">
import type { Tables, TablesInsert, TablesUpdate } from '@/types/database.overrides'
import { Alert, Button, defineTable, Flex, Pagination, Table } from '@dolanske/vui'
import { computed, watch } from 'vue'
import AdminActions from '@/components/Admin/Shared/AdminActions.vue'
import TableSkeleton from '@/components/Admin/Shared/TableSkeleton.vue'
import TableContainer from '@/components/Shared/TableContainer.vue'
import TimestampDate from '@/components/Shared/TimestampDate.vue'
import { useAdminCrudTable } from '@/composables/useAdminCrudTable'
import { useBreakpoint } from '@/lib/mediaQuery'
import ServerDetails from './ServerDetails.vue'
import ServerFilters from './ServerFilters.vue'
import ServerForm from './ServerForm.vue'
import ServerStatusIndicator from './ServerStatusIndicator.vue'

type Server = Tables<'servers'>

interface SelectOption {
  label: string
  value: string
}

interface TransformedServer extends Record<string, unknown> {
  'Address': string
  'Status': 'active' | 'inactive' | 'inaccessible'
  'Docker Control': boolean
  'Accessible': boolean
  'Last Accessed': string | null
  'Created': string
}

const refreshSignal = defineModel<number>('refreshSignal', { default: 0 })

const supabase = useSupabaseClient()
const userId = useUserId()
const isBelowMedium = useBreakpoint('<m')

// Filter states kept local - status filter goes beyond simple search
const statusFilter = ref<SelectOption[]>()

const statusOptions: SelectOption[] = [
  { label: 'Active', value: 'active' },
  { label: 'Inactive', value: 'inactive' },
  { label: 'Inaccessible', value: 'inaccessible' },
]

function getServerStatus(server: Server): 'active' | 'inactive' | 'inaccessible' {
  if (!server.active)
    return 'inactive'
  if (server.docker_control && !server.accessible)
    return 'inaccessible'
  return 'active'
}

const {
  loading,
  errorMessage,
  filteredRows: searchFilteredRows,
  totalCount,
  search,
  selectedItem: selectedServer,
  showDetails: showServerDetails,
  showForm: showServerForm,
  isEditMode,
  canManageResource,
  canCreate,
  adminTablePerPage,
  viewItem: viewServer,
  openAdd: openAddServerForm,
  openEdit: openEditServerForm,
  handleEditFromDetails,
  refresh: fetchServers,
} = useAdminCrudTable<Server, TransformedServer>({
  resourceType: 'servers',
  queryParamKey: 'server',
  refreshSignal,
  fetch: async () => {
    const { data, error } = await supabase.from('servers').select('*')
    if (error)
      throw error
    return data ?? []
  },
  transform: server => ({
    'Address': server.address,
    'Status': getServerStatus(server),
    'Docker Control': server.docker_control,
    'Accessible': server.accessible,
    'Last Accessed': server.last_accessed,
    'Created': server.created_at,
  }),
  defaultSort: { column: 'Address', direction: 'asc' },
})

// Apply status filter on top of search-filtered rows
const filteredData = computed(() => {
  return searchFilteredRows.value.filter((row) => {
    if (statusFilter.value != null && statusFilter.value.length > 0) {
      const statusFilterValue = statusFilter.value[0]?.value
      if (row.Status !== statusFilterValue)
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

setSort('Address', 'asc')

async function handleServerSave(serverData: TablesInsert<'servers'> | TablesUpdate<'servers'>) {
  try {
    if (isEditMode.value && selectedServer.value) {
      const { error } = await supabase
        .from('servers')
        .update({
          ...serverData,
          modified_at: new Date().toISOString(),
          modified_by: userId.value ?? null,
        })
        .eq('id', selectedServer.value.id)
      if (error)
        throw error
    }
    else {
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
      const { error } = await supabase.from('servers').insert([createData])
      if (error)
        throw error
    }
    showServerForm.value = false
    await fetchServers()
  }
  catch (err: unknown) {
    errorMessage.value = err instanceof Error ? err.message : 'An error occurred while saving the server'
  }
}

async function handleServerDelete(serverId: number) {
  try {
    const { error } = await supabase.from('servers').delete().eq('id', serverId)
    if (error)
      throw error
    showServerForm.value = false
    await fetchServers()
  }
  catch (err: unknown) {
    errorMessage.value = err instanceof Error ? err.message : 'An error occurred while deleting the server'
    showServerForm.value = false
  }
}

function clearFilters() {
  search.value = ''
  statusFilter.value = undefined
}
</script>

<template>
  <Alert v-if="errorMessage" variant="danger">
    {{ errorMessage }}
  </Alert>

  <template v-else-if="loading">
    <Flex gap="s" column expand>
      <Flex :column="isBelowMedium" :x-between="!isBelowMedium" :x-start="isBelowMedium" y-center gap="s" expand>
        <ServerFilters
          v-model:search="search"
          v-model:status-filter="statusFilter"
          :status-options="statusOptions"
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
        >
          <span class="text-color-lighter text-s" :class="{ 'text-center': isBelowMedium }">Total -</span>
        </Flex>
      </Flex>

      <TableSkeleton :columns="6" :rows="10" :show-actions="canManageResource" />
    </Flex>
  </template>

  <Flex v-else gap="s" column expand>
    <Flex :column="isBelowMedium" :x-between="!isBelowMedium" :x-start="isBelowMedium" y-center gap="s" expand>
      <ServerFilters
        v-model:search="search"
        v-model:status-filter="statusFilter"
        :status-options="statusOptions"
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
        <Button v-if="canCreate" variant="accent" :expand="isBelowMedium" @click="openAddServerForm">
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
          <Table.Head v-for="header in headers.filter(h => h.label !== '_original')" :key="header.label" sort :header />
          <Table.Head
            v-if="canManageResource"
            key="actions"
            :header="{ label: 'Actions',
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
              <ServerStatusIndicator
                :status="server._original.docker_control ? (server.Accessible ? 'accessible' : 'inaccessible') : 'not_enabled'"
                show-label
              />
            </Table.Cell>
            <Table.Cell>
              <TimestampDate v-if="server['Last Accessed']" :date="server['Last Accessed']" />
              <span v-else>Never</span>
            </Table.Cell>
            <Table.Cell>
              <TimestampDate :date="server.Created" />
            </Table.Cell>
            <Table.Cell v-if="canManageResource" @click.stop>
              <AdminActions
                resource-type="servers"
                :item="server._original"
                button-size="s"
                @edit="(item) => openEditServerForm(item as Server)"
                @delete="(item) => handleServerDelete((item as Server).id)"
              />
            </Table.Cell>
          </tr>
        </template>

        <template v-if="filteredData.length > adminTablePerPage" #pagination>
          <Pagination :pagination="pagination" @change="setPage" />
        </template>
      </Table.Root>

      <Flex v-if="!loading && (!rows || rows.length === 0)" expand>
        <Alert variant="info" class="w-100">
          No servers found
        </Alert>
      </Flex>
    </TableContainer>
  </Flex>

  <ServerDetails
    v-model:is-open="showServerDetails"
    :server="selectedServer"
    @edit="handleEditFromDetails"
  />

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
