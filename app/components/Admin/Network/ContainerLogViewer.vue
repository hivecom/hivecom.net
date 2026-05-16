<script setup lang="ts">
import { Alert, Button, Card, Flex, Modal, Skeleton, Tooltip } from '@dolanske/vui'
import Convert from 'ansi-to-html'
import ContainerLogViewerControls from './ContainerLogViewerControls.vue'

interface SelectOption {
  label: string
  value: string
}

interface Props {
  logs: string
  logsLoading: boolean
  logsError: string
  containerRunning: boolean
  containerStatus: string
}

const props = defineProps<Props>()

const refreshLogsConfig = defineModel<{ tail?: number, since?: string, from?: string, to?: string } | null>(
  'refreshLogsConfig',
  { default: null },
)

const HTML_TAG_RE = /<[^>]*>/g

// Log filtering state
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
const logTimePeriod = ref<SelectOption[]>([{ label: 'All time', value: 'all' }])

// Date range toggle
const useCustomDateRange = ref(false)
const fromDate = ref<string>('')
const toDate = ref<string>('')

const ansiConverter = new Convert({
  newline: true,
  escapeXML: true,
})

const fullscreen = ref(false)

const logsContainerRef = ref<HTMLElement | null>(null)
const logsContainerModalRef = ref<HTMLElement | null>(null)
const autoScrollEnabled = ref(true)

function handleLogsScroll(el: HTMLElement | null) {
  if (el == null)
    return

  const bottomThresholdPx = 24
  const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
  autoScrollEnabled.value = distanceFromBottom <= bottomThresholdPx
}

const formattedLogs = computed(() => {
  if (!props.logs)
    return ''
  return ansiConverter.toHtml(props.logs)
})

async function scrollLogsToBottom() {
  if (!autoScrollEnabled.value)
    return

  await nextTick()
  await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))

  const activeRef = fullscreen.value ? logsContainerModalRef : logsContainerRef
  const el = activeRef.value
  if (el == null)
    return

  // Double-set across frames to be resilient to async layout.
  el.scrollTop = el.scrollHeight
  await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
  el.scrollTop = el.scrollHeight
}

async function copyLogsToClipboard() {
  if (!props.logs)
    return

  try {
    const plainText = props.logs.replace(HTML_TAG_RE, '')
    await navigator.clipboard.writeText(plainText)
  }
  catch (error) {
    console.error('Failed to copy logs to clipboard:', error)
  }
}

function handleRefreshLogs() {
  if (useCustomDateRange.value && fromDate.value) {
    const fromTimestamp = fromDate.value ? new Date(fromDate.value).toISOString() : undefined
    const toTimestamp = toDate.value ? new Date(toDate.value).toISOString() : undefined
    refreshLogsConfig.value = {
      tail: logTail.value,
      from: fromTimestamp,
      to: toTimestamp,
    }
  }
  else {
    refreshLogsConfig.value = {
      tail: logTail.value,
      since: logTimePeriod.value[0]?.value,
    }
  }

  setTimeout(scrollLogsToBottom, 300)
}

// Auto-refresh when time period selection changes
watch(() => logTimePeriod.value, (newValue) => {
  if (!useCustomDateRange.value && newValue && newValue.length > 0) {
    handleRefreshLogs()
  }
}, { immediate: false })

// Populate default date range values when switching to custom mode
watch(() => useCustomDateRange.value, (newValue) => {
  if (newValue) {
    if (!fromDate.value) {
      const defaultDate = new Date()
      defaultDate.setHours(defaultDate.getHours() - 24)
      const dateString = defaultDate.toISOString().split('T')[0]
      if (dateString)
        fromDate.value = dateString
    }
    if (!toDate.value) {
      const dateString = new Date().toISOString().split('T')[0]
      if (dateString)
        toDate.value = dateString
    }
  }
})

// Scroll to bottom when logs update and are ready
watch(
  () => props.logs,
  () => {
    if (props.logs && !props.logsLoading)
      void scrollLogsToBottom()
  },
  { immediate: true, flush: 'post' },
)

// Scroll to bottom when the log container element mounts (card or modal)
watch(
  [() => logsContainerRef.value, () => logsContainerModalRef.value],
  ([el, modalEl]) => {
    if (el != null || modalEl != null)
      void scrollLogsToBottom()
  },
  { flush: 'post' },
)

