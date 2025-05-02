<script setup lang="ts">
import { Tab, Tabs } from '@dolanske/vui'

import ContainerDetail from '~/components/Admin/ContainerDetail.vue'
import ContainerTable from '~/components/Admin/ContainerTable.vue'

// Tab management
const activeTab = ref('Containers')
const supabase = useSupabaseClient()

// Container detail state
const showContainerDetail = ref(false)
const selectedContainer = ref<any>(null)

// Open container detail
function openContainerDetail(container: any) {
  selectedContainer.value = container
  showContainerDetail.value = true
}

// Container control actions
async function handleContainerControl({ container, action }: { container: any, action: 'start' | 'stop' | 'restart' | 'status' | 'logs' }) {
  try {
    let method: 'POST' | 'GET' = 'POST'
    switch (action) {
      case 'start':
      case 'stop':
      case 'restart':
        method = 'POST'
        break
      case 'status':
      case 'logs':
        method = 'GET'
        break
    }

    const endpoint = `admin-docker-control-container-${action}/${container.name}`
    const { error } = await supabase.functions.invoke(endpoint, {
      method,
    })

    if (error)
      throw error

    // Close and refresh after control action
    setTimeout(() => {
      showContainerDetail.value = false
    }, 1000)
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
    <div v-show="activeTab === 'Containers'">
      <ContainerTable
        @view="openContainerDetail"
        @control="handleContainerControl"
      />
    </div>

    <ContainerDetail
      :open="showContainerDetail"
      :container="selectedContainer"
      @close="showContainerDetail = false"
      @control="handleContainerControl"
    />
  </Flex>
</template>
