<script setup lang="ts">
import type { QueryData } from '@supabase/supabase-js'

import type { Ref } from 'vue'

import { Alert, Button, defineTable, DropdownItem, Flex, Pagination, Table } from '@dolanske/vui'
import { computed, inject, ref, watch } from 'vue'

import TableSkeleton from '@/components/Admin/Shared/TableSkeleton.vue'
import ConfirmModal from '@/components/Shared/ConfirmModal.vue'
import ElapsedTimeIndicator from '@/components/Shared/ElapsedTimeIndicator.vue'
import SelectedRowsActions from '@/components/Shared/SelectedRowsActions.vue'
import TableContainer from '@/components/Shared/TableContainer.vue'
import TimestampDate from '@/components/Shared/TimestampDate.vue'
import { getContainerStatus } from '@/lib/containerStatus'
import { useBreakpoint } from '@/lib/mediaQuery'
import ContainerActions from './ContainerActions.vue'
import ContainerDetails from './ContainerDetails.vue'
import ContainerFilters from './ContainerFilters.vue'
import ContainerStatusIndicator from './ContainerStatusIndicator.vue'

interface ContainerWithServer {
  name: string
  running: boolean
  healthy: boolean | null
  created_at: string
  started_at: string | null
  reported_at: string
  server: {
    id: number
    address: string
    docker_control?: boolean | null
    accessible?: boolean | null
  } | null
  gameserver: readonly {
    id: number
    name: string
  }[] | null
}
interface TransformedContainer {
  'id': string
  'Name': string
  'Server': string
  'Status': 'running' | 'healthy' | 'unhealthy' | 'stopped' | 'unknown' | 'stale' | 'control_offline' | 'restarting'
  'Started': string
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
      docker_control?: boolean | null
      accessible?: boolean | null
    } | null
    gameserver: readonly {
      id: number
      name: string
    }[] | null
  }
}

interface SelectOption {
  label: string
  value: string
}

const props = defineProps<{
  controlContainer: (container: ContainerWithServer, action: 'start' | 'stop' | 'restart') => Promise<void>
  // Optional container name to auto-open in details sheet
  focusContainerName?: string | null
}>()

const refreshSignal = defineModel<number>('refreshSignal', { default: 0 })

const { canManageResource } = useTableActions('network')
const { hasPermission } = useAdminPermissions()
const route = useRoute()
const router = useRouter()

const canReadContainers = computed(() => hasPermission('network.read'))

const supabase = useSupabaseClient()
const containersQuery = supabase.from('network_containers').select(`
  name,
  running,
  healthy,
  created_at,
  started_at,
  reported_at,
  server (
    id,
    address,
    docker_control,
    accessible
  ),
  gameserver:network_gameservers!gameservers_container_fkey (
    id,
    name
  )
`)

const loading = ref(true)
const initialLoad = ref(true)
const errorMessage = ref('')
const containers = ref<QueryData<typeof containersQuery>>([])
const search = ref('')
const serverFilter = ref<SelectOption[]>()
const statusFilter = ref<SelectOption[]>()
const isBelowMedium = useBreakpoint('<m')

const selectedContainer = ref<ContainerWithServer | null>(null)
const containerLogs = ref('')
const logsLoading = ref(false)
const logsError = ref('')
const actionLoading = ref<Record<string, Record<string, boolean>>>({})
const showContainerDetails = ref(false)
const refreshContainerDetails = ref<boolean>(false)
const showBulkPruneConfirm = ref(false)

const refreshLogsConfig = ref<{ tail?: number, since?: string, from?: string, to?: string } | null>(null)

interface ContainerAction {
  container: ContainerWithServer
  type: 'start' | 'stop' | 'restart' | 'prune' | null
}
const containerAction = ref<ContainerAction | null>(null)

const serverOptions = computed<SelectOption[]>(() => {
  const uniqueServers = new Set<string>()
  containers.value.forEach((container: ContainerWithServer) => {
    if (container.server) {
      uniqueServers.add(container.server.address)
    }
    else {
      uniqueServers.add('Unknown')
    }
  })

  return Array.from(uniqueServers, server => ({
    label: server,
    value: server,
  }))
})

