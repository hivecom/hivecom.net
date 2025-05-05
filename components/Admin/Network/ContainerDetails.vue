<script setup lang="ts">
import constants from '@/constants.json'
import { getContainerStatus } from '@/utils/containerStatus'

import { Alert, Button, ButtonGroup, Card, Divider, Flex, Grid, Input, Select, Sheet, Skeleton } from '@dolanske/vui'

import Convert from 'ansi-to-html'

import { computed, nextTick, ref, watch } from 'vue'

import TimestampDate from '~/components/Shared/TimestampDate.vue'
import ContainerActions from './ContainerActions.vue'
import ContainerStatusIndicator from './ContainerStatusIndicator.vue'

// Define interface for Select options
interface SelectOption {
  label: string
  value: string
}

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
    } | null
  } | null
  logs: string
  logsLoading: boolean
  logsError: string
  actionLoading: Record<string, Record<string, boolean>>
}>()

// Define models for two-way binding with proper type definitions
const isOpen = defineModel<boolean>('isOpen', { default: false })
// Type definitions that specify null as a possible value
const refreshLogsConfig = defineModel<{ tail?: number, since?: string, from?: string, to?: string } | null>('refreshLogsConfig', { default: null })
// Type that specifically allows null
type ContainerAction = { container: any, type: 'start' | 'stop' | 'restart' | 'prune' | null } | null
const containerAction = defineModel<ContainerAction>('containerAction', { default: null })

// Add a refreshTrigger model to request a refresh from parent
const refreshContainer = defineModel<boolean>('refreshContainer', { default: false })

// Log filtering options
const logTail = ref(100)
const logTimePeriods = [
  { label: '30 seconds', value: '30s' },
  { label: '5 minutes', value: '5m' },
  { label: '30 minutes', value: '30m' },
  { label: '3 hours', value: '3h' },
  { label: '6 hours', value: '6h' },
  { label: '12 hours', value: '12h' },
  { label: 'Last day', value: '24h' },
  { label: 'Last week', value: '168h' },
  { label: 'Last month', value: '720h' },
  { label: 'Last year', value: '8760h' },
  { label: 'All time', value: 'all' },
]
// Initialize with a default value
const logTimePeriod = ref<SelectOption[]>([{ label: 'All time', value: 'all' }])

// Date range filters for logs
const useCustomDateRange = ref(false)
const fromDate = ref<string>('')
const toDate = ref<string>('')

const ansiConverter = new Convert({
  newline: true,
  escapeXML: true,
})

// Reference to the logs container element
const logsContainerRef = ref<HTMLElement | null>(null)

// Format logs with ANSI color codes to HTML
const formattedLogs = computed(() => {
  if (!props.logs)
    return ''
  return ansiConverter.toHtml(props.logs)
})

// Function to scroll logs container to the bottom
async function scrollLogsToBottom() {
  await nextTick()
  if (logsContainerRef.value) {
    logsContainerRef.value.scrollTop = logsContainerRef.value.scrollHeight
  }
}

// Watch for changes in logs or container visibility to scroll to bottom
watch(() => props.logs, () => {
  if (props.logs && !props.logsLoading) {
    scrollLogsToBottom()
  }
}, { immediate: true })

watch(() => props.container, () => {
  if (props.container) {
    scrollLogsToBottom()
  }
}, { immediate: true })

// Watch for changes in logTimePeriod to refresh logs automatically
watch(() => logTimePeriod.value, (newValue) => {
  if (!useCustomDateRange.value && newValue && newValue.length > 0) {
    handleRefreshLogs()
  }
}, { immediate: false })

// Watch for containerAction changes to trigger a data refresh after action is performed
watch(() => containerAction.value, (action) => {
  if (action) {
    // After a longer delay to ensure the action completes and data is updated on the server
    setTimeout(() => {
      // Set refresh flag to true to trigger refresh in parent
      refreshContainer.value = true
    }, 1500) // Increased from 500ms to 1500ms for more reliable updates
  }
})

// Computed property for container status
const containerStatus = computed(() => {
  if (!props.container) {
    return 'unknown'
  }

  return getContainerStatus(
    props.container.reported_at,
    props.container.running,
    props.container.healthy,
  )
})

// Handle closing the sheet
function handleClose() {
  isOpen.value = false
}

// Handle copying logs to clipboard
async function copyLogsToClipboard() {
  if (!props.logs)
    return

  try {
    // Remove HTML tags to get plain text
    const plainText = props.logs.replace(/<[^>]*>/g, '')
    await navigator.clipboard.writeText(plainText)
  }
  catch (error) {
    console.error('Failed to copy logs to clipboard:', error)
  }
}

// Handle refreshing logs with selected options
function handleRefreshLogs() {
  if (useCustomDateRange.value && fromDate.value) {
    // If using custom date range, use ISO string format for API
    const fromTimestamp = fromDate.value ? new Date(fromDate.value).toISOString() : undefined
    const toTimestamp = toDate.value ? new Date(toDate.value).toISOString() : undefined
    refreshLogsConfig.value = {
      tail: logTail.value,
      from: fromTimestamp,
      to: toTimestamp,
    }
  }
  else {
    // Use the time period selection (since parameter)
    refreshLogsConfig.value = {
      tail: logTail.value,
      since: logTimePeriod.value[0].value,
    }
  }

  // Scroll will be handled by the logs watcher, but we add a backup
  setTimeout(scrollLogsToBottom, 300)
}

