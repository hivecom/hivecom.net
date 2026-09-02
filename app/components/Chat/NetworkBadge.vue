<script setup lang="ts">
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
const activityModalOpen = ref(false)
// Resolved at runtime because the brush paints it onto a canvas, where a
// var() reference wouldn't work.
const accentColor = computed(() => getCSSVariable('--color-text-purple'))

onMounted(() => {
  if (metrics.value === null)
    fetchMetrics()
})
</script>

<template>
  <OnlineBadge
    :count="count"
    label=""
    size="s"
    :color="accentColor"
    clickable
    @click="activityModalOpen = true"
  />

  <ChartActivityHistogramModal
    v-model:open="activityModalOpen"
    title="IRC Activity"
    :color="accentColor"
    :count="count"
    count-label="online"
    count-singular="online"
    :count-suffix="messagesLabel"
    :count-info="IRC_MESSAGES_INFO"
    :series="['ircMessages']"
    :initial-period="count ? '24h' : '14d'"
  >
    <template #default="{ period, window, utc }">
      <ChartIrc :period :window :utc hide-title />
    </template>
  </ChartActivityHistogramModal>
</template>
