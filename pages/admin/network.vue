<script setup lang="ts">
import { Flex, Tab, Tabs } from '@dolanske/vui'

import ContainerKPIs from '~/components/Admin/Network/ContainerKPIs.vue'
import ContainerTable from '~/components/Admin/Network/ContainerTable.vue'
import GameserverTable from '~/components/Admin/Network/GameserverTable.vue'
import ServerTable from '~/components/Admin/Network/ServerTable.vue'

// Tab management
const activeTab = ref('Containers')
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
async function handleContainerControl(container: any, action: 'start' | 'stop' | 'restart') {
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
    <Flex x-between>
      <h3>Network</h3>
    </Flex>

    <Tabs v-model="activeTab">
      <Tab value="Servers" />
      <Tab value="Gameservers" />
      <Tab value="Containers" />
    </Tabs>

    <!-- Servers Tab -->
    <Flex v-show="activeTab === 'Servers'" column gap="m" expand>
      <ServerTable v-model:refresh-signal="serverRefreshSignal" />
    </Flex>

    <!-- Gameservers Tab -->
    <Flex v-show="activeTab === 'Gameservers'" column gap="m" expand>
      <GameserverTable v-model:refresh-signal="gameserverRefreshSignal" />
    </Flex>

    <!-- Containers Tab -->
    <Flex v-show="activeTab === 'Containers'" column gap="m" expand>
      <!-- Container KPIs with v-model for refresh -->
      <ContainerKPIs v-model:refresh-signal="refreshSignal" />

      <!-- Container Table with v-model for refresh -->
      <ContainerTable
        v-model:refresh-signal="refreshSignal"
        :control-container="handleContainerControl"
        @update:refresh-signal="handleRefreshSignal"
      />
    </Flex>
  </Flex>
</template>
