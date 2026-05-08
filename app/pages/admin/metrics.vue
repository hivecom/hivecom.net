<script setup lang="ts">
import type { MetricsPeriod } from '@/composables/useDataMetrics'
import type { Database } from '@/types/database.types'
import { Button, Flex } from '@dolanske/vui'
import { onMounted, ref } from 'vue'
import ChartBrush from '@/components/Shared/Charts/ChartBrush.vue'
import ChartDiscussions from '@/components/Shared/Charts/ChartDiscussions.vue'
import ChartGameserversPlayers from '@/components/Shared/Charts/ChartGameserversPlayers.vue'
import ChartMembersGameActivity from '@/components/Shared/Charts/ChartMembersGameActivity.vue'
import ChartOnlineUsers from '@/components/Shared/Charts/ChartOnlineUsers.vue'
import ChartTeamSpeakOnline from '@/components/Shared/Charts/ChartTeamSpeakOnline.vue'
import { useDataMetrics } from '@/composables/useDataMetrics'

const { fetchMetrics } = useDataMetrics()
onMounted(() => fetchMetrics())

const supabase = useSupabaseClient<Database>()
const { data: { publicUrl } } = supabase.storage.from('hivecom-content-static').getPublicUrl('metrics/latest.json')

function openRawSnapshot() {
  window.open(`${publicUrl}?t=${Date.now()}`, '_blank')
}

const activePeriod = ref<MetricsPeriod>('7d')
const activeWindow = ref<{ start: Date, end: Date } | null>(null)
const activeUtc = ref(false)

function onBrushChange(window: { start: Date, end: Date }) {
  activeWindow.value = window
}
</script>

<template>
  <Flex column gap="s">
    <Flex x-between y-center expand>
      <Flex column :gap="0" expand>
        <h1>Metrics</h1>
        <Flex expand x-between y-center>
          <p class="text-color-light">
            Live and historical platform data
          </p>
          <Button variant="link" square @click="openRawSnapshot">
            <Icon name="mdi:database-eye-outline" />
          </Button>
        </Flex>
      </Flex>
    </Flex>

    <ChartBrush class="brush-sticky" @change="onBrushChange" @update:utc="activeUtc = $event" />
    <ChartOnlineUsers :period="activePeriod" :window="activeWindow" :utc="activeUtc" fresh />
    <ChartTeamSpeakOnline :period="activePeriod" :window="activeWindow" :utc="activeUtc" />
    <ChartGameserversPlayers :period="activePeriod" :window="activeWindow" :utc="activeUtc" />
    <ChartMembersGameActivity :period="activePeriod" :window="activeWindow" :utc="activeUtc" colorize />
    <ChartDiscussions :period="activePeriod" :window="activeWindow" :utc="activeUtc" />
  </Flex>
</template>

<style scoped lang="scss">
@use '@/assets/breakpoints.scss' as *;

.brush-sticky {
  background: var(--color-bg);
  padding-top: var(--space-m);
  padding-bottom: var(--space-m);
  position: sticky;
  top: 0;
  z-index: var(--z-sticky);

  @media (max-width: $breakpoint-m) {
    // Offset below the admin mobile bar
    top: 56px;
  }
}

.section-divider {
  border: none;
  border-top: 1px solid var(--color-border);
  margin: 0;
}
</style>