// Scroll to bottom when the sheet opens or logs finish loading
watch(
  [() => props.logsLoading, () => props.logsError, () => props.containerRunning, () => props.logs],
  () => {
    if (props.logsLoading || props.logsError)
      return
    if (!props.containerRunning)
      return
    if (!props.logs)
      return
    void scrollLogsToBottom()
  },
  { immediate: true, flush: 'post' },
)
</script>

<template>
  <Card separators class="card-bg" expand>
    <template #header>
      <Flex x-between y-center expand>
        <Flex y-center gap="xs">
          <Icon name="ph:terminal-window" />
          <h6>Logs</h6>
        </Flex>
        <Tooltip>
          <Button
            square
            size="s"
            variant="gray"
            aria-label="Open logs in fullscreen"
            @click="fullscreen = true"
          >
            <Icon name="ph:arrows-out" />
          </Button>
          <template #tooltip>
            <p>Fullscreen</p>
          </template>
        </Tooltip>
      </Flex>
    </template>

    <Flex column gap="s" expand>
      <ContainerLogViewerControls
        v-model:use-custom-date-range="useCustomDateRange"
        v-model:log-time-period="logTimePeriod"
        v-model:log-tail="logTail"
        v-model:from-date="fromDate"
        v-model:to-date="toDate"
        :log-time-periods="logTimePeriods"
        :logs="props.logs"
        :logs-loading="props.logsLoading"
        @refresh="handleRefreshLogs"
        @copy="copyLogsToClipboard"
      />

      <Alert v-if="logsError" variant="danger">
        {{ logsError }}
      </Alert>

      <Alert v-else-if="!containerRunning" variant="info" class="w-100">
        Container is not running. Logs are unavailable.
      </Alert>

      <Skeleton v-else-if="logsLoading" :height="200" />

      <div
        v-if="!logsLoading && !logsError && containerRunning"
        ref="logsContainerRef"
        class="container-logs"
        @scroll="(e) => handleLogsScroll(e.currentTarget as HTMLElement)"
        v-html="formattedLogs"
      />
    </Flex>
  </Card>

  <Modal
    :open="fullscreen"
    size="screen"
    :card="{ headerSeparator: true }"
    @close="fullscreen = false"
  >
    <template #header>
      <Flex x-between y-center expand>
        <Flex y-center gap="xs">
          <Icon name="ph:terminal-window" />
          <h6>Logs</h6>
        </Flex>
      </Flex>
    </template>

    <Flex column gap="s" expand class="modal-logs-body">
      <div class="modal-logs-controls">
        <ContainerLogViewerControls
          v-model:use-custom-date-range="useCustomDateRange"
          v-model:log-time-period="logTimePeriod"
          v-model:log-tail="logTail"
          v-model:from-date="fromDate"
          v-model:to-date="toDate"
          :log-time-periods="logTimePeriods"
          :logs="props.logs"
          :logs-loading="props.logsLoading"
          @refresh="handleRefreshLogs"
          @copy="copyLogsToClipboard"
        />
      </div>

      <Alert v-if="logsError" variant="danger">
        {{ logsError }}
      </Alert>

      <Alert v-else-if="!containerRunning" variant="info" class="w-100">
        Container is not running. Logs are unavailable.
      </Alert>

      <Skeleton v-else-if="logsLoading" :height="200" />

      <div
        v-if="!logsLoading && !logsError && containerRunning"
        ref="logsContainerModalRef"
        class="container-logs container-logs--fullscreen"
        @scroll="(e) => handleLogsScroll(e.currentTarget as HTMLElement)"
        v-html="formattedLogs"
      />
    </Flex>
  </Modal>
</template>

<style scoped lang="scss">
:deep(.vui-modal .vui-card-content) {
  overflow: hidden;
}

.modal-logs-body {
  height: 100%;
  overflow: initial;

  .modal-logs-controls {
    flex-shrink: 0;
    position: sticky;
    top: -16px;
    left: 0;
    width: 100%;
    background-color: var(--color-bg);
    padding: var(--space-s) 0;
  }
}

.container-logs {
  width: 100%;
  max-width: 100%;
  border-radius: var(--border-radius-s);
  white-space: pre;
  color: #fff;
  font-family: monospace;
  font-size: var(--font-size-xs);
  line-height: 1.4;
  max-height: 64vh;
  overflow-y: auto;
  overflow-x: scroll;

  :deep(span) {
    font-size: inherit;
  }

  &--fullscreen {
    max-height: unset;
    flex: 1;
  }
  background-color: black;
  padding: var(--space-s);
  margin: 0;
}

.w-100 {
  width: 100%;
}
</style>
