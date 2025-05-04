<script setup lang="ts">
import constants from '@/constants.json'
import { Alert, Button, Card, Flex, Sheet, Skeleton } from '@dolanske/vui'
import Convert from 'ansi-to-html'
import { computed, nextTick, ref, watch } from 'vue'
import ContainerActions from './ContainerActions.vue'
import StatusIndicator from './StatusIndicator.vue'

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
  } | null
  logs: string
  logsLoading: boolean
  logsError: string
  actionLoading: Record<string, Record<string, boolean>>
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'refreshLogs'): void
  (e: 'control', container: any, action: 'start' | 'stop' | 'restart'): void
}>()

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

// Helper function for container status
function getContainerStatus(reportedAt: string, running: boolean, healthy?: boolean | null) {
  if (reportedAt && new Date(reportedAt) < new Date(Date.now() - 1000 * 60 * 60 * constants.CONTAINERS.STALE_HOURS))
    return 'stale' // Hasn't been updated for 2 hours (possibly removed)
  if (running && healthy === null)
    return 'running'
  if (running && healthy)
    return 'healthy'
  if (running && !healthy)
    return 'unhealthy'
  return 'stopped'
}

// Format date for display
function formatDate(dateStr: string | null) {
  if (!dateStr)
    return 'Not started'
  return new Date(dateStr).toLocaleString()
}

// Check if a specific action is loading for a container
function isActionLoading(action: string): Record<string, boolean> {
  if (!props.container)
    return {}
  return props.actionLoading[props.container.name]?.[action] ? { [action]: true } : {}
}

// Handle container control actions
function handleControl(container: any, action: 'start' | 'stop' | 'restart') {
  emit('control', container, action)
}

// Listen for refreshLogs event to ensure logs are scrolled after refresh
function handleRefreshLogs() {
  emit('refreshLogs')
  // Scroll will be handled by the logs watcher, but we add a backup
  setTimeout(scrollLogsToBottom, 300)
}
</script>

<template>
  <Sheet
    :open="!!container"
    position="right"
    separator
    :size="600"
    @close="$emit('close')"
  >
    <template #header>
      <h3>Container Details</h3>
    </template>

    <Flex v-if="container" column gap="m" class="container-detail">
      <Flex column gap="m" expand>
        <!-- Basic info -->
        <Card class="container-info">
          <Flex column gap="s">
            <Flex x-between y-center expand>
              <h4>{{ container.name }}</h4>
              <Flex y-center gap="xs">
                <StatusIndicator :status="containerStatus" :show-label="true" />
              </Flex>
            </Flex>

            <Flex column gap="xs" expand>
              <Flex class="detail-item" x-between expand>
                <span class="detail-label">Server:</span>
                <span>{{ container.server?.address || 'Unknown' }}</span>
              </Flex>

              <Flex class="detail-item" x-between expand>
                <span class="detail-label">Started:</span>
                <span>{{ formatDate(container.started_at) }}</span>
              </Flex>

              <Flex class="detail-item" x-between expand>
                <span class="detail-label">Last Report:</span>
                <span>{{ formatDate(container.reported_at) }}</span>
              </Flex>
            </Flex>
          </Flex>
        </Card>

        <!-- Actions -->
        <Flex gap="s">
          <ContainerActions
            v-if="containerStatus !== 'stale'"
            :container="container"
            :status="containerStatus"
            :is-loading="isActionLoading"
            @action="handleControl"
          />
          <Flex v-if="containerStatus === 'stale'" class="stale-container-message">
            <Alert variant="warning">
              This container appears to be stale. Actions are disabled.
            </Alert>
          </Flex>
        </Flex>

        <!-- Logs -->
        <Flex column gap="s" expand>
          <Flex x-between y-center class="mb-s">
            <h4>Container Logs</h4>
            <Button size="s" variant="gray" @click="handleRefreshLogs">
              <Flex y-center gap="xs">
                <Icon name="ph:arrow-clockwise" />
                Refresh
              </Flex>
            </Button>
          </Flex>

          <Alert v-if="logsError" variant="danger">
            {{ logsError }}
          </Alert>

          <Alert v-else-if="container && !container.running" variant="info">
            Container is not running. Logs are unavailable.
          </Alert>

          <Skeleton v-else-if="logsLoading" :height="200" />

          <div
            v-if="!logsLoading && !logsError"
            ref="logsContainerRef"
            class="container-logs"
            v-html="formattedLogs"
          />
        </Flex>
      </Flex>
    </Flex>

    <template #footer>
      <Flex x-between>
        <Button variant="gray" @click="$emit('close')">
          Close
        </Button>
      </Flex>
    </template>
  </Sheet>
</template>

<style scoped>
.container-detail {
  padding: var(--space-m) 0;
}

.container-info {
  width: 100%;
  padding: var(--space-m);
  background-color: var(--color-bg);
}
.detail-item {
  margin: var(--space-xs) 0;
}
.detail-label {
  width: 100px;
  font-weight: 500;
  color: var(--color-text-muted);
}
.logs-container {
  max-height: 400px;
  overflow-y: auto;
}
.container-logs {
  max-width: 100%;
  border-radius: var(--border-radius-s);
  white-space: pre;
  font-family: monospace;
  font-size: 0.8rem;
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
.stale-container-message {
  margin-top: var(--space-s);
}
</style>
