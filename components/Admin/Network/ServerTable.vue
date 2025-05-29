<script setup lang="ts">
import type { QueryData } from '@supabase/supabase-js'

import { Alert, defineTable, Flex, Pagination, Table } from '@dolanske/vui'
import { computed, ref } from 'vue'
import TimestampDate from '@/components/Shared/TimestampDate.vue'
import ServerDetails from './ServerDetails.vue'

import ServerFilters from './ServerFilters.vue'
import ServerStatusIndicator from './ServerStatusIndicator.vue'

// Define interface for transformed server data
interface TransformedServer {
  'ID': number
  'Address': string
  'Status': 'active' | 'inactive'
  'Docker Control': boolean
  'Created': string
  '_original': {
    id: number
    address: string
    active: boolean
    docker_control: boolean
    docker_control_port: number | null
    docker_control_secure: boolean
    docker_control_subdomain: string | null
    created_at: string
  }
}

// Define interface for Select options
interface SelectOption {
  label: string
  value: string
}

// Define model value for refresh signal to parent
const refreshSignal = defineModel<number>('refreshSignal', { default: 0 })

// Define query
const supabase = useSupabaseClient()
const serversQuery = supabase.from('servers').select('*')

// Data states
const loading = ref(true)
const errorMessage = ref('')
const servers = ref<QueryData<typeof serversQuery>>([])
const search = ref('')
const statusFilter = ref<SelectOption[]>()

// Server detail state
const selectedServer = ref<any>(null)
const showServerDetails = ref(false)

// Status options for filter
const statusOptions: SelectOption[] = [
  { label: 'Active', value: 'active' },
  { label: 'Inactive', value: 'inactive' },
]

// Filter based on search and status
const filteredData = computed<TransformedServer[]>(() => {
  const filtered = servers.value.filter((item) => {
    // Filter by search term
    if (search.value && !Object.values(item).some((value) => {
      if (value === null || value === undefined)
        return false
      return String(value).toLowerCase().includes(search.value.toLowerCase())
    })) {
      return false
    }

    // Filter by status
    if (statusFilter.value) {
      const statusFilterValue = statusFilter.value[0].value
      const status = item.active ? 'active' : 'inactive'
      if (status !== statusFilterValue) {
        return false
      }
    }

    return true
  })

  // Transform the data into explicit key-value pairs
  return filtered.map(server => ({
    'ID': server.id,
    'Address': server.address,
    'Status': server.active ? 'active' : 'inactive',
    'Docker Control': server.docker_control,
    'Created': server.created_at,
    // Keep the original object to use when emitting events
    '_original': server,
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
  catch (error: any) {
    errorMessage.value = error.message || 'An error occurred while loading servers'
  }
  finally {
    loading.value = false
  }
}

// Handle row click - View server details
function viewServer(server: any) {
  selectedServer.value = server
  showServerDetails.value = true
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
  <Alert v-else-if="loading" variant="info">
    Loading servers...
  </Alert>

  <Flex v-else gap="s" column expand>
    <!-- Search and Filters -->
    <ServerFilters
      v-model:search="search"
      v-model:status-filter="statusFilter"
      :status-options="statusOptions"
      @clear-filters="clearFilters"
    />

    <!-- Properly structured table -->
    <Table.Root v-if="rows && rows.length > 0" separate-cells :loading="loading" class="mb-l">
      <template #header>
        <Table.Head v-for="header in headers.filter(header => header.label !== '_original')" :key="header.label" sort :header />
      </template>

      <template #body>
        <tr v-for="server in rows" :key="server._original.id" class="clickable-row" @click="viewServer(server._original)">
          <Table.Cell>{{ server.ID }}</Table.Cell>
          <Table.Cell>{{ server.Address }}</Table.Cell>
          <Table.Cell>
            <ServerStatusIndicator :status="server.Status" show-label />
          </Table.Cell>
          <Table.Cell>{{ server['Docker Control'] ? 'Yes' : 'No' }}</Table.Cell>
          <Table.Cell>
            <TimestampDate :date="server.Created" />
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
  </Flex>

  <!-- Server Detail Sheet -->
  <ServerDetails
    v-model:is-open="showServerDetails"
    :server="selectedServer"
  />
</template>

<style scoped>
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
