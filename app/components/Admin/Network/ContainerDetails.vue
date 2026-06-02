<script setup lang="ts">
import { Alert, Badge, Button, Flex, Sheet } from '@dolanske/vui'

import constants from '~~/constants.json'

import DetailRow from '@/components/Admin/Shared/DetailRow.vue'
import DetailTable from '@/components/Admin/Shared/DetailTable.vue'
import TimestampDate from '@/components/Shared/TimestampDate.vue'
import { getContainerStatus } from '@/lib/containerStatus'
import { useBreakpoint } from '@/lib/mediaQuery'
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
    gameserver: readonly {
      id: number
      name: string
    }[] | null
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
  gameserver: readonly {
    id: number
    name: string
  }[] | null
}

interface ContainerAction {
  container: ContainerWithServer
  type: 'start' | 'stop' | 'restart' | 'prune' | null
}
const containerAction = defineModel<ContainerAction | null>('containerAction', { default: null })

const refreshContainer = defineModel<boolean>('refreshContainer', { default: false })

const isMobile = useBreakpoint('<s')

// Computed property for container status
const containerStatus = computed(() => {
  if (!props.container)
    return 'unknown'

  const isDockerControlEnabled = props.container.server?.docker_control === true
  const isControlOffline = isDockerControlEnabled
    && (props.container.server?.accessible === false || !props.container.reported_at)
  const isRestarting = !!props.actionLoading[props.container.name]?.restart

  return isDockerControlEnabled
    ? getContainerStatus(
        props.container.reported_at,
        props.container.running,
        props.container.healthy,
        isControlOffline,
        isRestarting,
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
        <Flex v-if="container" y-center gap="xs">
          <Button
            square
            variant="gray"
            :loading="refreshContainer"
            @click="refreshContainer = true"
          >
            <Icon name="ph:arrows-clockwise" />
          </Button>
          <ContainerActions
            v-model="containerAction"
            :container="container"
            :status="containerStatus"
            :show-labels="!isMobile"
            :size="isMobile ? 'm' : undefined"
            :is-loading="(action) => {
              if (!container) return false
              return !!props.actionLoading[container.name]?.[action]
            }"
          />
        </Flex>
      </Flex>
    </template>

    <Flex v-if="container" column gap="m" class="container-detail">
      <Flex column gap="m" expand>
        <!-- Stale warning -->
        <Alert v-if="containerStatus === 'stale'" variant="warning" class="w-100">
          <p>This container appears to be stale. It hasn't reported status in {{ constants.CONTAINERS.STALE_HOURS }} hours and may no longer exist.</p>
        </Alert>

        <!-- Basic info -->
        <DetailTable>
          <template #header>
            <Icon name="ph:cube" />
            <h6>Overview</h6>
          </template>
          <DetailRow label="Status">
            <ContainerStatusIndicator :status="containerStatus" :show-label="true" />
          </DetailRow>
          <DetailRow label="Gameserver">
            <template v-if="container.gameserver && container.gameserver.length > 0">
              <NuxtLink :to="`/admin/network?tab=Gameservers&gameserver=${container.gameserver[0]!.id}`">
                <Badge variant="accent" size="m" outline>
                  {{ container.gameserver[0]!.name }}
                </Badge>
              </NuxtLink>
            </template>
            <Badge v-else variant="neutral" size="m">
              Not linked
            </Badge>
          </DetailRow>
          <DetailRow label="Server">
            <span class="text-s">{{ container.server?.address || 'Unknown' }}</span>
          </DetailRow>
          <DetailRow label="Started">
            <TimestampDate :date="container.started_at" fallback="Not started" />
          </DetailRow>
          <DetailRow label="Last Report">
            <TimestampDate :date="container.reported_at" />
          </DetailRow>
          <DetailRow label="Created">
            <TimestampDate :date="container.created_at" />
          </DetailRow>
        </DetailTable>

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

.w-100 {
  width: 100%;
}
</style>