const statusOptions: SelectOption[] = [
  { label: 'Running', value: 'running' },
  { label: 'Healthy', value: 'healthy' },
  { label: 'Unhealthy', value: 'unhealthy' },
  { label: 'Restarting', value: 'restarting' },
  { label: 'Stopped', value: 'stopped' },
  { label: 'Control Offline', value: 'control_offline' },
  { label: 'Stale', value: 'stale' },
]

const filteredData = computed<TransformedContainer[]>(() => {
  const filtered = containers.value.filter((item: ContainerWithServer) => {
    const isRestarting = !!actionLoading.value[item.name]?.restart
    const isDockerControlEnabled = !!item.server?.docker_control
    const isControlOffline = isDockerControlEnabled
      && (item.server?.accessible === false || !item.reported_at)
    const status = isDockerControlEnabled
      ? getContainerStatus(item.reported_at, item.running, item.healthy, isControlOffline, isRestarting)
      : 'unknown'

    if (search.value && !Object.values(item).some((value) => {
      if (value === null || value === undefined)
        return false

      return String(value).toLowerCase().includes(search.value.toLowerCase())
    })) {
      return false
    }

    if (serverFilter.value && serverFilter.value.length > 0) {
      const serverFilterValue = serverFilter.value[0]!.value
      const serverAddress = item.server?.address || 'Unknown'

      if (serverAddress !== serverFilterValue) {
        return false
      }
    }

    if (statusFilter.value && statusFilter.value.length > 0) {
      const statusFilterValue = statusFilter.value[0]!.value
      if (status !== statusFilterValue) {
        return false
      }
    }

    return true
  })

  return filtered.map((container: ContainerWithServer) => ({
    'id': container.name,
    'Name': container.name,
    'Server': container.server ? container.server.address : 'Unknown',
    'Status': container.server?.docker_control
      ? getContainerStatus(
          container.reported_at,
          container.running,
          container.healthy,
          !!container.server?.docker_control
          && (container.server?.accessible === false || !container.reported_at),
          !!actionLoading.value[container.name]?.restart,
        )
      : 'unknown',
    'Started': container.started_at ?? '',
    'Last Report': container.reported_at,
    // Keep the original object to use when emitting events
    '_original': container,
  }))
})

const totalCount = computed(() => containers.value.length)
const filteredCount = computed(() => filteredData.value.length)
const isFiltered = computed(() => filteredCount.value !== totalCount.value)

const adminTablePerPage = inject<Ref<number>>('adminTablePerPage', computed(() => 10))

const { headers, rows, selectedRows, deselectAllRows, pagination, setPage, setSort, options } = defineTable(filteredData, {
  pagination: {
    enabled: true,
    perPage: adminTablePerPage.value,
  },
  select: true,
})

watch(adminTablePerPage, (perPage) => {
  options.value.pagination.perPage = perPage
  setPage(1)
})

setSort('Name', 'asc')

watch(containerAction, async (newAction) => {
  if (newAction && newAction.type) {
    if (newAction.type === 'prune') {
      await handlePrune(newAction.container)
    }
    else {
      await handleControl(newAction.container, newAction.type)
    }

    containerAction.value = null
  }
})

watch(refreshLogsConfig, async (newConfig) => {
  if (newConfig) {
    await fetchContainerLogs(
      newConfig.tail,
      newConfig.since,
      newConfig.from,
      newConfig.to,
    )

    refreshLogsConfig.value = null
  }
})

watch(showContainerDetails, (isOpen) => {
  if (isOpen && selectedContainer.value) {
    const nextQuery = {
      ...route.query,
      tab: 'Containers',
      container: selectedContainer.value.name,
    }
    router.replace({ query: nextQuery })
    return
  }
  if (isOpen)
    return
  if (!route.query.container)
    return

  const { container, ...rest } = route.query
  router.replace({ query: rest })
})

