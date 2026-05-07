<script setup lang="ts">
import { Modal } from '@dolanske/vui'
import { ref, watch } from 'vue'
import ChartActivityHistogramContent from '@/components/Shared/Charts/ChartActivityHistogramContent.vue'

type SeriesKey = 'membersOnline' | 'teamspeakOnline' | 'gameserversPlayers'

const props = defineProps<{
  title?: string
  series?: SeriesKey[]
  color?: string
  initialWindow?: { start: Date, end: Date } | null
}>()

const open = defineModel<boolean>('open', { default: false })

// Re-key ChartActivityHistogramContent each time the modal opens so it re-mounts with the new initialWindow.
// Reset state on close so the chart doesn't render stale data on reopen.
const brushKey = ref(0)
watch(open, (val) => {
  if (val)
    brushKey.value++
})
</script>

<template>
  <Modal
    :open="open"
    size="l"
    centered
    :card="{ separators: true }"
    @close="open = false"
  >
    <template #header>
      <h4>{{ title ?? 'Activity' }}</h4>
    </template>

    <ChartActivityHistogramContent
      :brush-key="brushKey"
      :series="props.series"
      :color="props.color"
      :initial-window="props.initialWindow"
    >
      <template v-if="$slots['above-chart']" #above-chart>
        <slot name="above-chart" />
      </template>
      <template #default="slotProps">
        <slot v-bind="slotProps" />
      </template>
    </ChartActivityHistogramContent>
  </Modal>
</template>
