<script setup lang="ts">
import type { SpaceSize } from '@dolanske/vui'
import { Flex, Tooltip } from '@dolanske/vui'
import { computed } from 'vue'

interface Props {
  data: number[]
  /** A second series drawn beside the first in every cell, scaled to its own
   *  max. For two measures that share a timeline but not a unit. */
  secondary?: number[]
  timestamps?: string[]
  /** Pixel height per cell, or `fill` to take whatever height the parent gives. */
  height?: number | 'fill'
  gap?: keyof typeof SpaceSize
  clickable?: boolean
  expand?: boolean
  compact?: boolean
}

const {
  height = 32,
  gap = 'xs',
  data,
  secondary,
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

const cellStyle = computed(() => height === 'fill' ? undefined : { height: `${height}px` })

const highestValue = computed(() => Math.max(...data) || 1)
const highestSecondary = computed(() => Math.max(...(secondary ?? [])) || 1)
</script>

<template>
  <button
    v-if="clickable"
    type="button"
    class="vui-histogram-btn"
    :class="{ 'vui-histogram-btn--expand': expand }"
    @click="emit('click', -1)"
  >
    <Flex
      class="vui-histogram vui-histogram--clickable" :class="{ 'vui-histogram--expand': expand,
                                                               'vui-histogram--fill': height === 'fill' }" :gap
    >
      <Tooltip v-for="(item, index) in data" :key="index" :disabled="!slots.tooltip">
        <div class="vui-histogram-cell" :class="{ 'vui-histogram-cell--compact': compact }" :style="cellStyle" @click.stop="emit('click', index)">
          <div class="vui-histogram-datacell" :style="{ height: `${item / highestValue * 100}%` }" />
          <div v-if="secondary" class="vui-histogram-datacell vui-histogram-datacell--secondary" :style="{ height: `${(secondary[index] ?? 0) / highestSecondary * 100}%` }" />
        </div>
        <template #tooltip>
          <slot name="tooltip" :value="item" :secondary-value="secondary?.[index] ?? 0" :index :highest-value :days-ago="getDaysAgo(index)" />
        </template>
      </Tooltip>
    </Flex>
  </button>
  <Flex
    v-else class="vui-histogram" :class="{ 'vui-histogram--expand': expand,
                                           'vui-histogram--fill': height === 'fill' }" :gap
  >
    <Tooltip v-for="(item, index) in data" :key="index" :disabled="!slots.tooltip">
      <div class="vui-histogram-cell" :class="{ 'vui-histogram-cell--compact': compact }" :style="cellStyle">
        <div class="vui-histogram-datacell" :style="{ height: `${item / highestValue * 100}%` }" />
        <div v-if="secondary" class="vui-histogram-datacell vui-histogram-datacell--secondary" :style="{ height: `${(secondary[index] ?? 0) / highestSecondary * 100}%` }" />
      </div>
      <template #tooltip>
        <slot name="tooltip" :value="item" :secondary-value="secondary?.[index] ?? 0" :index :highest-value :days-ago="getDaysAgo(index)" />
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
  &--fill {
    height: 100%;
    align-items: stretch;

    .vui-histogram-cell {
      height: 100%;
    }
  }

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

    // Colours are overridable per chart, for the surfaces that don't want the
    // accent, or want two series told apart.
    .vui-histogram-datacell {
      border-radius: var(--border-radius-pill);
      position: absolute;
      bottom: 0;
      width: 100%;
      background-color: var(--histogram-color, var(--color-accent));
    }

    // Two series split the cell down the middle, each on its own scale. The
    // cell stops clipping here: its own rounded corners would cut the tops off
    // two bars that are each narrower than the pill they sit in.
    &:has(.vui-histogram-datacell--secondary) {
      overflow: visible;

      .vui-histogram-datacell {
        width: calc(50% - 1px);
      }

      .vui-histogram-datacell--secondary {
        left: auto;
        right: 0;
        background-color: var(--histogram-secondary-color, var(--color-text-lighter));
      }
    }
  }

  // The bar under the cursor keeps its colour and gets a lit track, the rest
  // step back a little, so the tooltip's numbers have a bar to belong to. The
  // step is kept mild: a surface that dims itself at rest would otherwise
  // barely change on hover, since most of it would land back where it started.
  .vui-histogram-cell {
    transition:
      opacity var(--transition-duration) ease,
      background-color var(--transition-duration) ease;
  }

  &:hover .vui-histogram-cell:not(:hover) {
    opacity: 0.7;
  }

  .vui-histogram-cell:hover {
    background-color: var(--color-border);
  }
}
</style>
