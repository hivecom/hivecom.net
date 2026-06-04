<script setup lang="ts">
import type { GlowCardHandle } from '@/components/Shared/glowGroup'
import { onUnmounted, provide, ref } from 'vue'
import { glowGroupKey } from '@/components/Shared/glowGroup'

// GlowGroup tracks mousemove on a shared container and broadcasts per-card-relative
// coordinates to all child GlowCard instances via provide/inject. This produces the
// Vercel "cards light up as you sweep across them" effect.
//
// Performance: pointer events fire far faster than the display refresh rate, so we
// coalesce them into a single update per animation frame. Within that frame we read
// every card's rect first and only then write positions, which avoids the
// read/write/read layout thrashing that made Chrome stutter on pages with many cards.
// Rects are cached and only re-measured when the cache is marked dirty (scroll/resize
// or card registration changes) so a sweep doesn't re-measure every card every frame.

const cards = ref<GlowCardHandle[]>([])

let cachedRects: Array<{ card: GlowCardHandle, left: number, top: number }> = []
let rectsDirty = true
let frame = 0
let pointerX = 0
let pointerY = 0

function markDirty() {
  rectsDirty = true
}

function register(card: GlowCardHandle) {
  cards.value.push(card)
  markDirty()
}

function unregister(card: GlowCardHandle) {
  cards.value = cards.value.filter(c => c !== card)
  markDirty()
}

provide(glowGroupKey, { register, unregister })

// Read phase: measure every card's rect in one batch (only when dirty).
function recomputeRects() {
  cachedRects = []
  for (const card of cards.value) {
    const el = card.getEl()
    if (!el)
      continue
    const rect = el.getBoundingClientRect()
    cachedRects.push({ card, left: rect.left, top: rect.top })
  }
  rectsDirty = false
}

// Write phase: push the latest pointer position to every card.
function renderFrame() {
  frame = 0
  if (rectsDirty)
    recomputeRects()
  for (const { card, left, top } of cachedRects) {
    card.setPosition(pointerX - left, pointerY - top)
    card.activate()
  }
}

function schedule() {
  if (frame)
    return
  frame = requestAnimationFrame(renderFrame)
}

function deactivateAll() {
  if (frame) {
    cancelAnimationFrame(frame)
    frame = 0
  }
  for (const card of cards.value) {
    card.deactivate()
  }
}

function handleMouseMove(e: MouseEvent) {
  pointerX = e.clientX
  pointerY = e.clientY
  schedule()
}

function handleMouseLeave() {
  deactivateAll()
}

function handleTouchMove(e: TouchEvent) {
  const touch = e.touches[0]
  if (!touch)
    return
  pointerX = touch.clientX
  pointerY = touch.clientY
  schedule()
}

function handleTouchEnd() {
  deactivateAll()
}

// Scroll/resize move the cards relative to the viewport, so the cached rects
// become stale - mark them for re-measurement on the next frame.
if (import.meta.client) {
  window.addEventListener('scroll', markDirty, { passive: true, capture: true })
  window.addEventListener('resize', markDirty, { passive: true })
  onUnmounted(() => {
    window.removeEventListener('scroll', markDirty, { capture: true })
    window.removeEventListener('resize', markDirty)
    if (frame)
      cancelAnimationFrame(frame)
  })
}
</script>

<template>
  <div
    class="glow-group"
    @mousemove="handleMouseMove"
    @mouseleave="handleMouseLeave"
    @touchmove.passive="handleTouchMove"
    @touchend="handleTouchEnd"
  >
    <slot />
  </div>
</template>

<style lang="scss" scoped>
.glow-group {
  display: contents;
}
</style>
