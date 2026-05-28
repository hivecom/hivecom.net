<script setup lang="ts">
import type { CornerCardHandle } from '@/components/Shared/cornerGroup'
import { inject, onMounted, onUnmounted, ref } from 'vue'
import { cornerGroupKey } from '@/components/Shared/cornerGroup'

// CornerCard wraps any content and either delegates to a parent CornerGroup for
// the shared sliding overlay, or manages its own overlay in standalone mode.

const group = inject(cornerGroupKey, null)

const cardRef = ref<HTMLElement | null>(null)
const overlayRef = ref<HTMLElement | null>(null)

const handle: CornerCardHandle = {
  getEl: () => cardRef.value,
}

if (group) {
  onMounted(() => group.register(handle))
  onUnmounted(() => group.unregister(handle))
}

function onMouseEnter() {
  if (group) {
    group.notifyEnter(handle)
    return
  }

  // Standalone: zoom in own overlay
  const overlay = overlayRef.value
  if (!overlay)
    return
  overlay.style.transition = 'none'
  overlay.style.transform = 'scale(0.5)'
  overlay.style.opacity = '0'
  void overlay.offsetHeight
  overlay.style.transition = ''
  overlay.style.transform = 'scale(1)'
  overlay.style.opacity = '1'
}

function onMouseLeave() {
  if (group)
    return
  const overlay = overlayRef.value
  if (!overlay)
    return
  overlay.style.opacity = '0'
}

function onTouchStart() {
  if (group) {
    group.notifyEnter(handle)
    return
  }
  const overlay = overlayRef.value
  if (!overlay)
    return
  overlay.style.transition = 'none'
  overlay.style.transform = 'scale(0.5)'
  overlay.style.opacity = '0'
  void overlay.offsetHeight
  overlay.style.transition = ''
  overlay.style.transform = 'scale(1)'
  overlay.style.opacity = '1'
}

function onTouchEnd() {
  if (group)
    return
  const overlay = overlayRef.value
  if (!overlay)
    return
  overlay.style.opacity = '0'
}
</script>

<template>
  <div ref="cardRef" class="corner-card" @mouseenter="onMouseEnter" @mouseleave="onMouseLeave" @touchstart.passive="onTouchStart" @touchend="onTouchEnd">
    <div v-if="!group" ref="overlayRef" class="corner-overlay">
      <span class="corner corner--tl" />
      <span class="corner corner--tr" />
      <span class="corner corner--bl" />
      <span class="corner corner--br" />
    </div>
    <slot />
  </div>
</template>

<style scoped lang="scss">
.corner-card {
  position: relative;
}

.corner-overlay {
  position: absolute;
  inset: 0;
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
