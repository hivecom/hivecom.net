<script setup lang="ts">
import type { QueryData } from '@supabase/supabase-js'

import TimestampDate from '@/components/Shared/TimestampDate.vue'

import { getContainerStatus } from '@/utils/containerStatus'

import { Alert, defineTable, Flex, Pagination, Table } from '@dolanske/vui'
import { computed, ref } from 'vue'
import StatusIndicator from './../StatusIndicator.vue'
import ContainerActions from './ContainerActions.vue'
import ContainerDetails from './ContainerDetails.vue'
import ContainerFilters from './ContainerFilters.vue'

// Define interface for transformed container data
interface TransformedContainer {
  'Name': string
  'Server': string
  'Status': 'running' | 'healthy' | 'unhealthy' | 'stopped' | 'unknown' | 'stale'
  'Started': string | null
  'Last Report': string
  '_original': {
    name: string
    running: boolean
    healthy: boolean | null
    created_at: string
    started_at: string | null
    reported_at: string
    server: {
      id: number
      address: string
    } | null
  }
}

// Define interface for Select options
interface SelectOption {
  label: string
  value: string
}

const props = defineProps<{
  // Function to control containers (start, stop, restart)
  controlContainer: (container: any, action: 'start' | 'stop' | 'restart') => Promise<void>
}>()

const emit = defineEmits<{
  (e: 'refresh'): void
}>()

// Define query
const supabase = useSupabaseClient()
const containersQuery = supabase.from('containers').select(`
  name,
  running,
  healthy,
  created_at,
  started_at,
  reported_at,
  server (
    id,
    address
  )
`)

// Data states
const loading = ref(true)
const errorMessage = ref('')
const containers = ref<QueryData<typeof containersQuery>>([])
const search = ref('')
const serverFilter = ref<SelectOption[]>([])
const statusFilter = ref<SelectOption[]>([])

// Container detail state
const selectedContainer = ref<any>(null)
const containerLogs = ref('')
const logsLoading = ref(false)
const logsError = ref('')
const actionLoading = ref<Record<string, Record<string, boolean>>>({})

// Compute unique server options for the filter
const serverOptions = computed<SelectOption[]>(() => {
  const uniqueServers = new Set<string>()
  containers.value.forEach((container) => {
    if (container.server) {
      uniqueServers.add(container.server.address)
    }
    else {
      uniqueServers.add('Unknown')
    }
  })

  return Array.from(uniqueServers).map(server => ({
    label: server,
    value: server,
  }))
})

// Status options for filter
const statusOptions: SelectOption[] = [
  { label: 'Running', value: 'running' },
  { label: 'Healthy', value: 'healthy' },
  { label: 'Unhealthy', value: 'unhealthy' },
  { label: 'Stopped', value: 'stopped' },
  { label: 'Stale', value: 'stale' },
]

