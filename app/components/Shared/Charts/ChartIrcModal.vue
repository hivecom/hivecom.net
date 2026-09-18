<script setup lang="ts">
import type { ChannelOption } from '@/components/Shared/Charts/ChartIrc.vue'
import { Select } from '@dolanske/vui'
import { computed, ref } from 'vue'
import ChartActivityHistogramModal from '@/components/Shared/Charts/ChartActivityHistogramModal.vue'
import ChartIrc from '@/components/Shared/Charts/ChartIrc.vue'
import { formatMessageCount, IRC_MESSAGES_INFO, useDataMetrics } from '@/composables/useDataMetrics'
import { getCSSVariable } from '@/lib/utils/common'

// IRC activity chart in a modal, with the channel filter in the controls row.
// `count` is the network headcount the header shows until the chart reports a
// filtered figure back. `color` overrides the purple so the modal can match
// whatever chart opened it.
const props = defineProps<{
  count: number | null
  color?: string
}>()

const open = defineModel<boolean>('open', { default: false })

const { metricsHistory } = useDataMetrics()

// Messages over the range the chart has loaded. The history is shared module
// state, so this reads whatever the IRC chart inside the modal fetched.
const messagesLabel = computed(() => {
  let total: number | null = null
  for (const e of metricsHistory.value) {
    if (e.ircMessages !== null)
      total = (total ?? 0) + e.ircMessages
  }
  return total === null ? undefined : formatMessageCount(total)
})

// The chart owns the channel filter, so it reports back what the header should
// show. Falls back to network totals until it does.
interface ChartSummary { online: number | null, messages: string | undefined, scope: string }
const summary = ref<ChartSummary | null>(null)
const modalSubtitle = computed(() => {
  const scope = summary.value?.scope
  if (scope === undefined || scope === 'whole network')
    return 'Across the whole IRC network'

  return `Filtered to ${scope}`
})

// The picker sits in the brush controls row up in the modal, so the selection
// and the options the chart found live here and get handed back down.
const channelOptions = ref<ChannelOption[]>([])
const selectedChannels = ref<ChannelOption[] | undefined>([])

// The brush paints onto a canvas, where a var() reference wouldn't work, so the
// chart gets the computed value. Only read once the modal opens, which is
// always client-side.
const chartColor = computed(() => props.color ?? getCSSVariable('--color-text-purple'))
</script>

<template>
  <ChartActivityHistogramModal
    v-model:open="open"
    title="IRC Activity"
    :color="chartColor"
    :count="summary ? summary.online : count"
    :subtitle="modalSubtitle"
    count-label="online"
    count-singular="online"
    :count-suffix="summary ? summary.messages : messagesLabel"
    :count-info="IRC_MESSAGES_INFO"
    :series="['ircMessages']"
    :initial-period="count ? '24h' : '14d'"
  >
    <template v-if="channelOptions.length > 0" #controls>
      <Select
        v-model="selectedChannels"
        :options="channelOptions"
        placeholder="Whole network"
        size="s"
        show-clear
        search
        :single="false"
      />
    </template>
    <template #default="{ period, window, utc }">
      <ChartIrc
        v-model:channels="selectedChannels"
        :period
        :window
        :utc
        :color="chartColor"
        hide-title
        @summary="summary = $event"
        @options="channelOptions = $event"
      />
    </template>
  </ChartActivityHistogramModal>
</template>
