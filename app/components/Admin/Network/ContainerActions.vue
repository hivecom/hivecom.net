<script setup lang="ts">
import { Button, Flex, Tooltip } from '@dolanske/vui'
import ConfirmModal from '@/components/Shared/ConfirmModal.vue'

const props = defineProps<{
  container: {
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
  status: 'running' | 'healthy' | 'unhealthy' | 'stopped' | 'stale' | 'unknown' | 'restarting' | 'control_offline'
  isLoading: (action: string) => Record<string, boolean> | boolean
  showLabels?: boolean
}>()

// Define a model value for actions with proper type
interface ContainerWithServer {
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

interface ContainerAction {
  container: ContainerWithServer
  type: 'start' | 'stop' | 'restart' | 'prune' | null
}
const action = defineModel<ContainerAction | null>('modelValue', { default: null })

// Handler functions to update the model value with the appropriate action
function handleAction(actionType: 'start' | 'stop' | 'restart') {
  action.value = { container: props.container, type: actionType }
}

// State for prune confirmation modal
const showPruneConfirm = ref(false)

function handlePrune() {
  action.value = { container: props.container, type: 'prune' }
}

function openPruneConfirm() {
  showPruneConfirm.value = true
}

// Helper function to determine if specific action is loading
function isActionLoading(actionType: string): boolean {
  const loading = props.isLoading(actionType)
  if (typeof loading === 'boolean') {
    return loading
  }
  return !!loading[actionType]
}
</script>

<template>
  <Flex :gap="props.showLabels ? 's' : 'xs'">
    <Tooltip v-if="['stopped'].includes(props.status)" :disabled="props.showLabels">
      <Button
        :size="props.showLabels ? 'm' : 's'"
        :square="!props.showLabels"
        variant="success"
        :loading="isActionLoading('start')"
        @click="handleAction('start')"
      >
        <Icon v-if="!props.showLabels" name="ph:play" />
        <template v-if="props.showLabels" #start>
          <Icon name="ph:play" />
        </template>
        <template v-if="props.showLabels">
          Start
        </template>
      </Button>
      <template #tooltip>
        <p>Start</p>
      </template>
    </Tooltip>
    <Tooltip v-if="['running', 'healthy', 'unhealthy', 'restarting'].includes(props.status)" :disabled="props.showLabels">
      <Button
        :size="props.showLabels ? 'm' : 's'"
        variant="danger"
        :square="!props.showLabels"
        :loading="isActionLoading('restart')"
        :disabled="props.status === 'restarting'"
        @click="handleAction('restart')"
      >
        <Icon v-if="!props.showLabels" name="ph:arrow-clockwise" />
        <template v-if="props.showLabels" #start>
          <Icon name="ph:arrow-clockwise" />
        </template>
        <template v-if="props.showLabels">
          Restart
        </template>
      </Button>
      <template #tooltip>
        <p>Restart</p>
      </template>
    </Tooltip>
    <Tooltip v-if="['running', 'healthy', 'unhealthy'].includes(props.status)" :disabled="props.showLabels">
      <Button
        :size="props.showLabels ? 'm' : 's'"
        :square="!props.showLabels"
        variant="danger"
        :loading="isActionLoading('stop')"
        :disabled="props.status === 'restarting'"
        @click="handleAction('stop')"
      >
        <Icon v-if="!props.showLabels" name="ph:stop" />
        <template v-if="props.showLabels" #start>
          <Icon name="ph:stop" />
        </template>
        <template v-if="props.showLabels">
          Stop
        </template>
      </Button>
      <template #tooltip>
        <p>Stop</p>
      </template>
    </Tooltip>

    <Tooltip v-if="['stale'].includes(props.status)" :disabled="props.showLabels">
      <Button
        :size="props.showLabels ? 'm' : 's'"
        variant="danger"
        :loading="isActionLoading('prune')"
        :square="!props.showLabels"
        @click="openPruneConfirm"
      >
        <Icon v-if="!props.showLabels" name="ph:trash" />
        <template v-if="props.showLabels" #start>
          <Icon name="ph:trash" />
        </template>
        <template v-if="props.showLabels">
          Prune
        </template>
      </Button>
      <template #tooltip>
        <p>
          Prune Container
        </p>
      </template>
    </Tooltip>

    <!-- Confirmation Modal for Prune Action -->
    <ConfirmModal
      v-model:open="showPruneConfirm"
      :confirm="handlePrune"
      title="Confirm Prune Action"
      description="Are you sure you want to prune this container? This action cannot be undone."
      confirm-text="Prune"
      cancel-text="Cancel"
      :destructive="true"
    />
  </Flex>
</template>
