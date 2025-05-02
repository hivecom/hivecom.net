<script setup lang="ts">
import type { Tables } from '~/types/database.types'

import { Alert, Button, Card, Divider, Flex, Sheet, Skeleton } from '@dolanske/vui'
import { computed, defineEmits, defineProps, ref, watch } from 'vue'
import StatusIndicator from './StatusIndicator.vue'

const props = defineProps<{
  open: boolean
  container?: Tables<'containers'>
}>()

const emit = defineEmits(['close', 'control'])

// Container details
const containerLogs = ref('')
const loading = ref(false)
const errorMessage = ref('')

// Container status
const containerStatus = computed(() => {
  if (!props.container)
    return 'unknown'

  if (props.container.running && props.container.healthy) {
    return 'healthy'
  }
  else if (props.container.running && !props.container.healthy) {
    return 'unhealthy'
  }
  else {
    return 'offline'
  }
})

// Format date for display
function formatDate(dateStr: string | null) {
  if (!dateStr)
    return 'Not available'
  return new Date(dateStr).toLocaleString()
}

// Fetch container logs
const supabase = useSupabaseClient()

async function fetchContainerLogs() {
  if (!props.container)
    return

  loading.value = true
  errorMessage.value = ''

  try {
    // Call the Docker control function to get logs
    const { data, error } = await supabase
      .functions
      .invoke(`admin-docker-control-container-logs/${props.container?.name}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      })

    if (error)
      throw error
    containerLogs.value = data?.logs || 'No logs available'
  }
  catch (error: any) {
    errorMessage.value = error.message || 'Could not fetch container logs'
    containerLogs.value = 'Failed to load logs'
  }
  finally {
    loading.value = false
  }
}

// Handle container control actions
function handleControl(action: 'start' | 'stop' | 'restart') {
  if (!props.container)
    return

  emit('control', { container: props.container, action })
}

// Reset state when container changes
watch(() => props.open, (newOpen) => {
  if (newOpen && props.container) {
    fetchContainerLogs()
  }
})

watch(() => props.container, (newContainer) => {
  if (props.open && newContainer) {
    fetchContainerLogs()
  }
})

function closeDetail() {
  emit('close')
}
</script>

<template>
  <Sheet
    :open="open"
    position="right"
    separator
    :size="600"
    @close="closeDetail"
  >
    <template #header>
      <h3>Container Details</h3>
    </template>

    <div v-if="container" class="container-detail">
      <Flex column gap="m">
        <!-- Basic info -->
        <Card>
          <Flex column gap="s">
            <Flex x-between y-center>
              <h4>{{ container.name }}</h4>
              <Flex y-center gap="xs">
                <StatusIndicator :status="containerStatus" :show-label="true" />
              </Flex>
            </Flex>

            <div class="detail-item">
              <span class="detail-label">Server:</span>
              <span>{{ container.server || 'Unknown' }}</span>
            </div>

            <div class="detail-item">
              <span class="detail-label">Started:</span>
              <span>{{ formatDate(container.started_at) }}</span>
            </div>

            <div class="detail-item">
              <span class="detail-label">Last Report:</span>
              <span>{{ formatDate(container.reported_at) }}</span>
            </div>
          </Flex>
        </Card>

        <!-- Actions -->
        <Flex gap="s">
          <Button
            v-if="!container.running"
            variant="success"
            @click="handleControl('start')"
          >
            Start Container
          </Button>
          <Button
            v-if="container.running"
            variant="danger"
            @click="handleControl('restart')"
          >
            Restart Container
          </Button>
          <Button
            v-if="container.running"
            variant="danger"
            @click="handleControl('stop')"
          >
            Stop Container
          </Button>
        </Flex>

        <Divider />

        <!-- Logs -->
        <div>
          <Flex x-between y-center class="mb-s">
            <h4>Container Logs</h4>
            <Button size="s" variant="gray" @click="fetchContainerLogs">
              <Flex y-center gap="xs">
                <Icon name="ph:arrow-clockwise" />
                Refresh
              </Flex>
            </Button>
          </Flex>

          <Alert v-if="errorMessage" variant="danger">
            {{ errorMessage }}
          </Alert>

          <Card v-else-if="loading" class="logs-container">
            <Skeleton :height="200" />
          </Card>

          <Card v-else class="logs-container">
            <pre class="container-logs">{{ containerLogs }}</pre>
          </Card>
        </div>
      </Flex>
    </div>

    <template #footer>
      <Flex x-between>
        <Button variant="gray" @click="closeDetail">
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

.detail-item {
  display: flex;
  margin: var(--space-xs) 0;
}

.detail-label {
  width: 100px;
  font-weight: 500;
  color: var(--color-text-muted);
}

.mb-s {
  margin-bottom: var(--space-s);
}

.logs-container {
  max-height: 400px;
  overflow-y: auto;
}

.container-logs {
  white-space: pre-wrap;
  font-family: monospace;
  font-size: 0.85rem;
  line-height: 1.4;
}
</style>
