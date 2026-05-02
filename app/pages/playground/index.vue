<script setup lang="ts">
import { Card, Flex } from '@dolanske/vui'

definePageMeta({ layout: false })

const { metrics, fetchMetrics } = useDataMetrics()

onMounted(fetchMetrics)
</script>

<template>
  <div class="page container-l">
    <Flex column expand gap="m" style="padding: var(--space-l); max-width: 800px; margin: 0 auto;">
      <Card v-if="metrics">
        <pre style="font-size: var(--font-size-xs); overflow-x: auto;">{{ JSON.stringify(metrics, null, 2) }}</pre>
      </Card>
      <p v-else class="text-color-light">
        No snapshot available.
      </p>
    </Flex>
  </div>
</template>
