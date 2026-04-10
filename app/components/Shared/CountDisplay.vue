<script setup lang="ts">
import { Tooltip } from '@dolanske/vui'
import { formatCount } from '@/lib/utils/formatting'

defineOptions({ inheritAttrs: false })

const props = defineProps<{
  value: number
  // Max characters before abbreviating, counting separators (commas).
  // 4 → abbreviate at 1,000  ("999" is 3 chars)
  // 5 → abbreviate at 10,000 (default, "9,999" is 5 chars)
  // 6 → abbreviate at 100,000 ("99,999" is 6 chars)
  maxChars?: number
}>()

const abbreviateAbove = computed(() => {
  switch (props.maxChars) {
    case 4: return 1_000
    case 6: return 100_000
    default: return 10_000
  }
})

const formatted = computed(() => formatCount(props.value, abbreviateAbove.value))
const needsTooltip = computed(() => props.value >= abbreviateAbove.value)

const attrs = useAttrs()
</script>

<template>
  <Tooltip v-if="needsTooltip" placement="top">
    <span v-bind="attrs">{{ formatted }}</span>
    <template #tooltip>
      <span class="text-xs">{{ props.value.toLocaleString() }}</span>
    </template>
  </Tooltip>
  <span v-else v-bind="attrs">{{ formatted }}</span>
</template>

<style scoped lang="scss">
:deep(.popout-anchor) {
  display: contents;
}
</style>
