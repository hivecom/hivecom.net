<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import constants from '~~/constants.json'
import { getContainerStatus } from '@/lib/utils/containerStatus'

import KPICard from '../KPICard.vue'
import KPIContainer from '../KPIContainer.vue'

const refreshSignal = defineModel<number>('refreshSignal')

// Container metrics
const metrics = ref({
  running: 0,
  healthy: 0,
  unhealthy: 0,
  stopped: 0,
  stale: 0,
  total: 0,
})

// Data fetch state
const loading = ref(true)
const errorMessage = ref('')

// Get Supabase client
const supabase = useSupabaseClient()

// Fetch container metrics
async function fetchContainerMetrics() {
  loading.value = true
  errorMessage.value = ''

  try {
    // Query for all containers
    const { data, error } = await supabase
      .from('containers')
      .select(`
        name,
        running,
        healthy,
        reported_at
      `)

    if (error) {
      throw error
    }

    // Reset metrics
    const newMetrics = {
      running: 0,
      healthy: 0,
      unhealthy: 0,
      stopped: 0,
      stale: 0,
      total: data ? data.length : 0,
    }

    // Calculate metrics
    data?.forEach((container) => {
      const status = getContainerStatus(container.reported_at, container.running, container.healthy)

      switch (status) {
        case 'healthy':
          newMetrics.healthy++
          break
        case 'unhealthy':
          newMetrics.unhealthy++
          break
        case 'running':
          newMetrics.running++
          break
        case 'stopped':
          newMetrics.stopped++
          break
        case 'stale':
          newMetrics.stale++
          break
      }
    })

    metrics.value = newMetrics
  }
  catch (error: unknown) {
    errorMessage.value = error instanceof Error ? error.message : 'Failed to fetch container metrics'
  }
  finally {
    loading.value = false
  }
}

// Compute combined active containers (healthy + running)
const activeContainers = computed(() => {
  return metrics.value.healthy + metrics.value.running
})

// Watch for refresh signal from parent
watch(() => refreshSignal.value, () => {
  fetchContainerMetrics()
})

// Fetch data on component mount
onBeforeMount(fetchContainerMetrics)
</script>

<template>
  <KPIContainer>
    <KPICard
      label="Active Containers"
      :value="activeContainers"
      icon="ph:check-circle"
      variant="success"
      :is-loading="loading"
    />

    <KPICard
      label="Unhealthy Containers"
      :value="metrics.unhealthy"
      icon="ph:warning-circle"
      variant="danger"
      :is-loading="loading"
    />

    <KPICard
      label="Stopped Containers"
      :value="metrics.stopped"
      icon="ph:stop-circle"
      variant="gray"
      :is-loading="loading"
    />

    <KPICard
      label="Stale Containers"
      :value="metrics.stale"
      icon="ph:hourglass"
      variant="warning"
      :description="`Containers not reporting for ${constants.CONTAINERS.STALE_HOURS}+ hours`"
      :is-loading="loading"
    />
  </KPIContainer>
</template>

<style scoped lang="scss">

</style>
