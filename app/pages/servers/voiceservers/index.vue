<script setup lang="ts">
import { Flex } from '@dolanske/vui'
import ChartActivityHistogramModal from '@/components/Shared/Charts/ChartActivityHistogramModal.vue'
import ChartTeamSpeakOnline from '@/components/Shared/Charts/ChartTeamSpeakOnline.vue'
import OnlineBadge from '@/components/Shared/OnlineBadge.vue'
import TeamSpeakViewer from '@/components/Shared/TeamSpeakViewer.vue'

const totalOnline = ref<number | null>(null)

function onTotalOnlineUpdate(count: number | null) {
  totalOnline.value = count
}
const activityModalOpen = ref(false)

useSeoMeta({
  title: 'Voice Servers',
  description: 'View live voice channels and connect with the community on TeamSpeak.',
  ogTitle: 'Voice Servers',
  ogDescription: 'View live voice channels and connect with the community on TeamSpeak.',
})

defineOgImage('Default', {
  title: 'Voice Servers',
  description: 'View live voice channels and connect with the community on TeamSpeak.',
})
</script>

<template>
  <div class="page container-m">
    <section class="page-title">
      <Flex y-center x-between gap="s" expand>
        <h1>Voice Servers</h1>
        <OnlineBadge :count="totalOnline" label="Connections" singular="Connection" clickable @click="activityModalOpen = true" />
      </Flex>
      <p>View live channels and connect with the community on TeamSpeak.</p>
    </section>

    <TeamSpeakViewer @update:total-online="onTotalOnlineUpdate" />

    <ChartActivityHistogramModal
      v-model:open="activityModalOpen"
      title="TeamSpeak Activity"
      :count="totalOnline"
      count-label="connections"
      count-singular="connection"
      :series="['teamspeakOnline']"
      :initial-period="totalOnline ? '24h' : '14d'"
    >
      <template #default="{ period, window, utc, color }">
        <ChartTeamSpeakOnline :period :window :utc :color hide-title />
      </template>
    </ChartActivityHistogramModal>
  </div>
</template>
