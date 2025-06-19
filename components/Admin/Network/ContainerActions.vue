<script setup lang="ts">
import { Button, Flex } from '@dolanske/vui'
import ConfirmModal from '../../Shared/ConfirmModal.vue'

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
  status: string
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
    <Button
      v-if="['stopped'].includes(props.status)"
      :size="props.showLabels ? 'm' : 's'"
      variant="success"
      :icon="props.showLabels ? undefined : 'ph:play'"
      :loading="isActionLoading('start')"
      @click="handleAction('start')"
    >
      <template v-if="props.showLabels" #start>
        <Icon name="ph:play" />
      </template>
      <template v-if="props.showLabels">
        Start
      </template>
    </Button>
    <Button
      v-if="['running', 'healthy', 'unhealthy'].includes(props.status)"
      :size="props.showLabels ? 'm' : 's'"
      :icon="props.showLabels ? undefined : 'ph:arrow-clockwise'"
      variant="danger"
      :loading="isActionLoading('restart')"
      @click="handleAction('restart')"
    >
      <template v-if="props.showLabels" #start>
        <Icon name="ph:arrow-clockwise" />
      </template>
      <template v-if="props.showLabels">
        Restart
      </template>
    </Button>
    <Button
      v-if="['running', 'healthy', 'unhealthy'].includes(props.status)"
      :size="props.showLabels ? 'm' : 's'"
      variant="danger"
      :icon="props.showLabels ? undefined : 'ph:stop'"
      :loading="isActionLoading('stop')"
      @click="handleAction('stop')"
    >
      <template v-if="props.showLabels" #start>
        <Icon name="ph:stop" />
      </template>
      <template v-if="props.showLabels">
        Stop
      </template>
    </Button>

    <Button
      v-if="['stale'].includes(props.status)"
      :size="props.showLabels ? 'm' : 's'"
      variant="danger"
      :loading="isActionLoading('prune')"
      :icon="props.showLabels ? undefined : 'ph:trash'"
      :square="!props.showLabels"
      :data-title-top="props.showLabels ? undefined : 'Prune Container'"
      @click="openPruneConfirm"
    >
      <template v-if="props.showLabels" #start>
        <Icon name="ph:trash" />
      </template>
      <template v-if="props.showLabels">
        Prune
      </template>
    </Button>

    <!-- Confirmation Modal for Prune Action -->
    <ConfirmModal
      v-model:open="showPruneConfirm"
      v-model:confirm="handlePrune"
      title="Confirm Prune Action"
      description="Are you sure you want to prune this container? This action cannot be undone."
      confirm-text="Prune"
      cancel-text="Cancel"
      :destructive="true"
    />
  </Flex>
</template>
