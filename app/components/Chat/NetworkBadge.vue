<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import ChartActivityHistogramModal from '@/components/Shared/Charts/ChartActivityHistogramModal.vue'
import ChartIrc from '@/components/Shared/Charts/ChartIrc.vue'
import OnlineBadge from '@/components/Shared/OnlineBadge.vue'
import { useDataMetrics } from '@/composables/useDataMetrics'

// Users connected to the IRC network as of the latest metrics snapshot, which
// is the same figure the IRC chart plots. Clicking opens that chart.
const { metrics, fetchMetrics } = useDataMetrics()
const count = computed(() => metrics.value?.irc.online ?? null)
const activityModalOpen = ref(false)

onMounted(() => {
  if (metrics.value === null)
    fetchMetrics()
})
</script>

<template>
  <OnlineBadge
    :count="count"
    label="Network Users"
    singular="Network User"
    size="s"
    clickable
    @click="activityModalOpen = true"
  />

  <ChartActivityHistogramModal
    v-model:open="activityModalOpen"
    title="IRC Activity"
    :count="count"
    count-label="online"
    count-singular="online"
    :series="['ircOnline']"
    :initial-period="count ? '24h' : '14d'"
  >
    <template #default="{ period, window, utc }">
      <ChartIrc :period :window :utc hide-title />
    </template>
  </ChartActivityHistogramModal>
</template>
