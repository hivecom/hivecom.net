<script setup lang="ts">
import type { SpaceSize } from '@dolanske/vui'
import { Flex, Tooltip } from '@dolanske/vui'
import { computed } from 'vue'

interface Props {
  data: number[]
  timestamps?: string[]
  height?: number
  gap?: keyof typeof SpaceSize
  clickable?: boolean
  expand?: boolean
  compact?: boolean
}

const {
  height = 32,
  gap = 'xs',
  data,
  timestamps,
  clickable = false,
  expand = false,
  compact = false,
} = defineProps<Props>()

const emit = defineEmits<{ click: [index: number] }>()

const slots = defineSlots()

function getDaysAgo(index: number): string | null {
  if (!timestamps)
    return null
  const iso = timestamps[index]
  if (!iso)
    return null
  const entryDate = new Date(iso)
  const entryDay = Date.UTC(entryDate.getUTCFullYear(), entryDate.getUTCMonth(), entryDate.getUTCDate())
  const now = new Date()
  const todayDay = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  const diffDays = Math.round((todayDay - entryDay) / (1000 * 60 * 60 * 24))
  if (diffDays === 0)
    return 'today'
  if (diffDays === 1)
    return 'yesterday'
  return `${diffDays} days ago`
}

const highestValue = computed(() => Math.max(...data) || 1)
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
        <div class="vui-histogram-cell" :class="{ 'vui-histogram-cell--compact': compact }" :style="{ height: `${height}px` }" @click.stop="emit('click', index)">
          <div class="vui-histogram-datacell" :style="{ height: `${item / highestValue * 100}%` }" />
        </div>
        <template #tooltip>
          <slot name="tooltip" :value="item" :index :highest-value :days-ago="getDaysAgo(index)" />
        </template>
      </Tooltip>
    </Flex>
  </button>
  <Flex v-else class="vui-histogram" :class="{ 'vui-histogram--expand': expand }" :gap>
    <Tooltip v-for="(item, index) in data" :key="index" :disabled="!slots.tooltip">
      <div class="vui-histogram-cell" :class="{ 'vui-histogram-cell--compact': compact }" :style="{ height: `${height}px` }">
        <div class="vui-histogram-datacell" :style="{ height: `${item / highestValue * 100}%` }" />
      </div>
      <template #tooltip>
        <slot name="tooltip" :value="item" :index :highest-value :days-ago="getDaysAgo(index)" />
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

    &--compact {
      width: 4px;
    }
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
