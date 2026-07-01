<script setup lang="ts">
import type { MetricsPeriod } from '@/composables/useDataMetrics'
import type { Database } from '@/types/database.types'
import { Button, Flex, Tooltip } from '@dolanske/vui'
import { computed, defineAsyncComponent, onMounted, onUnmounted, ref } from 'vue'
import ChartBrush from '@/components/Shared/Charts/ChartBrush.vue'
import MetricsRefreshCountdown from '@/components/Shared/Charts/MetricsRefreshCountdown.vue'
import { METRICS_COLLECTION_INTERVAL, METRICS_REFRESH_BUFFER_MS, useDataMetrics } from '@/composables/useDataMetrics'
import { useBreakpoint } from '@/lib/mediaQuery'

const ChartDiscussions = defineAsyncComponent(() => import('@/components/Shared/Charts/ChartDiscussions.vue'))
const ChartGameActivity = defineAsyncComponent(() => import('@/components/Shared/Charts/ChartGameActivity.vue'))
const ChartGameserversPlayers = defineAsyncComponent(() => import('@/components/Shared/Charts/ChartGameserversPlayers.vue'))
const ChartOnlineUsers = defineAsyncComponent(() => import('@/components/Shared/Charts/ChartOnlineUsers.vue'))
const ChartTeamSpeakOnline = defineAsyncComponent(() => import('@/components/Shared/Charts/ChartTeamSpeakOnline.vue'))

definePageMeta({ layout: 'admin' })

const { fetchMetrics, lastFetchedAt } = useDataMetrics()
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

const isMobile = useBreakpoint('<xs')

const now = ref(Date.now())
let ticker: ReturnType<typeof setInterval> | null = null
onMounted(() => {
  ticker = setInterval(() => {
    now.value = Date.now()
  }, 1000)
})
onUnmounted(() => {
  if (ticker)
    clearInterval(ticker)
})

const mobileCountdownLabel = computed(() => {
  if (lastFetchedAt.value === null)
    return null
  const msLeft = Math.max(0, lastFetchedAt.value.getTime() + METRICS_COLLECTION_INTERVAL + METRICS_REFRESH_BUFFER_MS - now.value)
  const totalSec = Math.ceil(msLeft / 1000)
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return m > 0 ? `${m}m ${s}s` : `${s}s`
})
</script>

<template>
  <Flex column gap="s">
    <Flex x-between y-center expand>
      <Flex column :gap="0" expand>
        <h1>Metrics</h1>
        <Flex expand x-between y-center>
          <Flex y-center gap="s">
            <p class="text-color-light">
              Live and historical platform data
            </p>
          </Flex>
          <Flex v-if="isMobile" y-start :gap="4">
            <Icon name="mdi:refresh" :size="12" class="mobile-countdown" />
            <span v-if="mobileCountdownLabel" class="mobile-countdown">{{ mobileCountdownLabel }}</span>
          </Flex>
          <Flex v-else y-center gap="xs">
            <MetricsRefreshCountdown />
            <Tooltip>
              <Button variant="link" square @click="openRawSnapshot">
                <Icon name="mdi:database-eye-outline" />
              </Button>
              <template #tooltip>
                <p>View raw snapshot data</p>
              </template>
            </Tooltip>
          </Flex>
        </Flex>
      </Flex>
    </Flex>

    <ChartBrush class="brush-sticky" @change="onBrushChange" @update:utc="activeUtc = $event" />
    <ChartOnlineUsers :period="activePeriod" :window="activeWindow" :utc="activeUtc" fresh />
    <ChartTeamSpeakOnline :period="activePeriod" :window="activeWindow" :utc="activeUtc" />
    <ChartGameserversPlayers :period="activePeriod" :window="activeWindow" :utc="activeUtc" />
    <ChartGameActivity :period="activePeriod" :window="activeWindow" :utc="activeUtc" colorize />
    <ChartDiscussions :period="activePeriod" :window="activeWindow" :utc="activeUtc" />
  </Flex>
</template>

<style scoped lang="scss">
.brush-sticky {
  background: var(--color-bg);
  padding-top: var(--space-m);
  padding-bottom: var(--space-m);
  position: sticky;
  top: 0;
  z-index: var(--z-sticky);
}

.section-divider {
  border: none;
  border-top: 1px solid var(--color-border);
  margin: 0;
}

.mobile-countdown {
  font-size: var(--font-size-xxs);
  color: var(--color-text-lightest);
}
</style>
