<script setup lang="ts">
import type { QueryData } from '@supabase/supabase-js'

import { Alert, defineTable, Flex, Pagination, Table } from '@dolanske/vui'

import { computed, ref, watch } from 'vue'

import TimestampDate from '@/components/Shared/TimestampDate.vue'
import { getContainerStatus } from '@/utils/containerStatus'
import TableContainer from '~/components/Shared/TableContainer.vue'
import ContainerActions from './ContainerActions.vue'
import ContainerDetails from './ContainerDetails.vue'
import ContainerFilters from './ContainerFilters.vue'
import ContainerStatusIndicator from './ContainerStatusIndicator.vue'

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

// Define model value for refresh signal to parent
const refreshSignal = defineModel<number>('refreshSignal', { default: 0 })

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
const serverFilter = ref<SelectOption[]>()
const statusFilter = ref<SelectOption[]>()

// Container detail state
const selectedContainer = ref<any>(null)
const containerLogs = ref('')
const logsLoading = ref(false)
const logsError = ref('')
const actionLoading = ref<Record<string, Record<string, boolean>>>({})
const showContainerDetails = ref(false)
const refreshContainerDetails = ref<boolean>(false)

const refreshLogsConfig = ref<{ tail?: number, since?: string, from?: string, to?: string } | null>(null)

// Type that specifically allows null
type ContainerAction = { container: any, type: 'start' | 'stop' | 'restart' | 'prune' | null } | null
const containerAction = ref<ContainerAction>(null)

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
    if (serverFilter.value) {
      const serverFilterValue = serverFilter.value[0].value
      const serverAddress = item.server?.address || 'Unknown'

      if (serverAddress !== serverFilterValue) {
        return false
      }
    }

    // Filter by status
    if (statusFilter.value) {
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

// Watch for containerAction changes
watch(containerAction, async (newAction) => {
  if (newAction && newAction.type) {
    if (newAction.type === 'prune') {
      await handlePrune(newAction.container)
    }
    else {
      await handleControl(newAction.container, newAction.type)
    }
    // Reset the action
    containerAction.value = null
  }
})

// Watch for refreshLogsConfig changes
watch(refreshLogsConfig, async (newConfig) => {
  if (newConfig) {
    await fetchContainerLogs(
      newConfig.tail,
      newConfig.since,
      newConfig.from,
      newConfig.to,
    )
    // Reset the config
    refreshLogsConfig.value = null
  }
})

// Watch for refreshContainerDetails changes to refresh the selected container data
watch(refreshContainerDetails, async (shouldRefresh) => {
  if (shouldRefresh && selectedContainer.value) {
    try {
      // Store the container name before refreshing
      const containerName = selectedContainer.value.name

      // Refresh all containers first
      await fetchContainers()

      // Then find and update the selected container with fresh data
      const refreshedContainer = containers.value.find(c => c.name === containerName)

      if (refreshedContainer) {
        // Update the selected container with the refreshed data
        selectedContainer.value = refreshedContainer

        // If container is running, also refresh logs
        if (refreshedContainer.running) {
          await fetchContainerLogs()
        }
      }
    }
    catch (error) {
      console.error('Error refreshing container details:', error)
    }
    finally {
      // Reset the refresh flag after a short delay to ensure component re-renders
      setTimeout(() => {
        refreshContainerDetails.value = false
      }, 200)
    }
  }
})

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
    // Increment the refresh signal to notify the parent
    refreshSignal.value = (refreshSignal.value || 0) + 1
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
  showContainerDetails.value = true

  if (container.running)
    fetchContainerLogs()
  else
    containerLogs.value = 'Container is not running. Logs are unavailable.'
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
    showContainerDetails.value = false
    selectedContainer.value = null

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
  serverFilter.value = undefined
  statusFilter.value = undefined
}

// Lifecycle hooks
onBeforeMount(fetchContainers)
</script>

<template>
  <!-- Error message -->
  <Alert v-if="errorMessage" variant="danger">
    <p>{{ errorMessage }}</p>
  </Alert>

  <!-- Loading state -->
  <Alert v-else-if="loading" variant="info">
    <p>Loading containers...</p>
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

    <TableContainer>
      <Table.Root v-if="rows && rows.length > 0" separate-cells :loading="loading" class="mb-l">
        <template #header>
          <Table.Head v-for="header in headers.filter(header => header.label !== '_original')" :key="header.label" sort :header />
          <Table.Head
            key="actions" :header="{ label: 'actions',
                                     sortToggle: () => {} }"
          />
        </template>

        <template #body>
          <tr v-for="container in rows" :key="container._original.name" class="clickable-row" @click="viewContainer(container._original)">
            <Table.Cell>{{ container.Name }}</Table.Cell>
            <Table.Cell>{{ container.Server }}</Table.Cell>
            <Table.Cell>
              <ContainerStatusIndicator :status="container.Status" show-label />
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
                v-model="containerAction"
                :container="container._original"
                :status="container.Status"
                :is-loading="(action) => isActionLoading(container._original.name, action)"
                @click.stop
              />
            </td>
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
        No containers found
      </Alert>
    </Flex>
  </Flex>

  <!-- Container Detail Sheet -->
  <ContainerDetails
    v-model:is-open="showContainerDetails"
    v-model:refresh-logs-config="refreshLogsConfig"
    v-model:container-action="containerAction"
    v-model:refresh-container="refreshContainerDetails"
    :container="selectedContainer"
    :logs="containerLogs"
    :logs-loading="logsLoading"
    :logs-error="logsError"
    :action-loading="actionLoading"
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
