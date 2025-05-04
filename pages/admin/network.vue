<script setup lang="ts">
import { Flex, Tab, Tabs } from '@dolanske/vui'

import ContainerKPIs from '~/components/Admin/Network/ContainerKPIs.vue'
import ContainerTable from '~/components/Admin/Network/ContainerTable.vue'

// Tab management
const activeTab = ref('Containers')
const supabase = useSupabaseClient()
// Refresh trigger for KPIs
const refreshKPIs = ref(0)

// Container control actions
async function handleContainerControl(container: any, action: 'start' | 'stop' | 'restart') {
  try {
    const endpoint = `admin-docker-control-container-${action}/${container.name}`
    const { error } = await supabase.functions.invoke(endpoint, {
      method: 'POST',
    })

    if (error)
      throw error

    // Trigger refresh of KPIs after container action
    refreshKPIs.value++
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

    <Tabs v-model="activeTab" variant="filled">
      <Tab label="Servers" />
      <Tab label="Gameservers" />
      <Tab label="Containers" />
    </Tabs>

    <!-- Containers Tab -->
    <Flex v-show="activeTab === 'Containers'" column gap="m" expand>
      <!-- Container KPIs -->
      <ContainerKPIs :refresh="refreshKPIs" />

      <!-- Container Table -->
      <ContainerTable
        :control-container="handleContainerControl"
      />
    </Flex>
  </Flex>
</template>
