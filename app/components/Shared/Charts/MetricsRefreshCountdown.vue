<script setup lang="ts">
import { Button, Flex, Modal, Tooltip, viewport } from '@dolanske/vui'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { METRICS_COLLECTION_INTERVAL, METRICS_REFRESH_BUFFER_MS, useDataMetrics } from '@/composables/useDataMetrics'

const { metrics, lastFetchedAt } = useDataMetrics()

const REFRESH_INTERVALS = [
  { label: 'Online Users', interval: '5 min' },
  { label: 'Played Games (Steam)', interval: '5 min' },
  { label: 'Game Servers', interval: '5 min' },
  { label: 'Voice Servers', interval: '15 min' },
  { label: 'IRC', interval: '5 min' },
]

// VUI's Tooltip turns itself off below its `m` breakpoint, so a tap anywhere
// on the row opens the same list in a modal instead. The icon's click bubbles
// up here too, which keeps it the keyboard route in.
const intervalsOpen = ref(false)

function openIntervals(): void {
  if (viewport.m)
    intervalsOpen.value = true
}

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
  <Flex
    v-if="dataFromLabel || nextUpdateLabel"
    y-start
    gap="xs"
    class="metrics-refresh-countdown"
    @click="openIntervals"
  >
    <Tooltip placement="top">
      <button
        type="button"
        class="metrics-refresh-countdown__info"
        aria-label="Refresh intervals"
      >
        <Icon name="ph:info" :size="12" />
      </button>
      <template #tooltip>
        <Flex column gap="xxs" class="metrics-refresh-countdown__tooltip">
          <p>Refresh intervals</p>
          <Flex v-for="row in REFRESH_INTERVALS" :key="row.label" x-between expand gap="s">
            <span>{{ row.label }}</span><span>{{ row.interval }}</span>
          </Flex>
        </Flex>
      </template>
    </Tooltip>
    <span v-if="dataFromLabel">Data from {{ dataFromLabel }}</span>
    <span v-if="dataFromLabel && nextUpdateLabel">-</span>
    <!-- The countdown sits in a slot sized by the widest value it can take, so
         "4m 9s" ticking over from "4m 10s" doesn't shift everything to its left. -->
    <span v-if="nextUpdateLabel">
      Next update in
      <span class="metrics-refresh-countdown__slot">
        <span>{{ nextUpdateLabel }}</span>
        <span aria-hidden="true" class="metrics-refresh-countdown__widest">0m 00s</span>
      </span>
    </span>

    <Modal :open="intervalsOpen" size="s" centered @close="intervalsOpen = false">
      <template #header>
        <h4 style="margin: 0">
          Refresh intervals
        </h4>
      </template>

      <Flex column gap="s" expand class="metrics-refresh-countdown__intervals">
        <Flex v-for="row in REFRESH_INTERVALS" :key="row.label" x-between expand gap="s">
          <span>{{ row.label }}</span><span>{{ row.interval }}</span>
        </Flex>
      </Flex>

      <template #footer>
        <Flex expand x-end>
          <Button expand variant="gray" @click="intervalsOpen = false">
            Close
          </Button>
        </Flex>
      </template>
    </Modal>
  </Flex>
</template>

<style scoped lang="scss">
.metrics-refresh-countdown {
  &__info {
    display: inline-flex;
    align-items: center;
    color: var(--color-text-lightest);
    padding: 0;
    border: 0;
    background: none;
  }

  span {
    font-size: var(--font-size-xxs);
    color: var(--color-text-lightest);
    font-variant-numeric: tabular-nums;
  }

  // Both spans share one grid cell: the hidden one holds the width, the live
  // one paints over it from the left.
  &__slot {
    display: inline-grid;

    > span {
      grid-area: 1 / 1;
    }
  }

  &__widest {
    visibility: hidden;
  }
}
</style>

<style lang="scss">
// Unscoped because the modal teleports out of the component
.metrics-refresh-countdown__intervals span {
  font-size: var(--font-size-s);
  color: var(--color-text-light);
}

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
