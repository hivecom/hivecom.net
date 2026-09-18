<script setup lang="ts">
import { Flex, Tooltip } from '@dolanske/vui'
import ChartTeamSpeakOnlineModal from '@/components/Shared/Charts/ChartTeamSpeakOnlineModal.vue'
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
        <Tooltip placement="bottom">
          <Flex>
            <OnlineBadge :count="totalOnline" label="Online" singular="online" clickable @click="activityModalOpen = true" />
          </Flex>
          <template #tooltip>
            <p class="text-s">
              Excludes music bots
            </p>
          </template>
        </Tooltip>
      </Flex>
      <p>View live channels and connect with the community on TeamSpeak.</p>
    </section>

    <TeamSpeakViewer @update:total-online="onTotalOnlineUpdate" />

    <ChartTeamSpeakOnlineModal v-model:open="activityModalOpen" :count="totalOnline" />
  </div>
</template>
