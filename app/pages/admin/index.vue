<script setup lang="ts">
import type { MetricsPeriod } from '@/composables/useDataMetrics'
import type { Database } from '@/types/database.types'
import { Button, Flex, Grid } from '@dolanske/vui'
import { computed, onMounted, ref } from 'vue'
import Alerts from '@/components/Admin/Alerts.vue'
import IncomeChart from '@/components/Admin/Funding/IncomeChart.vue'
import UserChart from '@/components/Admin/Funding/UserChart.vue'
import KPIOverview from '@/components/Admin/KPIOverview.vue'
import ChartBrush from '@/components/Shared/Charts/ChartBrush.vue'
import ChartDiscussions from '@/components/Shared/Charts/ChartDiscussions.vue'
import ChartGameserversPlayers from '@/components/Shared/Charts/ChartGameserversPlayers.vue'
import ChartOnlineUsers from '@/components/Shared/Charts/ChartOnlineUsers.vue'
import ChartTeamSpeakOnline from '@/components/Shared/Charts/ChartTeamSpeakOnline.vue'
import { useDataMetrics } from '@/composables/useDataMetrics'
import { useBreakpoint } from '@/lib/mediaQuery'

const isBelowM = useBreakpoint('<m')
const chartColumns = computed(() => (isBelowM.value ? 1 : 2))

const { fetchMetrics } = useDataMetrics()
onMounted(() => fetchMetrics())

const supabase = useSupabaseClient<Database>()
const { data: { publicUrl } } = supabase.storage.from('hivecom-content-static').getPublicUrl('metrics/latest.json')

function openRawSnapshot() {
  window.open(`${publicUrl}?t=${Date.now()}`, '_blank')
}

const activePeriod = ref<MetricsPeriod>('24h')
const activeWindow = ref<{ start: Date, end: Date } | null>(null)
const activeUtc = ref(false)

function onBrushChange(window: { start: Date, end: Date }) {
  activeWindow.value = window
}
</script>

<template>
  <Flex column gap="xl">
    <Flex x-between y-center expand>
      <Flex column :gap="0" expand>
        <h1>Dashboard</h1>
        <Flex expand x-between y-center>
          <p class="text-color-light">
            Welcome to the admin panel have a look around, any KPI you can think of can be found
          </p>
          <Button variant="link" square @click="openRawSnapshot">
            <Icon name="mdi:database-eye-outline" />
          </Button>
        </Flex>
      </Flex>
    </Flex>

    <!-- KPI Overview -->
    <KPIOverview />

    <!-- System Callouts -->
    <Alerts />

    <!-- Metrics Charts -->
    <ChartBrush @change="onBrushChange" @update:utc="activeUtc = $event" />
    <ChartOnlineUsers :period="activePeriod" :window="activeWindow" :utc="activeUtc" fresh />
    <ChartTeamSpeakOnline :period="activePeriod" :window="activeWindow" :utc="activeUtc" />
    <ChartGameserversPlayers :period="activePeriod" :window="activeWindow" :utc="activeUtc" />
    <ChartDiscussions :period="activePeriod" :window="activeWindow" :utc="activeUtc" />

    <!-- All Time Charts -->
    <hr class="section-divider">
    <Flex column :gap="0">
      <h3>All Time</h3>
      <p class="text-color-light">
        Historical data - not affected by the scrubber above
      </p>
    </Flex>
    <Grid :columns="chartColumns" expand y-stretch>
      <IncomeChart />
      <UserChart />
    </Grid>
  </Flex>
</template>

<style scoped lang="scss">
.section-divider {
  border: none;
  border-top: 1px solid var(--color-border);
  margin: 0;
}
</style>
