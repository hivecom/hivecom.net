<script setup lang="ts">
import type { SpaceSize } from '@dolanske/vui'
import { Flex, Tooltip } from '@dolanske/vui'

interface Props {
  data: number[]
  height?: number
  gap?: keyof typeof SpaceSize
}

const {
  height = 32,
  gap = 'xs',
  data,
} = defineProps<Props>()

const slots = defineSlots()
const highestValue = computed(() => Math.max(...data))
</script>

<template>
  <Flex class="vui-histogram" :gap>
    <Tooltip v-for="item in data" :key="item" :disabled="!slots.tooltip">
      <div class="vui-histogram-cell" :style="{ height: `${height}px` }">
        <div class="vui-histogram-datacell" :style="{ height: `${item / highestValue * 100}%` }" />
      </div>
      <template #tooltip>
        <slot name="tooltip" :value="item" :highest-value />
      </template>
    </Tooltip>
  </Flex>
</template>

<style scoped lang="scss">
.vui-histogram {
  .vui-histogram-cell {
    width: 8px;
    border-radius: var(--border-radius-pill);
    background-color: var(--color-bg-raised);
    overflow: hidden;
    position: relative;

    .vui-histogram-datacell {
      border-radius: var(--border-radius-pill);
      position: absolute;
      bottom: 0;
      width: 100%;
      background-color: var(--color-accent);
    }
  }
}
</style>
