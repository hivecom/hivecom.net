<script setup lang="ts">
import { Button, ButtonGroup, Flex, Input, Select, Tooltip } from '@dolanske/vui'

interface SelectOption {
  label: string
  value: string
}

interface Props {
  logTimePeriods: { label: string, value: string }[]
  logs: string
  logsLoading: boolean
}

defineProps<Props>()

const emit = defineEmits<{
  refresh: []
  copy: []
}>()

const useCustomDateRange = defineModel<boolean>('useCustomDateRange', { default: false })
const logTimePeriod = defineModel<SelectOption[]>('logTimePeriod', { default: () => [{ label: 'All time', value: 'all' }] })
const logTail = defineModel<number>('logTail', { default: 100 })

let tailDebounceTimer: number | null = null

watch(logTail, () => {
  if (tailDebounceTimer)
    clearTimeout(tailDebounceTimer)
  tailDebounceTimer = setTimeout(emit, 600, 'refresh') as unknown as number
})
const fromDate = defineModel<string>('fromDate', { default: '' })
const toDate = defineModel<string>('toDate', { default: '' })
</script>

<template>
  <Flex gap="s" y-end wrap x-between expand>
    <Flex gap="s" y-center wrap>
      <template v-if="!useCustomDateRange">
        <Select
          v-model="logTimePeriod"
          label="Time period"
          :options="logTimePeriods"
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
    <ButtonGroup :gap="1">
      <Tooltip>
        <Button
          square
          :variant="useCustomDateRange ? 'accent' : 'gray'"
          :disabled="!logs || logsLoading"
          aria-label="Toggle custom date range"
          @click="useCustomDateRange = !useCustomDateRange"
        >
          <Icon name="ph:calendar-dots" />
        </Button>
        <template #tooltip>
          <p>Custom date range</p>
        </template>
      </Tooltip>
      <Tooltip>
        <Button
          square
          variant="gray"
          :disabled="!logs || logsLoading"
          aria-label="Copy logs to clipboard"
          @click="emit('copy')"
        >
          <Icon name="ph:copy" />
        </Button>
        <template #tooltip>
          <p>Copy logs</p>
        </template>
      </Tooltip>
      <Tooltip>
        <Button
          square
          variant="gray"
          :disabled="!logs || logsLoading"
          aria-label="Refresh logs"
          @click="emit('refresh')"
        >
          <Icon name="ph:arrow-clockwise" />
        </Button>
        <template #tooltip>
          <p>Refresh logs</p>
        </template>
      </Tooltip>
    </ButtonGroup>
  </Flex>
</template>

<style scoped lang="scss">
.time-filter {
  width: 192px;
}

.tail-filter {
  width: 90px;
}
</style>
