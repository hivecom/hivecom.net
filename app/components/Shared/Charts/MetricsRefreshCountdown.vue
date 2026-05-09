<script setup lang="ts">
import { Flex, Tooltip } from '@dolanske/vui'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { METRICS_COLLECTION_INTERVAL, METRICS_REFRESH_BUFFER_MS, useDataMetrics } from '@/composables/useDataMetrics'

const { metrics, lastFetchedAt } = useDataMetrics()

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

const dataFromLabel = computed(() => {
  const source = metrics.value?.collectedAt ?? lastFetchedAt.value?.toISOString() ?? null
  if (!source)
    return null
  const d = new Date(source)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
})

const nextUpdateLabel = computed(() => {
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
  <Flex v-if="dataFromLabel || nextUpdateLabel" y-start gap="xs" class="metrics-refresh-countdown">
    <Tooltip placement="top">
      <Icon name="ph:info" :size="12" class="metrics-refresh-countdown__info" />
      <template #tooltip>
        <Flex column gap="xxs" class="metrics-refresh-countdown__tooltip">
          <p>Refresh intervals</p>
          <Flex x-between expand gap="s">
            <span>Online Users</span><span>5 min</span>
          </Flex>
          <Flex x-between expand gap="s">
            <span>Game Servers</span><span>5 min</span>
          </Flex>
          <Flex x-between expand gap="s">
            <span>Voice Servers</span><span>15 min</span>
          </Flex>
          <Flex x-between expand gap="s">
            <span>Played Games</span><span>15 min</span>
          </Flex>
        </Flex>
      </template>
    </Tooltip>
    <span v-if="dataFromLabel">Data from {{ dataFromLabel }}</span>
    <span v-if="dataFromLabel && nextUpdateLabel">-</span>
    <span v-if="nextUpdateLabel">Next update in {{ nextUpdateLabel }}</span>
  </Flex>
</template>

<style scoped lang="scss">
.metrics-refresh-countdown {
  &__info {
    color: var(--color-text-lightest);
  }

  span {
    font-size: var(--font-size-xxs);
    color: var(--color-text-lightest);
  }
}
</style>

<style lang="scss">
.metrics-refresh-countdown__tooltip {
  min-width: 160px;

  p {
    font-size: var(--font-size-xxs);
    color: var(--color-text-lighter);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-bottom: var(--space-xxs);
  }

  span {
    font-size: var(--font-size-xxs);
    color: var(--color-text-light);
  }
}
</style>
