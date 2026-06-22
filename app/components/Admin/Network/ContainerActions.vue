<script setup lang="ts">
import { Flex, Tooltip } from '@dolanske/vui'
import ConfirmModal from '@/components/Shared/ConfirmModal.vue'
import ResponsiveButton from '@/components/Shared/ResponsiveButton.vue'

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
  size?: 's' | 'm' | 'l'
}>()

const buttonSize = computed(() => props.size ?? (props.showLabels ? 'm' : 's'))

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
      <ResponsiveButton
        :collapsed="!props.showLabels"
        :size="buttonSize"
        variant="success"
        :loading="isActionLoading('start')"
        icon="ph:play"
        label="Start"
        @click="handleAction('start')"
      />
      <template #tooltip>
        <p>Start</p>
      </template>
    </Tooltip>
    <Tooltip v-if="['running', 'healthy', 'unhealthy', 'restarting'].includes(props.status)" :disabled="props.showLabels">
      <ResponsiveButton
        :collapsed="!props.showLabels"
        :size="buttonSize"
        variant="danger"
        :loading="isActionLoading('restart')"
        :disabled="props.status === 'restarting'"
        icon="ph:arrow-clockwise"
        label="Restart"
        @click="handleAction('restart')"
      />
      <template #tooltip>
        <p>Restart</p>
      </template>
    </Tooltip>
    <Tooltip v-if="['running', 'healthy', 'unhealthy'].includes(props.status)" :disabled="props.showLabels">
      <ResponsiveButton
        :collapsed="!props.showLabels"
        :size="buttonSize"
        variant="danger"
        :loading="isActionLoading('stop')"
        :disabled="props.status === 'restarting'"
        icon="ph:stop"
        label="Stop"
        @click="handleAction('stop')"
      />
      <template #tooltip>
        <p>Stop</p>
      </template>
    </Tooltip>

    <Tooltip v-if="['stale'].includes(props.status)" :disabled="props.showLabels">
      <ResponsiveButton
        :collapsed="!props.showLabels"
        :size="buttonSize"
        variant="danger"
        :loading="isActionLoading('prune')"
        icon="ph:trash"
        label="Prune"
        @click="openPruneConfirm"
      />
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