// Filter based on search, server, and status
const filteredData = computed<TransformedContainer[]>(() => {
  const filtered = containers.value.filter((item) => {
    // Filter by search term
    if (search.value && !Object.values(item).some((value) => {
      if (value === null || value === undefined)
        return false
      return String(value).toLowerCase().includes(search.value.toLowerCase())
    })) {
      return false
    }

    // Filter by server
    if (serverFilter.value.length > 0 && item.server) {
      const serverFilterValue = serverFilter.value[0].value
      if (item.server.address !== serverFilterValue) {
        return false
      }
    }
    else if (serverFilter.value.length > 0 && serverFilter.value[0].value === 'Unknown' && item.server) {
      return false
    }

    // Filter by status
    if (statusFilter.value.length > 0) {
      const statusFilterValue = statusFilter.value[0].value
      const status = getContainerStatus(item.reported_at, item.running, item.healthy)
      if (status !== statusFilterValue) {
        return false
      }
    }

    return true
  })

  // Transform the data into explicit key-value pairs
  return filtered.map(container => ({
    'Name': container.name,
    'Server': container.server ? container.server.address : 'Unknown',
    'Status': getContainerStatus(container.reported_at, container.running, container.healthy),
    'Started': container.started_at,
    'Last Report': container.reported_at,
    // Keep the original object to use when emitting events
    '_original': container,
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
setSort('Name', 'asc')

// Fetch containers data
async function fetchContainers() {
  loading.value = true
  errorMessage.value = ''

  try {
    const { data, error } = await containersQuery

    if (error) {
      throw error
    }

    containers.value = data || []
    // Notify parent to refresh KPIs when container data changes
    emit('refresh')
  }
  catch (error: any) {
    errorMessage.value = error.message || 'An error occurred while loading containers'
  }
  finally {
    loading.value = false
  }
}

// Handle row click - View container details
function viewContainer(container: any) {
  selectedContainer.value = container

  if (container.running)
    fetchContainerLogs()
  else
    containerLogs.value = 'Container is not running. Logs are unavailable.'
}

// Close container detail view
function closeDetail() {
  selectedContainer.value = null
}

// Handle container control actions with loading state
async function handleControl(container: any, action: 'start' | 'stop' | 'restart') {
  try {
    // Set loading state for this specific container and action
    if (!actionLoading.value[container.name]) {
      actionLoading.value[container.name] = {}
    }
    actionLoading.value[container.name][action] = true

    await props.controlContainer(container, action)

    // Refresh container data after action
    await fetchContainers()
  }
  catch (error) {
    console.error(`Error with action ${action} for container ${container.name}:`, error)
  }
  finally {
    // Clear loading state
    if (actionLoading.value[container.name]) {
      actionLoading.value[container.name][action] = false
    }
  }
}

// Handle pruning stale containers - removes them from the database
async function handlePrune(container: any) {
  try {
    // Set loading state for this specific container and prune action
    if (!actionLoading.value[container.name]) {
      actionLoading.value[container.name] = {}
    }

    actionLoading.value[container.name].prune = true

    // Only proceed if the container is stale
    const status = getContainerStatus(container.reported_at, container.running, container.healthy)
    if (status !== 'stale') {
      throw new Error('Only stale containers can be pruned')
    }

    // Delete the container from the database
    const { error } = await supabase
      .from('containers')
      .delete()
      .eq('name', container.name)

    if (error) {
      throw error
    }

    // Close the detail view since the container no longer exists
    closeDetail()

    // Refresh container data after action
    await fetchContainers()
  }
  catch (error: any) {
    console.error(`Error pruning container ${container.name}:`, error)
    // Show error message
    errorMessage.value = error.message || 'Failed to prune container'
    setTimeout(() => {
      errorMessage.value = ''
    }, 5000) // Clear error after 5 seconds
  }
  finally {
    // Clear loading state
    if (actionLoading.value[container.name]) {
      actionLoading.value[container.name].prune = false
    }
  }
}

// Check if a specific action is loading for a container
function isActionLoading(containerName: string, action: string): Record<string, boolean> {
  const loadingState = actionLoading.value[containerName] || {}
  return { [action]: !!loadingState[action] }
}

// Container logs fetching
async function fetchContainerLogs(tail = 100, since: string | null = null, from: string | null = null, to: string | null = null) {
  if (!selectedContainer.value)
    return

  logsLoading.value = true
  logsError.value = ''

  try {
    // Construct URL with query parameters
    let endpoint = `admin-docker-control-container-logs/${selectedContainer.value.name}`
    const params = new URLSearchParams()

    // Add parameters if provided
    if (tail)
      params.append('tail', tail.toString())

    // If from is provided, it takes precedence over since
    if (from) {
      params.append('from', from)
      if (to)
        params.append('to', to)
    }
    // Otherwise use since if provided
    else if (since && since !== 'all') {
      params.append('since', since)
    }

    // Add query parameters if any exist
    if (params.toString())
      endpoint += `?${params.toString()}`

    // Call the Docker control function to get logs
    const { data, error } = await supabase
      .functions
      .invoke(endpoint, {
        method: 'GET',
        headers: {
          'Content-Type': 'text/plain',
        },
      })

    if (error)
      throw error

    containerLogs.value = data.logs || 'No logs available'
  }
  catch (error: any) {
    logsError.value = error.message || 'Could not fetch container logs'
    containerLogs.value = 'Failed to load logs'
  }
  finally {
    logsLoading.value = false
  }
}

// Clear all filters
function clearFilters() {
  search.value = ''
  serverFilter.value = []
  statusFilter.value = []
}

// Lifecycle hooks
onBeforeMount(fetchContainers)
</script>

<template>
  <!-- Error message -->
  <Alert v-if="errorMessage" variant="danger">
    {{ errorMessage }}
  </Alert>

  <!-- Loading state -->
  <Alert v-else-if="loading" variant="info">
    Loading containers...
  </Alert>

  <Flex v-else gap="s" column expand>
    <!-- Search and Filters -->
    <ContainerFilters
      v-model:search="search"
      v-model:server-filter="serverFilter"
      v-model:status-filter="statusFilter"
      :server-options="serverOptions"
      :status-options="statusOptions"
      @clear-filters="clearFilters"
    />

    <!-- Properly structured table -->
    <Table.Root v-if="rows && rows.length > 0" separate-cells :loading="loading" class="mb-l">
      <template #header>
        <Table.Head v-for="header in headers.filter(header => header.label !== '_original')" :key="header.label" sort :header />
        <Table.Head key="actions" :header="{ label: 'actions', sortToggle: () => {} }" />
      </template>

      <template #body>
        <tr v-for="container in rows" :key="container._original.name" class="clickable-row" @click="viewContainer(container._original)">
          <Table.Cell>{{ container.Name }}</Table.Cell>
          <Table.Cell>{{ container.Server }}</Table.Cell>
          <Table.Cell>
            <StatusIndicator :status="container.Status" show-label />
          </Table.Cell>
          <Table.Cell>
            <TimestampDate v-if="container.Started" :date="container.Started" />
            <span v-else>Not started</span>
          </Table.Cell>
          <Table.Cell>
            <TimestampDate :date="container['Last Report']" />
          </Table.Cell>
          <td>
            <ContainerActions
              :container="container._original"
              :status="container.Status"
              :is-loading="isActionLoading(container._original.name, 'start')"
              @action="handleControl"
              @prune="handlePrune"
              @click.stop
            />
          </td>
        </tr>
      </template>

      <template #pagination>
        <Pagination :pagination="pagination" @change="setPage" />
      </template>
    </Table.Root>

    <!-- No results message -->
    <Flex v-if="!loading && (!rows || rows.length === 0)" expand>
      <Alert variant="info" class="w-100">
        No containers found
      </Alert>
    </Flex>
  </Flex>

  <!-- Container Detail Sheet -->
  <ContainerDetails
    :container="selectedContainer"
    :logs="containerLogs"
    :logs-loading="logsLoading"
    :logs-error="logsError"
    :action-loading="actionLoading"
    @close="closeDetail"
    @refresh-logs="fetchContainerLogs"
    @control="handleControl"
    @prune="handlePrune"
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
