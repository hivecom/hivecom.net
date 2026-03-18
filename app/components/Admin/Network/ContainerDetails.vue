<script setup lang="ts">
import { Alert, Card, Flex, Grid, Sheet } from '@dolanske/vui'

import constants from '~~/constants.json'

import TimestampDate from '@/components/Shared/TimestampDate.vue'

import { getContainerStatus } from '@/lib/containerStatus'
import ContainerActions from './ContainerActions.vue'
import ContainerLogViewer from './ContainerLogViewer.vue'

import ContainerStatusIndicator from './ContainerStatusIndicator.vue'

const props = defineProps<{
  container: {
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
  } | null
  logs: string
  logsLoading: boolean
  logsError: string
  actionLoading: Record<string, Record<string, boolean>>
}>()

// Define models for two-way binding with proper type definitions
const isOpen = defineModel<boolean>('isOpen', { default: false })
const refreshLogsConfig = defineModel<{ tail?: number, since?: string, from?: string, to?: string } | null>('refreshLogsConfig', { default: null })

// Define container with server interface
interface ContainerWithServer {
  name: string
  running: boolean
  healthy: boolean | null
  started_at: string | null
  reported_at: string
  server: {
    id: number
    address: string
    docker_control?: boolean | null
    accessible?: boolean | null
  } | null
}

interface ContainerAction {
  container: ContainerWithServer
  type: 'start' | 'stop' | 'restart' | 'prune' | null
}
const containerAction = defineModel<ContainerAction | null>('containerAction', { default: null })

const refreshContainer = defineModel<boolean>('refreshContainer', { default: false })

// Computed property for container status
const containerStatus = computed(() => {
  if (!props.container)
    return 'unknown'

  const isDockerControlEnabled = props.container.server?.docker_control === true
  const isControlOffline = isDockerControlEnabled
    && (props.container.server?.accessible === false || !props.container.reported_at)

  return isDockerControlEnabled
    ? getContainerStatus(
        props.container.reported_at,
        props.container.running,
        props.container.healthy,
        isControlOffline,
      )
    : 'unknown'
})

// Watch for containerAction changes to trigger a data refresh after action is performed
watch(() => containerAction.value, (action) => {
  if (action) {
    setTimeout(() => {
      refreshContainer.value = true
    }, 1500)
  }
})

function handleClose() {
  isOpen.value = false
}

const logsVisible = computed(() =>
  containerStatus.value !== 'stale'
  && containerStatus.value !== 'control_offline'
  && containerStatus.value !== 'unknown',
)
</script>

<template>
  <Sheet
    :open="!!container && isOpen"
    position="right"
    :card="{ separators: true }"
    :size="600"
    @close="handleClose"
  >
    <template #header>
      <Flex x-between y-center expand>
        <Flex column :gap="0">
          <h4>Container Details</h4>
          <span v-if="container" class="text-color-light text-xxs">
            {{ container.name }}
          </span>
        </Flex>
        <ContainerActions
          v-if="container"
          v-model="containerAction"
          :container="container"
          :status="containerStatus"
          :show-labels="true"
          :is-loading="(action) => {
            if (!container) return false
            return !!props.actionLoading[container.name]?.[action]
          }"
        />
      </Flex>
    </template>

    <Flex v-if="container" column gap="m" class="container-detail">
      <Flex column gap="m" expand>
        <!-- Stale warning -->
        <Alert v-if="containerStatus === 'stale'" variant="warning" class="w-100">
          <p>This container appears to be stale. It hasn't reported status in {{ constants.CONTAINERS.STALE_HOURS }} hours and may no longer exist.</p>
        </Alert>

        <!-- Basic info -->
        <Card class="container-info" separators>
          <Flex column gap="l" expand>
            <Grid class="detail-item" expand :columns="2">
              <span class="text-color-light text-bold">Name:</span>
              <span class="container-name">{{ container.name }}</span>
            </Grid>

            <Grid class="detail-item" expand :columns="2">
              <span class="text-color-light text-bold">Status:</span>
              <ContainerStatusIndicator :status="containerStatus" :show-label="true" />
            </Grid>

            <Grid class="detail-item" expand :columns="2">
              <span class="text-color-light text-bold">Server:</span>
              <span>{{ container.server?.address || 'Unknown' }}</span>
            </Grid>

            <Grid class="detail-item" :columns="2" expand>
              <span class="text-color-light text-bold">Started:</span>
              <TimestampDate :date="container.started_at" fallback="Not started" />
            </Grid>

            <Grid class="detail-item" :columns="2" expand>
              <span class="text-color-light text-bold">Last Report:</span>
              <TimestampDate :date="container.reported_at" />
            </Grid>

            <Grid class="detail-item" :columns="2" expand>
              <span class="text-color-light text-bold">Created:</span>
              <TimestampDate :date="container.created_at" />
            </Grid>
          </Flex>
        </Card>

        <!-- Log viewer -->
        <Alert
          v-if="containerStatus === 'control_offline' || containerStatus === 'unknown'"
          variant="danger"
          class="w-100"
          filled
        >
          Logs cannot be retrieved as Docker Control is unavailable.
        </Alert>

        <ContainerLogViewer
          v-if="logsVisible"
          v-model:refresh-logs-config="refreshLogsConfig"
          :logs="logs"
          :logs-loading="logsLoading"
          :logs-error="logsError"
          :container-running="container.running"
          :container-status="containerStatus"
        />
      </Flex>
    </Flex>
  </Sheet>
</template>

<style scoped lang="scss">
.container-detail {
  padding-bottom: var(--space);
}

.container-info {
  background-color: var(--color-bg);
  margin-bottom: var(--space-l);
}

.w-100 {
  width: 100%;
}

.container-name {
  font-family: monospace;
  font-weight: bold;
  color: var(--color-text);
}
</style>
