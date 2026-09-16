<script setup lang="ts">
import type { ChannelOption } from '@/components/Shared/Charts/ChartIrc.vue'
import { Select } from '@dolanske/vui'
import { computed, onMounted, ref } from 'vue'
import ChartActivityHistogramModal from '@/components/Shared/Charts/ChartActivityHistogramModal.vue'
import ChartIrc from '@/components/Shared/Charts/ChartIrc.vue'
import OnlineBadge from '@/components/Shared/OnlineBadge.vue'
import { formatMessageCount, IRC_MESSAGES_INFO, useDataMetrics } from '@/composables/useDataMetrics'
import { getCSSVariable } from '@/lib/utils/common'

// Users connected to the IRC network as of the latest metrics snapshot, which
// is the same figure the IRC chart plots. Clicking opens that chart.
const { metrics, fetchMetrics, metricsHistory } = useDataMetrics()
const count = computed(() => metrics.value?.irc.online ?? null)

// Messages over the range the modal's chart has loaded. The history is shared
// module state, so this reads whatever the IRC chart inside the modal fetched.
const messagesLabel = computed(() => {
  let total: number | null = null
  for (const e of metricsHistory.value) {
    if (e.ircMessages !== null)
      total = (total ?? 0) + e.ircMessages
  }
  return total === null ? undefined : formatMessageCount(total)
})

// The chart inside the modal owns the channel filter, so it reports back what
// the header should show. Falls back to network totals until it does.
interface ChartSummary { online: number | null, messages: string | undefined, scope: string }
const summary = ref<ChartSummary | null>(null)
const modalCount = computed(() => summary.value ? summary.value.online : count.value)
const modalSuffix = computed(() => summary.value ? summary.value.messages : messagesLabel.value)
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

const activityModalOpen = ref(false)

// The badge is plain CSS, so it takes the variable straight through. Resolving
// it here instead would read '' on the server and the real color on the
// client, which is a hydration mismatch, and it would freeze on whatever the
// theme was at first paint.
const badgeColor = 'var(--color-text-purple)'

// The brush paints onto a canvas, where a var() reference wouldn't work, so the
// chart gets the computed value. Only read once the modal opens, which is
// always client-side.
const chartColor = computed(() => getCSSVariable('--color-text-purple'))

onMounted(() => {
  if (metrics.value === null)
    fetchMetrics()
})
</script>

<template>
  <!-- Client only because the count comes from the metrics cache in the
       browser, which the server has no view of. Server-render it and a visitor
       with a warm cache hydrates 6 over a server-rendered 0. The fallback is
       what the server used to emit anyway, so a cold load looks unchanged. -->
  <ClientOnly>
    <OnlineBadge
      :count="count"
      label=""
      size="s"
      :color="badgeColor"
      clickable
      @click="activityModalOpen = true"
    />

    <template #fallback>
      <OnlineBadge :count="null" label="" size="s" />
    </template>
  </ClientOnly>

  <ChartActivityHistogramModal
    v-model:open="activityModalOpen"
    title="IRC Activity"
    :color="chartColor"
    :count="modalCount"
    :subtitle="modalSubtitle"
    count-label="online"
    count-singular="online"
    :count-suffix="modalSuffix"
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
        hide-title
        @summary="summary = $event"
        @options="channelOptions = $event"
      />
    </template>
  </ChartActivityHistogramModal>
</template>
