<script setup lang="ts">
import type { SpaceSize } from '@dolanske/vui'
import { Flex, Tooltip } from '@dolanske/vui'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'

interface Props {
  /** Optional so a strip drawn only for its placeholder bars needs no series. */
  data?: number[]
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
  /** Draw drifting placeholder bars in place of the data, so the strip holds
   *  its space and shape while the history is still on its way. The same cells
   *  carry the real bars afterwards, so each one glides to its value. */
  loading?: boolean
  /** How many placeholder bars to draw. Should match the series the real data
   *  will have, so nothing shifts when it lands. */
  count?: number
}

const {
  height = 32,
  gap = 'xs',
  data = [],
  secondary,
  timestamps,
  clickable = false,
  expand = false,
  compact = false,
  loading = false,
  count = 14,
} = defineProps<Props>()

const emit = defineEmits<{ click: [index: number] }>()

const slots = defineSlots()

// How often the placeholder bars pick new heights. The bar transition runs the
// same length, so each bar is always mid-glide and the strip never sits still.
const DRIFT_MS = 700

function getDaysAgo(index: number): string | null {
  if (!timestamps)
    return null

  const iso = timestamps[index]
  if (!iso)
    return null

  // Buckets are cut at local midnight (see localDayOrigin in useDataMetrics),
  // so the label counts local calendar days.
  const entryDate = new Date(iso)
  const entryDay = Date.UTC(entryDate.getFullYear(), entryDate.getMonth(), entryDate.getDate())
  const now = new Date()
  const todayDay = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
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

// Placeholder heights step through a fixed set so the strip reads as a chart
// rather than a row of equal pills. The tick advances on a timer while loading
// and reshuffles every bar, so they drift instead of pulsing in place.
const tick = ref(0)
let drift: ReturnType<typeof setInterval> | null = null

function placeholderHeight(index: number): string {
  return `${30 + ((index * 37 + tick.value * 29) % 55)}%`
}

function startDrift(): void {
  if (drift !== null)
    return

  drift = setInterval(() => tick.value++, DRIFT_MS)
}

function stopDrift(): void {
  if (drift === null)
    return

  clearInterval(drift)
  drift = null
}

onMounted(() => {
  if (loading)
    startDrift()
})

watch(() => loading, on => on ? startDrift() : stopDrift())
onUnmounted(stopDrift)

// One entry per cell. While loading the cells come from `count` and carry
// placeholder heights; once the data is in they come from the series. Keyed by
// index, so a cell that exists in both states keeps its element and its bar
// transitions from the placeholder height to the real one.
const cells = computed(() => Array.from({ length: loading ? count : data.length }, (_, index) => {
  const value = data[index] ?? 0
  const secondaryValue = secondary?.[index] ?? 0

  return {
    index,
    value,
    secondaryValue,
    height: loading ? placeholderHeight(index) : `${value / highestValue.value * 100}%`,
    secondaryHeight: `${secondaryValue / highestSecondary.value * 100}%`,
  }
}))
</script>

<template>
  <button
    v-if="clickable"
    type="button"
    class="vui-histogram-btn"
    :class="{ 'vui-histogram-btn--expand': expand }"
    :disabled="loading"
    @click="emit('click', -1)"
  >
    <Flex
      class="vui-histogram vui-histogram--clickable" :class="{ 'vui-histogram--expand': expand,
                                                               'vui-histogram--fill': height === 'fill',
                                                               'vui-histogram--loading': loading }" :gap
    >
      <Tooltip v-for="cell in cells" :key="cell.index" :disabled="!slots.tooltip || loading">
        <div class="vui-histogram-cell" :class="{ 'vui-histogram-cell--compact': compact }" :style="cellStyle" @click.stop="emit('click', cell.index)">
          <div class="vui-histogram-datacell" :style="{ height: cell.height }" />
          <div v-if="secondary && !loading" class="vui-histogram-datacell vui-histogram-datacell--secondary" :style="{ height: cell.secondaryHeight }" />
        </div>
        <template #tooltip>
          <slot name="tooltip" :value="cell.value" :secondary-value="cell.secondaryValue" :index="cell.index" :highest-value :days-ago="getDaysAgo(cell.index)" />
        </template>
      </Tooltip>
    </Flex>
  </button>
  <Flex
    v-else class="vui-histogram" :class="{ 'vui-histogram--expand': expand,
                                           'vui-histogram--fill': height === 'fill',
                                           'vui-histogram--loading': loading }" :gap
  >
    <Tooltip v-for="cell in cells" :key="cell.index" :disabled="!slots.tooltip || loading">
      <div class="vui-histogram-cell" :class="{ 'vui-histogram-cell--compact': compact }" :style="cellStyle">
        <div class="vui-histogram-datacell" :style="{ height: cell.height }" />
        <div v-if="secondary && !loading" class="vui-histogram-datacell vui-histogram-datacell--secondary" :style="{ height: cell.secondaryHeight }" />
      </div>
      <template #tooltip>
        <slot name="tooltip" :value="cell.value" :secondary-value="cell.secondaryValue" :index="cell.index" :highest-value :days-ago="getDaysAgo(cell.index)" />
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

  &:disabled {
    cursor: default;
  }

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
    // accent, or want two series told apart. Height and colour both ease: the
    // drift while loading and the settle onto the real value are the same
    // transition, so a bar never jumps between the two.
    .vui-histogram-datacell {
      border-radius: var(--border-radius-pill);
      position: absolute;
      bottom: 0;
      width: 100%;
      background-color: var(--histogram-color, var(--color-accent));
      transition:
        height 700ms ease-in-out,
        width 700ms ease-in-out,
        background-color 700ms ease-in-out;
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

  // Placeholder bars wear the skeleton colour, and there's nothing to point at
  // yet, so they don't react to the cursor either. The selector spells out the
  // cell so it outranks the accent rule above, which has one class more than a
  // plain descendant of the loading strip would.
  &--loading {
    pointer-events: none;
  }

  &--loading .vui-histogram-cell .vui-histogram-datacell {
    background-color: var(--color-border);
  }
}

// Drifting bars are a lot of motion for someone who asked for less. They hold
// still and snap to their values instead.
@media (prefers-reduced-motion: reduce) {
  .vui-histogram .vui-histogram-cell .vui-histogram-datacell {
    transition: none;
  }
}
</style>
