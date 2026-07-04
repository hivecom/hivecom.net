<script setup lang="ts">
import HomeDashboardSection from '@/components/Home/HomeDashboardSection.vue'
import { useDataGameservers } from '@/composables/useDataGameservers'
import { useDataMetrics } from '@/composables/useDataMetrics'
import { metricsPlayerCount } from '@/types/metrics'

// Raw data pass for the Gameservers card: every server with its live player
// count, busiest first. Graph material can come from
// useDataMetrics.fetchMetricsHistory later if the sketch's activity graph
// makes the cut.

const { gameservers } = useDataGameservers()
const { metrics, fetchMetrics } = useDataMetrics()

onMounted(() => {
  void fetchMetrics()
})

const serversWithPlayers = computed(() => {
  const byServer = metrics.value?.gameservers.byServer ?? {}
  return gameservers.value
    .map(gs => ({ gs, players: metricsPlayerCount(byServer[String(gs.id)]) }))
    .sort((a, b) => (b.players ?? -1) - (a.players ?? -1))
})

const totalPlayers = computed(() => metrics.value?.gameservers.players ?? null)
</script>

<template>
  <div>
    <HomeDashboardSection label="Players online across all servers">
      <p>{{ totalPlayers ?? 'no snapshot yet' }}</p>
    </HomeDashboardSection>

    <HomeDashboardSection label="Servers, busiest first">
      <ul v-if="serversWithPlayers.length">
        <li v-for="{ gs, players } in serversWithPlayers" :key="gs.id">
          <NuxtLink :to="`/servers/gameservers/${gs.id}`">
            {{ gs.name }}
          </NuxtLink>
          <span v-if="gs.region"> [{{ gs.region }}]</span>
          - {{ players ?? 'no data' }} playing
        </li>
      </ul>
      <p v-else>
        No gameservers.
      </p>
    </HomeDashboardSection>
  </div>
</template>
