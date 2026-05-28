<script setup lang="ts">
import type { CornerCardHandle } from '@/components/Shared/cornerGroup'
import { onUnmounted, provide, ref } from 'vue'
import { cornerGroupKey } from '@/components/Shared/cornerGroup'

// CornerGroup owns a single shared corner overlay that slides between registered
// CornerCard children as the cursor moves through them, instead of each card
// animating independently.

const groupRef = ref<HTMLElement | null>(null)
const overlayRef = ref<HTMLElement | null>(null)
let overlayVisible = false

const cards = ref<CornerCardHandle[]>([])

function register(card: CornerCardHandle) {
  cards.value.push(card)
}

function unregister(card: CornerCardHandle) {
  cards.value = cards.value.filter(c => c !== card)
}

function notifyEnter(card: CornerCardHandle) {
  const el = card.getEl()
  const group = groupRef.value
  const overlay = overlayRef.value
  if (!el || !group || !overlay)
    return

  const cardRect = el.getBoundingClientRect()
  const groupRect = group.getBoundingClientRect()
  const x = cardRect.left - groupRect.left
  const y = cardRect.top - groupRect.top

  if (!overlayVisible) {
    overlay.style.transition = 'none'
    overlay.style.width = `${cardRect.width}px`
    overlay.style.height = `${cardRect.height}px`
    overlay.style.transform = `translate(${x}px, ${y}px) scale(0.5)`
    overlay.style.opacity = '0'
    void overlay.offsetHeight
    overlay.style.transition = ''
    overlay.style.transform = `translate(${x}px, ${y}px) scale(1)`
    overlay.style.opacity = '1'
    overlayVisible = true
  }
  else {
    overlay.style.width = `${cardRect.width}px`
    overlay.style.height = `${cardRect.height}px`
    overlay.style.transform = `translate(${x}px, ${y}px) scale(1)`
  }
}

function onGroupLeave() {
  const overlay = overlayRef.value
  if (!overlay)
    return
  overlay.style.opacity = '0'
  overlayVisible = false
}

provide(cornerGroupKey, { register, unregister, notifyEnter })

onUnmounted(() => {
  cards.value = []
})
</script>

<template>
  <div ref="groupRef" class="corner-group" @mouseleave="onGroupLeave" @touchend="onGroupLeave">
    <div ref="overlayRef" class="corner-overlay">
      <span class="corner corner--tl" />
      <span class="corner corner--tr" />
      <span class="corner corner--bl" />
      <span class="corner corner--br" />
    </div>
    <slot />
  </div>
</template>

<style scoped lang="scss">
.corner-group {
  position: relative;
}

.corner-overlay {
  position: absolute;
  top: 0;
  left: 0;
  pointer-events: none;
  opacity: 0;
  transition:
    transform 0.18s ease,
    opacity 0.18s ease;
}

.corner {
  position: absolute;
  width: 10px;
  height: 10px;
  border-color: var(--color-accent);
  border-style: solid;

  &--tl {
    top: 5px;
    left: 5px;
    border-width: 2px 0 0 2px;
    border-radius: var(--border-radius-xs) 0 0 0;
  }

  &--tr {
    top: 5px;
    right: 5px;
    border-width: 2px 2px 0 0;
    border-radius: 0 var(--border-radius-xs) 0 0;
  }

  &--bl {
    bottom: 5px;
    left: 5px;
    border-width: 0 0 2px 2px;
    border-radius: 0 0 0 var(--border-radius-xs);
  }

  &--br {
    bottom: 5px;
    right: 5px;
    border-width: 0 2px 2px 0;
    border-radius: 0 0 var(--border-radius-xs) 0;
  }
}
</style>
