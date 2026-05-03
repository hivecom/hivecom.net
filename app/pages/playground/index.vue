<script setup lang="ts">
import type { Database } from '@/types/database.types'
import { Button, Flex } from '@dolanske/vui'
import ChartOnlineUsers from '@/components/Shared/Charts/ChartOnlineUsers.vue'

definePageMeta({ layout: false })

const { fetchMetrics, fetchMetricsHistory } = useDataMetrics()

onMounted(async () => {
  await Promise.all([fetchMetrics(), fetchMetricsHistory()])
})

const supabase = useSupabaseClient<Database>()
const { data: { publicUrl } } = supabase.storage.from('hivecom-content-static').getPublicUrl('metrics/latest.json')

function openRawData() {
  window.open(publicUrl, '_blank')
}
</script>

<template>
  <div class="page container-l">
    <Flex column expand gap="m">
      <Button variant="gray" @click="openRawData">
        View Raw Snapshot
      </Button>
      <ChartOnlineUsers />
    </Flex>
  </div>
</template>
