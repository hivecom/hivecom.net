<script setup lang="ts">
import type { MetricsPeriod } from '@/composables/useDataMetrics'
import { Button, Flex } from '@dolanske/vui'
import { METRICS_PERIOD_OPTIONS } from '@/composables/useDataMetrics'

const props = defineProps<{ modelValue: MetricsPeriod }>()
const emit = defineEmits<{ 'update:modelValue': [value: MetricsPeriod] }>()
</script>

<template>
  <Flex gap="xs">
    <Button
      v-for="option in METRICS_PERIOD_OPTIONS"
      :key="option.value"
      :variant="props.modelValue === option.value ? 'fill' : 'gray'"
      @click="emit('update:modelValue', option.value)"
    >
      {{ option.label }}
    </Button>
  </Flex>
</template>
