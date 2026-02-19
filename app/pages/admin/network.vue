<script setup lang="ts">
import { Alert, Flex, Tab, Tabs } from '@dolanske/vui'

import ContainerKPIs from '@/components/Admin/Network/ContainerKPIs.vue'
import ContainerTable from '@/components/Admin/Network/ContainerTable.vue'
import GameserverTable from '@/components/Admin/Network/GameServerTable.vue'
import ServerTable from '@/components/Admin/Network/ServerTable.vue'

// Define container with server interface to match what ContainerTable expects
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
  } | null
}

// Get admin permissions
const { hasPermission } = useAdminPermissions()
const route = useRoute()
const router = useRouter()

// Check permissions for each resource type
const canReadServers = computed(() => hasPermission('servers.read'))
const canReadGameservers = computed(() => hasPermission('gameservers.read'))
const canReadContainers = computed(() => hasPermission('containers.read'))

// Tab management - compute available tabs and set default
const availableTabs = computed(() => {
  const tabs = []
  if (canReadContainers.value)
    tabs.push({ label: 'Containers', value: 'Containers' })
  if (canReadGameservers.value)
    tabs.push({ label: 'Gameservers', value: 'Gameservers' })
  if (canReadServers.value)
    tabs.push({ label: 'Servers', value: 'Servers' })
  return tabs
})

// Set active tab to first available tab
const activeTab = ref('')

// Focused container from query string
const focusedContainerName = computed(() => {
  const containerQuery = route.query.container
  if (typeof containerQuery === 'string')
    return containerQuery
  if (Array.isArray(containerQuery) && containerQuery[0])
    return containerQuery[0]
  return ''
})

// Watch for available tabs changes and set default.
// If query tab is valid and available, prefer that tab.
watch([availableTabs, () => route.query.tab], ([newTabs, queryTab]) => {
  const queryTabValue = typeof queryTab === 'string'
    ? queryTab
    : Array.isArray(queryTab) && queryTab[0]
      ? queryTab[0]
      : ''

  if (queryTabValue && newTabs.some(tab => tab.value === queryTabValue)) {
    activeTab.value = queryTabValue
    return
  }

  if (newTabs.length > 0 && !activeTab.value && newTabs[0]) {
    activeTab.value = newTabs[0].value
  }
}, { immediate: true })

watch(activeTab, (tab) => {
  if (!tab)
    return
  const currentTab = typeof route.query.tab === 'string'
    ? route.query.tab
    : Array.isArray(route.query.tab) && route.query.tab[0]
      ? route.query.tab[0]
      : ''
  if (currentTab === tab)
    return
  router.push({ query: { ...route.query, tab } })
})

const supabase = useSupabaseClient()

// Refresh signals for each tab
const refreshSignal = ref(0)
const serverRefreshSignal = ref(0)
const gameserverRefreshSignal = ref(0)

// Handle refresh events from ContainerTable
function handleRefreshSignal(value: number) {
  // Update the refresh signal for KPIs when containers are updated
  refreshSignal.value = value
}

// Container control actions
async function handleContainerControl(container: ContainerWithServer, action: 'start' | 'stop' | 'restart') {
  try {
    const endpoint = `admin-docker-control-container-${action}/${container.name}`
    const { error } = await supabase.functions.invoke(endpoint, {
      method: 'POST',
    })

    if (error)
      throw error

    // Container state will be updated by the component itself
  }
  catch (error) {
    console.error('Container control error:', error)
  }
}
</script>

<template>
  <Flex column gap="m">
    <Flex column :gap="0">
      <h1>Network</h1>
      <p class="text-color-light">
        Define servers, monitor containers and manage game servers
      </p>
    </Flex>

    <!-- Only show tabs if there are available tabs -->
    <Tabs v-if="availableTabs.length > 0" v-model="activeTab">
      <Tab v-for="tab in availableTabs" :key="tab.value" :value="tab.value">
        {{ tab.label }}
      </Tab>
    </Tabs>

    <!-- Servers Tab -->
    <Flex v-if="canReadServers" v-show="activeTab === 'Servers'" column gap="m" expand>
      <ServerTable v-model:refresh-signal="serverRefreshSignal" />
    </Flex>

    <!-- Gameservers Tab -->
    <Flex v-if="canReadGameservers" v-show="activeTab === 'Gameservers'" column gap="m" expand>
      <GameserverTable v-model:refresh-signal="gameserverRefreshSignal" />
    </Flex>

    <!-- Containers Tab -->
    <Flex v-if="canReadContainers" v-show="activeTab === 'Containers'" column gap="m" expand>
      <!-- Container KPIs with v-model for refresh -->
      <ContainerKPIs v-model:refresh-signal="refreshSignal" />

      <!-- Container Table with v-model for refresh -->
      <ContainerTable
        v-model:refresh-signal="refreshSignal"
        :control-container="handleContainerControl"
        :focus-container-name="focusedContainerName"
        @update:refresh-signal="handleRefreshSignal"
      />
    </Flex>

    <!-- No access message -->
    <Alert v-if="availableTabs.length === 0" variant="info">
      You don't have permission to view any network resources.
    </Alert>
  </Flex>
</template>
