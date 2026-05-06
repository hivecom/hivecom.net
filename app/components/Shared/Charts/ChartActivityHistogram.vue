<script setup lang="ts">
import type { SpaceSize } from '@dolanske/vui'
import { Flex, Tooltip } from '@dolanske/vui'
import { computed } from 'vue'

interface Props {
  data: number[]
  height?: number
  gap?: keyof typeof SpaceSize
  clickable?: boolean
  expand?: boolean
}

const {
  height = 32,
  gap = 'xs',
  data,
  clickable = false,
  expand = false,
} = defineProps<Props>()

const emit = defineEmits<{ click: [index: number] }>()

const slots = defineSlots()
const highestValue = computed(() => Math.max(...data))
</script>

<template>
  <button
    v-if="clickable"
    type="button"
    class="vui-histogram-btn"
    :class="{ 'vui-histogram-btn--expand': expand }"
    @click="emit('click', -1)"
  >
    <Flex class="vui-histogram vui-histogram--clickable" :class="{ 'vui-histogram--expand': expand }" :gap>
      <Tooltip v-for="(item, index) in data" :key="index" :disabled="!slots.tooltip">
        <div class="vui-histogram-cell" :style="{ height: `${height}px` }" @click.stop="emit('click', index)">
          <div class="vui-histogram-datacell" :style="{ height: `${item / highestValue * 100}%` }" />
        </div>
        <template #tooltip>
          <slot name="tooltip" :value="item" :index :highest-value />
        </template>
      </Tooltip>
    </Flex>
  </button>
  <Flex v-else class="vui-histogram" :class="{ 'vui-histogram--expand': expand }" :gap>
    <Tooltip v-for="(item, index) in data" :key="index" :disabled="!slots.tooltip">
      <div class="vui-histogram-cell" :style="{ height: `${height}px` }">
        <div class="vui-histogram-datacell" :style="{ height: `${item / highestValue * 100}%` }" />
      </div>
      <template #tooltip>
        <slot name="tooltip" :value="item" :index :highest-value />
      </template>
    </Tooltip>
  </Flex>
</template>

<style scoped lang="scss">
.vui-histogram-btn {
  border: none;
  background: none;
  padding: 0;
  cursor: pointer;

  &--expand {
    width: 100%;
  }
}

.vui-histogram {
  &--expand {
    width: 100%;
    justify-content: space-between;

    .vui-histogram-cell {
      flex: 1;
    }
  }

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

  &--clickable:hover {
    .vui-histogram-datacell {
      opacity: 0.8;
    }
  }
}
</style>