// Toggle between time period and custom date range
watch(() => useCustomDateRange.value, (newValue) => {
  if (newValue) {
    // When switching to custom date range, set a default from date if not set
    if (!fromDate.value) {
      const defaultDate = new Date()
      defaultDate.setHours(defaultDate.getHours() - 24) // Default to 24 hours ago
      fromDate.value = defaultDate.toISOString().split('T')[0] // Format as YYYY-MM-DD
    }
    if (!toDate.value) {
      const now = new Date()
      toDate.value = now.toISOString().split('T')[0] // Format as YYYY-MM-DD
    }
  }
})
</script>

<template>
  <Sheet
    :open="!!container && isOpen"
    position="right"
    separator
    :size="600"
    @close="handleClose"
  >
    <template #header>
      <h3>{{ containerStatus === 'stale' ? 'Container details' : container!.name }}</h3>
    </template>

    <Flex v-if="container" column gap="m" class="container-detail">
      <Flex column gap="m" expand>
        <!-- Actions -->
        <Alert v-if="containerStatus === 'stale'" variant="warning" class="w-100">
          This container appears to be stale. It hasn't reported status in {{ constants.CONTAINERS.STALE_HOURS }} hours and may no longer exist.
        </Alert>

        <!-- Basic info -->
        <Card class="container-info">
          <Flex column gap="l" expand>
            <Grid class="detail-item" expand :columns="2">
              <span class="detail-label">Status:</span>
              <ContainerStatusIndicator :status="containerStatus" :show-label="true" />
            </Grid>

            <Grid class="detail-item" expand :columns="2">
              <span class="detail-label">Server:</span>
              <span>{{ container.server?.address || 'Unknown' }}</span>
            </Grid>

            <Grid class="detail-item" :columns="2" expand>
              <span class="detail-label">Started:</span>
              <TimestampDate :date="container.started_at" fallback="Not started" />
            </Grid>

            <Grid class="detail-item" :columns="2" expand>
              <span class="detail-label">Last Report:</span>
              <TimestampDate :date="container.reported_at" />
            </Grid>

            <Grid class="detail-item" :columns="2" expand>
              <span class="detail-label">Created:</span>
              <TimestampDate :date="container.created_at" />
            </Grid>
          </Flex>

          <Divider size="40" />

          <ContainerActions
            v-model="containerAction"
            :container="container"
            :status="containerStatus"
            :is-loading="(action) => {
              if (!container) return false
              return !!props.actionLoading[container.name]?.[action]
            }"
          />
        </Card>

        <!-- Logs -->
        <Flex v-if="containerStatus !== 'stale'" column gap="s" expand>
          <Flex x-between y-center class="mb-s" expand>
            <h4>Logs</h4>
            <ButtonGroup :gap="1">
              <Button square icon="ph:calendar-dots" size="s" :variant="useCustomDateRange ? 'accent' : 'gray'" :disabled="!props.logs || props.logsLoading" data-title-bottom="Custom date range" @click="useCustomDateRange = !useCustomDateRange" />
              <Button square icon="ph:copy" size="s" variant="gray" :disabled="!props.logs || props.logsLoading" data-title-bottom="Copy logs" @click="copyLogsToClipboard" />
              <Button square icon="ph:arrow-clockwise" size="s" variant="gray" :disabled="!props.logs || props.logsLoading" data-title-bottom-right="Refresh logs" @click="handleRefreshLogs" />
            </ButtonGroup>
          </Flex>

          <!-- Time selection options -->
          <Flex gap="s" y-center class="mb-s" wrap>
            <template v-if="!useCustomDateRange">
              <Select
                v-model="logTimePeriod"
                label="Log time period"
                :options="logTimePeriods"
                size="s"
                class="time-filter"
              />
            </template>
            <template v-else>
              <Input v-model="fromDate" type="date" size="s" label="From date" />
              <Input v-model="toDate" type="date" size="s" label="To date (optional)" />
            </template>
            <Input
              v-model="logTail"
              label="Tail lines"
              type="number"
              :min="1"
              :max="10000"
              size="s"
              class="tail-filter"
              placeholder="Tail lines"
            />
          </Flex>

          <Alert v-if="logsError" variant="danger">
            {{ logsError }}
          </Alert>

          <Alert v-else-if="container && !container.running" variant="info" class="w-100">
            Container is not running. Logs are unavailable.
          </Alert>

          <Skeleton v-else-if="logsLoading" :height="200" />

          <div
            v-if="!logsLoading && !logsError && container?.running"
            ref="logsContainerRef"
            class="container-logs"
            v-html="formattedLogs"
          />
        </Flex>
      </Flex>
    </Flex>
  </Sheet>
</template>

<style scoped>
.container-detail {
  padding-bottom: var(--space);
}
.container-info {
  padding: var(--space-s);
  background-color: var(--color-bg);
  margin-bottom: var(--space-l);
}
.detail-label {
  /* width: 100px; */
  font-weight: 500;
  color: var(--color-text-light);
}
.logs-container {
  max-height: 400px;
  overflow-y: auto;
}
.container-logs {
  width: 100%;
  max-width: 100%;
  border-radius: var(--border-radius-s);
  white-space: pre;
  color: #fff;
  font-family: monospace;
  font-size: 1.5rem;
  line-height: 1.4;
  max-height: 50vh;
  overflow-y: auto;
  overflow-x: scroll;
  background-color: black;
  padding: var(--space-s);
  margin: 0;
}
.mb-s {
  margin-bottom: var(--space-s);
}
.time-filter {
  width: 192px;
}
.tail-filter {
  width: 90px;
}
.toggle-label {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  font-size: 1.4rem;
  color: var(--color-text-muted);
}
.w-100 {
  width: 100%;
}
</style>
