<script setup lang="ts">
import type { QueryData } from '@supabase/supabase-js'

import constants from '@/constants.json'

import { Alert, Button, Card, defineTable, Divider, Flex, Input, Pagination, Sheet, Skeleton, Table } from '@dolanske/vui'

import { computed, ref } from 'vue'

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

// Container detail states
const showContainerDetail = ref(false)
const selectedContainer = ref<any>(null)
const containerLogs = ref('')
const logsLoading = ref(false)
const logsError = ref('')
const actionLoading = ref<{ [key: string]: { [key: string]: boolean } }>({})

// Fetch data
async function fetchContainers() {
  loading.value = true
  const { data, error } = await containersQuery
  loading.value = false

  if (error) {
    errorMessage.value = error.message
    return
  }

  containers.value = data
}

// Filter based on search
const filteredData = computed<TransformedContainer[]>(() => {
  const filtered = !search.value
    ? containers.value
    : containers.value.filter((item) => {
        // Check if any of the item's values include the search term
        return Object.values(item).some((value) => {
          if (value === null || value === undefined)
            return false
          return String(value).toLowerCase().includes(search.value.toLowerCase())
        })
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
const { headers, rows, pagination, setPage } = defineTable(filteredData, {
  pagination: {
    enabled: true,
    perPage: 10,
  },
  select: false,
})

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

// Handle row click - View container details
function viewContainer(container: any) {
  selectedContainer.value = container
  showContainerDetail.value = true

  if (container.running)
    fetchContainerLogs()
  else
    containerLogs.value = 'Container is not running. Logs are unavailable.'
}

// Close container detail view
function closeDetail() {
  showContainerDetail.value = false
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
function isActionLoading(containerName: string, action: string): boolean {
  return Boolean(actionLoading.value[containerName]?.[action])
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

// Computed property for container status in detail view
const containerDetailStatus = computed(() => {
  if (!selectedContainer.value) {
    return 'unknown'
  }

  return getContainerStatus(
    selectedContainer.value.reported_at,
    selectedContainer.value.running,
    selectedContainer.value.healthy,
  )
})

function clearSearch() {
  search.value = ''
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
    <!-- Search box -->
    <Flex gap="s" x-start>
      <Input v-model="search" placeholder="Search">
        <template #start>
          <Icon name="ph:magnifying-glass" />
        </template>
      </Input>
      <Button v-if="search" plain outline @click="clearSearch">
        Clear
      </Button>
    </Flex>

    <!-- Properly structured table according to VUI examples -->
    <Table.Root separate-cells>
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
            <Flex gap="xs">
              <Button size="s" variant="gray" @click.stop="viewContainer(container._original)">
                View
              </Button>
              <Button
                v-if="['stopped'].includes(container.Status)"
                size="s"
                variant="success"
                :loading="isActionLoading(container._original.name, 'start')"
                @click.stop="handleControl(container._original, 'start')"
              >
                Start
              </Button>
              <Button
                v-if="['running', 'healthy', 'unhealthy'].includes(container.Status)"
                size="s"
                variant="danger"
                :loading="isActionLoading(container._original.name, 'restart')"
                @click.stop="handleControl(container._original, 'restart')"
              >
                Restart
              </Button>
              <Button
                v-if="['running', 'healthy', 'unhealthy'].includes(container.Status)"
                size="s"
                variant="danger"
                :loading="isActionLoading(container._original.name, 'stop')"
                @click.stop="handleControl(container._original, 'stop')"
              >
                Stop
              </Button>
            </Flex>
          </td>
        </tr>
      </template>

      <template #pagination>
        <Pagination :pagination="pagination" @change="setPage" />
      </template>
    </Table.Root>

    <!-- No results message -->
    <div v-if="!loading && (!rows || rows.length === 0)" class="mt-m">
      <Alert variant="info">
        No containers found
      </Alert>
    </div>
  </Flex>

  <!-- Container Detail Sheet -->
  <Sheet
    :open="showContainerDetail"
    position="right"
    separator
    :size="600"
    @close="closeDetail"
  >
    <template #header>
      <h3>Container Details</h3>
    </template>

    <div v-if="selectedContainer" class="container-detail">
      <Flex column gap="m">
        <!-- Basic info -->
        <Card>
          <Flex column gap="s">
            <Flex x-between y-center>
              <h4>{{ selectedContainer.name }}</h4>
              <Flex y-center gap="xs">
                <StatusIndicator :status="containerDetailStatus" :show-label="true" />
              </Flex>
            </Flex>

            <div class="detail-item">
              <span class="detail-label">Server:</span>
              <span>{{ selectedContainer.server?.address || 'Unknown' }}</span>
            </div>

            <div class="detail-item">
              <span class="detail-label">Started:</span>
              <span>{{ formatDate(selectedContainer.started_at) }}</span>
            </div>

            <div class="detail-item">
              <span class="detail-label">Last Report:</span>
              <span>{{ formatDate(selectedContainer.reported_at) }}</span>
            </div>
          </Flex>
        </Card>

        <!-- Actions -->
        <Flex gap="s">
          <Button
            v-if="!selectedContainer.running && containerDetailStatus !== 'stale'"
            variant="success"
            :loading="isActionLoading(selectedContainer.name, 'start')"
            @click="handleControl(selectedContainer, 'start')"
          >
            Start Container
          </Button>
          <Button
            v-if="selectedContainer.running && containerDetailStatus !== 'stale'"
            variant="danger"
            :loading="isActionLoading(selectedContainer.name, 'restart')"
            @click="handleControl(selectedContainer, 'restart')"
          >
            Restart Container
          </Button>
          <Button
            v-if="selectedContainer.running && containerDetailStatus !== 'stale'"
            variant="danger"
            :loading="isActionLoading(selectedContainer.name, 'stop')"
            @click="handleControl(selectedContainer, 'stop')"
          >
            Stop Container
          </Button>
          <div v-if="containerDetailStatus === 'stale'" class="stale-container-message">
            <Alert variant="warning">
              This container appears to be stale. Actions are disabled.
            </Alert>
          </div>
        </Flex>

        <Divider />

        <!-- Logs -->
        <div>
          <Flex x-between y-center class="mb-s">
            <h4>Container Logs</h4>
            <Button size="s" variant="gray" @click="fetchContainerLogs">
              <Flex y-center gap="xs">
                <Icon name="ph:arrow-clockwise" />
                Refresh
              </Flex>
            </Button>
          </Flex>

          <Alert v-if="logsError" variant="danger">
            {{ logsError }}
          </Alert>

          <Alert v-else-if="!selectedContainer.running" variant="info">
            Container is not running. Logs are unavailable.
          </Alert>

          <Card v-else-if="logsLoading" class="logs-container">
            <Skeleton :height="200" />
          </Card>

          <Card v-else class="logs-container">
            <pre class="container-logs">{{ containerLogs }}</pre>
          </Card>
        </div>
      </Flex>
    </div>

    <template #footer>
      <Flex x-between>
        <Button variant="gray" @click="closeDetail">
          Close
        </Button>
      </Flex>
    </template>
  </Sheet>
</template>

<style scoped>
.mb-l {
  margin-bottom: var(--space-l);
}
.mt-m {
  margin-top: var(--space-m);
}
.mb-s {
  margin-bottom: var(--space-s);
}
.container-detail {
  padding: var(--space-m) 0;
}
.detail-item {
  display: flex;
  margin: var(--space-xs) 0;
}
.detail-label {
  width: 100px;
  font-weight: 500;
  color: var(--color-text-muted);
}
.logs-container {
  max-height: 400px;
  overflow-y: auto;
}
.container-logs {
  white-space: pre-wrap;
  font-family: monospace;
  font-size: 0.85rem;
  line-height: 1.4;
}
.stale-container-message {
  margin-top: var(--space-s);
}
</style>
