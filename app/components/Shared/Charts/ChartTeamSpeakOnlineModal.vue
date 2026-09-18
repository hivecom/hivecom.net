<script setup lang="ts">
import ChartActivityHistogramModal from '@/components/Shared/Charts/ChartActivityHistogramModal.vue'
import ChartTeamSpeakOnline from '@/components/Shared/Charts/ChartTeamSpeakOnline.vue'

// TeamSpeak headcount chart in a modal, across every voice server. `count` is
// the current total the header shows. `color` overrides the accent so the
// modal can match whatever chart opened it.
defineProps<{
  count: number | null
  color?: string
}>()

const open = defineModel<boolean>('open', { default: false })
</script>

<template>
  <ChartActivityHistogramModal
    v-model:open="open"
    title="TeamSpeak Activity"
    :count="count"
    :color="color"
    count-label="online"
    count-singular="online"
    :series="['teamspeakOnline']"
    :initial-period="count ? '24h' : '14d'"
  >
    <template #default="{ period, window, utc, color: chartColor }">
      <ChartTeamSpeakOnline :period :window :utc :color="chartColor" hide-title />
    </template>
  </ChartActivityHistogramModal>
</template>
