<script setup lang="ts">
import { Alert, Flex, Tab, Tabs } from '@dolanske/vui'
import { computed, ref } from 'vue'

import ContainerKPIs from '@/components/Admin/Network/ContainerKPIs.vue'
import ContainerTable from '@/components/Admin/Network/ContainerTable.vue'
import GameserverTable from '@/components/Admin/Network/GameServerTable.vue'
import ServerTable from '@/components/Admin/Network/ServerTable.vue'
import { useAdminPermissions } from '@/composables/useAdminPermissions'
import { getRouteQueryString } from '@/lib/utils/common'

definePageMeta({ layout: 'admin' })

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

const { hasPermission } = useAdminPermissions()
const route = useRoute()

const canReadServers = computed(() => hasPermission('network.read'))
const canReadGameservers = computed(() => hasPermission('network.read'))
const canReadContainers = computed(() => hasPermission('network.read'))

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

const { activeTab } = useAdminTabs(availableTabs)

const focusedContainerName = computed(() => getRouteQueryString(route.query.container))

const supabase = useSupabaseClient()

const refreshSignal = ref(0)
const serverRefreshSignal = ref(0)
const gameserverRefreshSignal = ref(0)

function handleRefreshSignal(value: number) {
  refreshSignal.value = value
}

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

    <Tabs v-if="availableTabs.length > 0" v-model="activeTab">
      <Tab v-for="tab in availableTabs" :key="tab.value" :value="tab.value">
        {{ tab.label }}
      </Tab>
    </Tabs>

    <Flex v-if="canReadServers" v-show="activeTab === 'Servers'" column gap="m" expand>
      <ServerTable v-model:refresh-signal="serverRefreshSignal" />
    </Flex>

    <Flex v-if="canReadGameservers" v-show="activeTab === 'Gameservers'" column gap="m" expand>
      <GameserverTable v-model:refresh-signal="gameserverRefreshSignal" />
    </Flex>

    <Flex v-if="canReadContainers" v-show="activeTab === 'Containers'" column gap="m" expand>
      <ContainerKPIs v-model:refresh-signal="refreshSignal" />

      <ContainerTable
        v-model:refresh-signal="refreshSignal"
        :control-container="handleContainerControl"
        :focus-container-name="focusedContainerName"
        @update:refresh-signal="handleRefreshSignal"
      />
    </Flex>

    <Alert v-if="availableTabs.length === 0" variant="info">
      You don't have permission to view any network resources.
    </Alert>
  </Flex>
</template>
