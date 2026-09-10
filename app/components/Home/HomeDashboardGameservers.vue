<script setup lang="ts">
import { Flex } from '@dolanske/vui'
import HomeDashboardSection from '@/components/Home/HomeDashboardSection.vue'
import { useDataGameservers } from '@/composables/useDataGameservers'
import { useDataMetrics } from '@/composables/useDataMetrics'
import { isNil } from '@/lib/utils/common'
import { metricsPlayerCount } from '@/types/metrics'
import RegionIndicator from '../Shared/RegionIndicator.vue'

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
    .filter(item => !isNil(item.players))
    .slice(0, 12)
})

const totalPlayers = computed(() => metrics.value?.gameservers.players ?? null)
</script>

<template>
  <div>
    <HomeDashboardSection label="Players online across all servers">
      <p>{{ totalPlayers ?? 'no snapshot yet' }}</p>
    </HomeDashboardSection>

    <HomeDashboardSection v-if="serversWithPlayers.length" label="Servers, busiest first">
      <!-- <div class="home-item-list"> -->
      <Flex column gap="xs">
        <NuxtLink v-for="{ gs, players } in serversWithPlayers" :key="gs.id" :to="`/servers/gameservers/${gs.id}`" class="home-item inline">
          <strong>
            <RegionIndicator v-if="gs.region" class="mr-xxs" :region="gs.region" size="m" />
            {{ gs.name }}
          </strong>
          <span>{{ players }} player{{ players! === 1 ? '' : 's' }}</span>
        </NuxtLink>
      </Flex>
      <!-- </div> -->
    </HomeDashboardSection>
  </div>
</template>