watch(refreshContainerDetails, async (shouldRefresh) => {
  if (shouldRefresh && selectedContainer.value) {
    try {
      const containerName = selectedContainer.value.name

      await fetchContainers()

      const refreshedContainer = containers.value.find((c: ContainerWithServer) => c.name === containerName)

      if (refreshedContainer) {
        selectedContainer.value = refreshedContainer

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

async function fetchContainers() {
  loading.value = true
  errorMessage.value = ''

  try {
    const { data, error } = await containersQuery

    if (error) {
      throw error
    }

    containers.value = data || []

    refreshSignal.value = (refreshSignal.value || 0) + 1
  }
  catch (error: unknown) {
    errorMessage.value = error instanceof Error ? error.message : 'An error occurred while loading containers'
  }
  finally {
    initialLoad.value = false
    loading.value = false
  }
}

function viewContainer(container: ContainerWithServer) {
  selectedContainer.value = container
  showContainerDetails.value = true

  if (container.running)
    fetchContainerLogs()
  else
    containerLogs.value = ''
}

function openContainerByName(containerName: string | null | undefined): boolean {
  if (!containerName)
    return false

  const normalizedTarget = containerName.trim().toLowerCase()
  if (!normalizedTarget)
    return false

  const match = containers.value.find((container: ContainerWithServer) =>
    container.name.toLowerCase() === normalizedTarget,
  )

  if (!match)
    return false

  viewContainer(match)
  return true
}

async function handleControl(container: ContainerWithServer, action: 'start' | 'stop' | 'restart') {
  try {
    if (!actionLoading.value[container.name]) {
      actionLoading.value[container.name] = {}
    }
    actionLoading.value[container.name]![action] = true

    await props.controlContainer(container, action)

    await fetchContainers()

    // If the details sheet is open for this container, rebind it to fresh data.
    if (showContainerDetails.value && selectedContainer.value?.name === container.name) {
      const refreshedContainer = containers.value.find((c: ContainerWithServer) => c.name === container.name)
      if (refreshedContainer) {
        selectedContainer.value = refreshedContainer

        if (refreshedContainer.running) {
          await fetchContainerLogs()
        }
        else {
          containerLogs.value = ''
          logsError.value = ''
        }
      }
    }
  }
  catch (error) {
    console.error(`Error with action ${action} for container ${container.name}:`, error)
  }
  finally {
    // Keep restart loading briefly so UI doesn't flash as stopped before telemetry catches up
    if (action === 'restart') {
      setTimeout(() => {
        if (actionLoading.value[container.name]) {
          actionLoading.value[container.name]![action] = false
        }
      }, 4000)
    }
    else if (actionLoading.value[container.name]) {
      actionLoading.value[container.name]![action] = false
    }
  }
}

async function handlePrune(container: ContainerWithServer) {
  try {
    if (!actionLoading.value[container.name]) {
      actionLoading.value[container.name] = {}
    }

    actionLoading.value[container.name]!.prune = true

    const status = getContainerStatus(container.reported_at, container.running, container.healthy)
    if (status !== 'stale') {
      throw new Error('Only stale containers can be pruned')
    }

    // count: 'exact' catches a silent RLS block. PostgREST returns 204 with no
    // error even when 0 rows are deleted.
    const { error, count } = await supabase
      .from('network_containers')
      .delete({ count: 'exact' })
      .eq('name', container.name)

    if (error) {
      throw error
    }

    if (count === 0) {
      throw new Error('Container could not be deleted - you may not have permission, or it no longer exists.')
    }

    showContainerDetails.value = false
    selectedContainer.value = null

    await fetchContainers()
  }
  catch (error: unknown) {
    console.error(`Error pruning container ${container.name}:`, error)

    errorMessage.value = error instanceof Error ? error.message : 'Failed to prune container'
    setTimeout(() => {
      errorMessage.value = ''
    }, 5000)
  }
  finally {
    if (actionLoading.value[container.name]) {
      actionLoading.value[container.name]!.prune = false
    }
  }
}

function isActionLoading(containerName: string, action: string): Record<string, boolean> {
  const loadingState = actionLoading.value[containerName] || {}
  return { [action]: !!loadingState[action] }
}

async function fetchContainerLogs(tail = 100, since: string | null = null, from: string | null = null, to: string | null = null) {
  if (!selectedContainer.value)
    return

  logsLoading.value = true
  logsError.value = ''

  try {
    let endpoint = `admin-docker-control-container-logs/${selectedContainer.value.name}`
    const params = new URLSearchParams()

    if (tail)
      params.append('tail', tail.toString())

    // If from is provided, it takes precedence over since
    if (from) {
      params.append('from', from)
      if (to)
        params.append('to', to)
    }

    else if (since && since !== 'all') {
      params.append('since', since)
    }

    if (params.toString())
      endpoint += `?${params.toString()}`

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
  catch (error: unknown) {
    logsError.value = error instanceof Error ? error.message : 'Could not fetch container logs'
    containerLogs.value = 'Failed to load logs'
  }
  finally {
    logsLoading.value = false
  }
}

function clearFilters() {
  search.value = ''
  serverFilter.value = undefined
  statusFilter.value = undefined
}

function canRunBulkAction(
  status: TransformedContainer['Status'],
  action: 'start' | 'stop' | 'restart' | 'prune',
): boolean {
  switch (action) {
    case 'start':
      return status === 'stopped'

    case 'stop':
      return ['running', 'healthy', 'unhealthy'].includes(status)

    case 'restart':
      return ['running', 'healthy', 'unhealthy'].includes(status)

    case 'prune':
      return status === 'stale'

    default:
      return false
  }
}

const selectedStartCount = computed(() =>
  selectedRows.value.filter(row => canRunBulkAction((row as TransformedContainer).Status, 'start')).length,
)
const selectedStopCount = computed(() =>
  selectedRows.value.filter(row => canRunBulkAction((row as TransformedContainer).Status, 'stop')).length,
)
const selectedRestartCount = computed(() =>
  selectedRows.value.filter(row => canRunBulkAction((row as TransformedContainer).Status, 'restart')).length,
)
const selectedPruneCount = computed(() =>
  selectedRows.value.filter(row => canRunBulkAction((row as TransformedContainer).Status, 'prune')).length,
)

async function handleBulkAction(action: 'start' | 'stop' | 'restart' | 'prune') {
  const filteredContainers = selectedRows.value
    .map(row => row as TransformedContainer)
    .filter(row => canRunBulkAction(row.Status, action))
    .map(row => row._original)

  if (filteredContainers.length === 0)
    return

  for (const container of filteredContainers) {
    if (action === 'prune') {
      await handlePrune(container)
      continue
    }
    await handleControl(container, action)
  }

  // Only deselect rows if all selected rows were affected by the action
  if (filteredContainers.length === selectedRows.value.length) {
    deselectAllRows()
  }
}

function handleBulkPrune() {
  showBulkPruneConfirm.value = false
  handleBulkAction('prune')
}

watch(
  () => [props.focusContainerName, loading.value] as const,
  ([focusContainerName, isLoading]) => {
    if (isLoading)
      return

    openContainerByName(focusContainerName)
  },
  { immediate: true },
)

onBeforeMount(fetchContainers)
</script>

<template>
  <Alert v-if="!canReadContainers" variant="info">
    You don't have permission to view containers.
  </Alert>

  <template v-else>
    <Alert v-if="errorMessage" variant="danger">
      <p>{{ errorMessage }}</p>
    </Alert>

    <template v-else-if="initialLoad">
      <Flex gap="s" column expand>
        <Flex :column="isBelowMedium" :x-between="!isBelowMedium" :x-start="isBelowMedium" y-center gap="s" expand>
          <ContainerFilters
            v-model:search="search"
            v-model:server-filter="serverFilter"
            v-model:status-filter="statusFilter"
            :server-options="serverOptions"
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
            <Button size="s" square variant="gray" :loading="loading" @click="fetchContainers()">
              <Icon name="ph:arrows-clockwise" />
            </Button>
            <span class="text-color-lighter text-s" :class="{ 'text-center': isBelowMedium }">Total -</span>
          </Flex>
        </Flex>

        <TableSkeleton
          :columns="5"
          :rows="10"
          :show-actions="canManageResource"
        />
      </Flex>
    </template>

    <Flex v-else gap="s" column expand>
      <Flex :column="isBelowMedium" :x-between="!isBelowMedium" :x-start="isBelowMedium" y-center gap="s" expand>
        <ContainerFilters
          v-model:search="search"
          v-model:server-filter="serverFilter"
          v-model:status-filter="statusFilter"
          :server-options="serverOptions"
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
          <Button size="s" square variant="gray" :loading="loading" @click="fetchContainers()">
            <Icon name="ph:arrows-clockwise" />
          </Button>
          <span class="text-color-lighter text-s" :class="{ 'text-center': isBelowMedium }">
            {{ isFiltered ? `Filtered ${filteredCount}` : `Total ${totalCount}` }}
          </span>
        </Flex>
      </Flex>

      <div class="table-loading-wrapper" :class="{ 'table-loading': loading && !initialLoad }">
        <TableContainer>
          <Table.Root v-if="rows && rows.length > 0" separate-cells class="mb-l">
            <template #header>
              <th v-if="canManageResource" class="vui-table-interactive-cell" />
              <Table.Head v-for="header in headers.filter(header => header.label !== '_original' && header.label !== 'id')" :key="header.label" sort :header />
              <Table.Head
                v-if="canManageResource"
                key="actions" :header="{ label: 'Actions',
                                         sortToggle: () => {} }"
              />
            </template>

            <template #body>
              <tr v-for="container in rows" :key="container._original.name" class="clickable-row">
                <Table.SelectRow v-if="canManageResource" :row="container as any" />
                <Table.Cell @click="viewContainer(container._original)">
                  {{ container.Name }}
                </Table.Cell>
                <Table.Cell @click="viewContainer(container._original)">
                  {{ container.Server }}
                </Table.Cell>
                <Table.Cell @click="viewContainer(container._original)">
                  <ContainerStatusIndicator :status="container.Status" show-label />
                </Table.Cell>
                <Table.Cell @click="viewContainer(container._original)">
                  <TimestampDate v-if="container.Started" :date="container.Started" />
                  <span v-else class="text-color-lighter text-s">Not started</span>
                </Table.Cell>
                <Table.Cell @click="viewContainer(container._original)">
                  <ElapsedTimeIndicator :date="container['Last Report']" :active-label="null" />
                </Table.Cell>
                <Table.Cell v-if="canManageResource" @click.stop>
                  <ContainerActions
                    v-model="containerAction"
                    :container="container._original"
                    :status="container.Status"
                    :is-loading="(action) => isActionLoading(container._original.name, action)"
                  />
                </Table.Cell>
              </tr>
            </template>

            <template v-if="filteredData.length > adminTablePerPage" #pagination>
              <Pagination :pagination="pagination" @change="setPage" />
            </template>
          </Table.Root>
        </TableContainer>
      </div>

      <Flex v-if="!loading && (!rows || rows.length === 0)" expand>
        <Alert variant="info" class="w-100">
          No containers found
        </Alert>
      </Flex>
    </Flex>

    <SelectedRowsActions
      :selected-count="selectedRows.length"
      @clear="deselectAllRows()"
    >
      <DropdownItem v-if="selectedStartCount > 0" @click="handleBulkAction('start')">
        <template #icon>
          <Icon name="ph:play" class="text-color-green" />
        </template>
        Start
        <template #hint>
          {{ selectedStartCount }}
        </template>
      </DropdownItem>
      <DropdownItem v-if="selectedStopCount > 0" @click="handleBulkAction('stop')">
        <template #icon>
          <Icon name="ph:stop" class="text-color-red" />
        </template>
        Stop
        <template #hint>
          {{ selectedStopCount }}
        </template>
      </DropdownItem>
      <DropdownItem v-if="selectedRestartCount > 0" @click="handleBulkAction('restart')">
        <template #icon>
          <Icon name="ph:arrow-clockwise" />
        </template>
        Restart
        <template #hint>
          {{ selectedRestartCount }}
        </template>
      </DropdownItem>
      <DropdownItem v-if="selectedPruneCount > 0" @click="showBulkPruneConfirm = true">
        <template #icon>
          <Icon name="ph:trash" class="text-color-red" />
        </template>
        Prune
        <template #hint>
          {{ selectedPruneCount }}
        </template>
      </DropdownItem>
    </SelectedRowsActions>

    <ConfirmModal
      :open="showBulkPruneConfirm"
      :title="`Prune ${selectedPruneCount} containers`"
      :description="`Are you sure you want to prune ${selectedPruneCount} stale containers? This action cannot be undone.`"
      confirm-text="Prune"
      cancel-text="Cancel"
      :destructive="true"
      @cancel="showBulkPruneConfirm = false"
      @confirm="handleBulkPrune"
    />

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

.table-loading-wrapper {
  width: 100%;
  overflow: hidden;
  transition: opacity var(--transition-slow);
}

.table-loading {
  opacity: 0.4;
  pointer-events: none;
}
</style>
