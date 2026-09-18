<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import ChartIrcModal from '@/components/Shared/Charts/ChartIrcModal.vue'
import OnlineBadge from '@/components/Shared/OnlineBadge.vue'
import { useDataMetrics } from '@/composables/useDataMetrics'

// Users connected to the IRC network as of the latest metrics snapshot, which
// is the same figure the IRC chart plots. Clicking opens that chart.
const { metrics, fetchMetrics } = useDataMetrics()
const count = computed(() => metrics.value?.irc.online ?? null)

const activityModalOpen = ref(false)

// The badge is plain CSS, so it takes the variable straight through. Resolving
// it here instead would read '' on the server and the real color on the
// client, which is a hydration mismatch, and it would freeze on whatever the
// theme was at first paint.
const badgeColor = 'var(--color-text-purple)'

onMounted(() => {
  if (metrics.value === null)
    fetchMetrics()
})
</script>

<template>
  <!-- Client only because the count comes from the metrics cache in the
       browser, which the server has no view of. Server-render it and a visitor
       with a warm cache hydrates 6 over a server-rendered 0. The fallback is
       what the server used to emit anyway, so a cold load looks unchanged. -->
  <ClientOnly>
    <OnlineBadge
      :count="count"
      label=""
      size="s"
      :color="badgeColor"
      clickable
      @click="activityModalOpen = true"
    />

    <template #fallback>
      <OnlineBadge :count="null" label="" size="s" />
    </template>
  </ClientOnly>

  <ChartIrcModal v-model:open="activityModalOpen" :count="count" />
</template>
