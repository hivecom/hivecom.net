<script setup lang="ts">
import type { Database } from '@/types/database.types'
import type { MetricsPeriod } from '@/composables/useDataMetrics'
import { Button, Flex, Select } from '@dolanske/vui'
import { ref } from 'vue'
import ChartOnlineUsers from '@/components/Shared/Charts/ChartOnlineUsers.vue'
import ChartTeamSpeakOnline from '@/components/Shared/Charts/ChartTeamSpeakOnline.vue'
import ChartGameserversPlayers from '@/components/Shared/Charts/ChartGameserversPlayers.vue'
import { METRICS_PERIOD_OPTIONS, useDataMetrics } from '@/composables/useDataMetrics'

definePageMeta({ layout: false })

const { fetchMetrics } = useDataMetrics()

interface PeriodOption { label: string, value: MetricsPeriod }
const selectedPeriod = ref<PeriodOption[]>([METRICS_PERIOD_OPTIONS[0] as PeriodOption])
const activePeriod = computed<MetricsPeriod>(() => selectedPeriod.value[0]?.value ?? '24h')

onMounted(() => fetchMetrics())

const supabase = useSupabaseClient<Database>()
const { data: { publicUrl } } = supabase.storage.from('hivecom-content-static').getPublicUrl('metrics/latest.json')

function openRawData() {
  window.open(`${publicUrl}?t=${Date.now()}`, '_blank')
}
</script>

<template>
  <div class="page container-l">
    <Flex column expand gap="m">
      <Flex x-between y-center>
        <Button variant="gray" @click="openRawData">
          View Raw Snapshot
        </Button>
        <Select
          v-model="selectedPeriod"
          :options="METRICS_PERIOD_OPTIONS"
          :single="true"
        />
      </Flex>
      <ChartOnlineUsers :period="activePeriod" />
      <ChartTeamSpeakOnline :period="activePeriod" />
      <ChartGameserversPlayers :period="activePeriod" />
    </Flex>
  </div>
</template>
