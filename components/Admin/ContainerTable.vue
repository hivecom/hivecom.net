<script setup lang="ts">
import type { QueryData } from '@supabase/supabase-js'
import { Alert, Button, defineTable, Flex, Input, Pagination, Table } from '@dolanske/vui'
import { computed, ref } from 'vue'
import StatusIndicator from './StatusIndicator.vue'

// Define interface for transformed container data
interface TransformedContainer {
  Name: string
  Server: string
  Status: 'healthy' | 'unhealthy' | 'offline' | 'unknown'
  Started: string | null
  LastReport: string
  _original: {
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

const emit = defineEmits(['view', 'edit', 'control'])

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
    Name: container.name,
    Server: container.server?.address || 'Unknown',
    Status: getContainerStatus(container.running, container.healthy),
    Started: container.started_at,
    LastReport: container.reported_at,
    // Keep the original object to use when emitting events
    _original: container,
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
function getContainerStatus(running?: boolean, healthy?: boolean | null) {
  if (running === undefined)
    return 'unknown'
  if (running && healthy)
    return 'healthy'
  if (running && !healthy)
    return 'unhealthy'
  return 'offline'
}

// Format date for display
function formatDate(dateStr: string | null) {
  if (!dateStr)
    return 'Not started'
  return new Date(dateStr).toLocaleString()
}

// Handle row click
function onRowClick(container: any) {
  emit('view', container)
}

// Handle control actions
function handleControl(container: any, action: 'start' | 'stop' | 'restart' | 'status' | 'logs') {
  emit('control', { container, action })
}

function clearSearch() {
  search.value = ''
}

// Lifecycle hooks
onBeforeMount(fetchContainers)
</script>

<template>
  <div>
    <!-- Error message -->
    <Alert v-if="errorMessage" variant="danger" class="mb-l">
      {{ errorMessage }}
    </Alert>

    <!-- Loading state -->
    <Alert v-else-if="loading" variant="info" class="mb-l">
      Loading containers...
    </Alert>

    <div v-else>
      <!-- Search box -->
      <Flex gap="s" x-start class="mb-l">
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
          <Table.Head v-for="header in headers" :key="header.label" sort />
        </template>

        <template #body>
          <tr v-for="container in rows" :key="container._original.name" @click="onRowClick(container._original)">
            <Table.Cell>{{ container.Name }}</Table.Cell>
            <Table.Cell>{{ container.Server }}</Table.Cell>
            <Table.Cell>
              <Flex y-center>
                <StatusIndicator :status="container.Status" />
                {{
                  container.Status === 'healthy'
                    ? 'Healthy'
                    : container.Status === 'unhealthy'
                      ? 'Unhealthy'
                      : 'Offline'
                }}
              </Flex>
            </Table.Cell>
            <Table.Cell>{{ formatDate(container.Started) }}</Table.Cell>
            <Table.Cell>{{ formatDate(container.LastReport) }}</Table.Cell>
            <td>
              <Flex gap="xs">
                <Button size="s" variant="gray" @click.stop="emit('view', container._original)">
                  View
                </Button>
                <Button
                  v-if="container.Status === 'offline'"
                  size="s"
                  variant="success"
                  @click.stop="handleControl(container._original, 'start')"
                >
                  Start
                </Button>
                <Button
                  v-if="container.Status === 'healthy' || container.Status === 'unhealthy'"
                  size="s"
                  variant="danger"
                  @click.stop="handleControl(container._original, 'restart')"
                >
                  Restart
                </Button>
                <Button
                  v-if="container.Status === 'healthy' || container.Status === 'unhealthy'"
                  size="s"
                  variant="danger"
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
    </div>
  </div>
</template>

<style scoped>
.mb-l {
  margin-bottom: var(--space-l);
}
.mt-m {
  margin-top: var(--space-m);
}
</style>
