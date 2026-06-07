<script setup lang="ts">
import { ref } from 'vue'

const props = withDefaults(defineProps<{
  storageKey?: string
  initialSplit?: number
  minTop?: number
  minBottom?: number
}>(), {
  initialSplit: 55,
  minTop: 15,
  minBottom: 15,
})

const containerRef = ref<HTMLElement | null>(null)

function loadSplit(): number {
  if (props.storageKey && import.meta.client) {
    const stored = localStorage.getItem(props.storageKey)
    if (stored !== null) {
      const val = Number.parseFloat(stored)
      if (!Number.isNaN(val))
        return val
    }
  }
  return props.initialSplit
}

const split = ref(loadSplit())

function saveSplit(val: number) {
  if (props.storageKey && import.meta.client)
    localStorage.setItem(props.storageKey, String(val))
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val))
}

function onMousedown(e: MouseEvent) {
  e.preventDefault()
  const container = containerRef.value
  if (!container)
    return

  const startY = e.clientY
  const startSplit = split.value
  const containerHeight = container.getBoundingClientRect().height

  function onMousemove(ev: MouseEvent) {
    const deltaPct = ((ev.clientY - startY) / containerHeight) * 100
    split.value = clamp(startSplit + deltaPct, props.minTop, 100 - props.minBottom)
    saveSplit(split.value)
  }

  function onMouseup() {
    window.removeEventListener('mousemove', onMousemove)
    window.removeEventListener('mouseup', onMouseup)
  }

  window.addEventListener('mousemove', onMousemove)
  window.addEventListener('mouseup', onMouseup)
}
</script>

<template>
  <div ref="containerRef" class="sidebar-split">
    <div class="sidebar-split__top" :style="{ flex: `${split} 1 0px` }">
      <slot name="top" />
    </div>
    <button class="sidebar-split__handle" type="button" aria-label="Resize panels" @mousedown="onMousedown">
      <span class="sidebar-split__grip" />
    </button>
    <div class="sidebar-split__bottom" :style="{ flex: `${100 - split} 1 0px` }">
      <slot name="bottom" />
    </div>
  </div>
</template>

<style lang="scss" scoped>
.sidebar-split {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  width: 100%;

  &__top,
  &__bottom {
    min-height: 0;
    overflow: hidden;
    display: flex;
    flex-direction: column;

    // Slot content is rendered by the parent so it carries the parent's
    // scoped attribute. :deep() punches through so the rule applies.
    :deep(> *) {
      flex: 1;
      min-height: 0;
    }
  }

  &__handle {
    flex-shrink: 0;
    width: 100%;
    height: 5px;
    background: transparent;
    border: none;
    border-top: 1px solid var(--color-border);
    cursor: row-resize;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    transition: background-color var(--transition-fast);

    &:hover {
      background: var(--color-bg-medium);
    }
  }

  &__grip {
    width: 24px;
    height: 3px;
    border-radius: var(--border-radius-xs);
    background: var(--color-border-strong);
    pointer-events: none;
  }
}
</style>
