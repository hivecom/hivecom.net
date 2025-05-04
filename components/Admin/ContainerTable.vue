<script setup lang="ts">
import type { QueryData } from '@supabase/supabase-js'

import constants from '@/constants.json'
import { Alert, defineTable, Flex, Pagination, Table } from '@dolanske/vui'

import { computed, ref } from 'vue'

import ContainerActions from './ContainerActions.vue'
import ContainerDetails from './ContainerDetails.vue'
import ContainerFilters from './ContainerFilters.vue'
import StatusIndicator from './StatusIndicator.vue'

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

// Define query
const supabase = useSupabaseClient()
const containersQuery = supabase.from('containers').select(`
  name,
  running,
  healthy,
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

// Helper function for container status
function getContainerStatus(reportedAt: string, running: boolean, healthy?: boolean | null) {
  if (reportedAt && new Date(reportedAt) < new Date(Date.now() - 1000 * 60 * 60 * constants.CONTAINERS.STALE_HOURS))
    return 'stale' // Hasn't been updated for 2 hours (possibly removed)
  if (running && healthy === null)
    return 'running'
  if (running && healthy)
    return 'healthy'
  if (running && !healthy)
    return 'unhealthy'
  return 'stopped'
}

// Format date for display
function formatDate(dateStr: string | null) {
  if (!dateStr)
    return 'Not started'
  return new Date(dateStr).toLocaleString()
}

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

// Check if a specific action is loading for a container
function isActionLoading(containerName: string, action: string): Record<string, boolean> {
  const loadingState = actionLoading.value[containerName] || {}
  return { [action]: !!loadingState[action] }
}

// Container logs fetching
async function fetchContainerLogs() {
  if (!selectedContainer.value)
    return

  logsLoading.value = true
  logsError.value = ''

  try {
    // Call the Docker control function to get logs
    const { data, error } = await supabase
      .functions
      .invoke(`admin-docker-control-container-logs/${selectedContainer.value.name}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      })

    if (error)
      throw error

    containerLogs.value = data?.logs || 'No logs available'
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
        <tr v-for="container in rows" :key="container._original.name" @click="viewContainer(container._original)">
          <Table.Cell>{{ container.Name }}</Table.Cell>
          <Table.Cell>{{ container.Server }}</Table.Cell>
          <Table.Cell>
            <StatusIndicator :status="container.Status" show-label />
          </Table.Cell>
          <Table.Cell>{{ formatDate(container.Started) }}</Table.Cell>
          <Table.Cell>{{ formatDate(container['Last Report']) }}</Table.Cell>
          <td>
            <ContainerActions
              :container="container._original"
              :status="container.Status"
              :is-loading="isActionLoading(container._original.name, 'start')"
              @action="handleControl"
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
  />
</template>

<style scoped>
.mb-l {
  margin-bottom: var(--space-l);
}
.w-100 {
  width: 100%;
}
</style>
