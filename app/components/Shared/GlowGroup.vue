<script setup lang="ts">
import type { GlowCardHandle } from '@/components/Shared/glowGroup'
import { provide, ref } from 'vue'
import { glowGroupKey } from '@/components/Shared/glowGroup'

// GlowGroup tracks mousemove on a shared container and broadcasts per-card-relative
// coordinates to all child GlowCard instances via provide/inject. This produces the
// Vercel "cards light up as you sweep across them" effect.

const cards = ref<GlowCardHandle[]>([])

function register(card: GlowCardHandle) {
  cards.value.push(card)
}

function unregister(card: GlowCardHandle) {
  cards.value = cards.value.filter(c => c !== card)
}

provide(glowGroupKey, { register, unregister })

function handleMouseMove(e: MouseEvent) {
  for (const card of cards.value) {
    const el = card.getEl()
    if (!el)
      continue
    const rect = el.getBoundingClientRect()
    card.setPosition(e.clientX - rect.left, e.clientY - rect.top)
    card.activate()
  }
}

function handleMouseLeave() {
  for (const card of cards.value) {
    card.deactivate()
  }
}

function handleTouchMove(e: TouchEvent) {
  const touch = e.touches[0]
  if (!touch)
    return
  for (const card of cards.value) {
    const el = card.getEl()
    if (!el)
      continue
    const rect = el.getBoundingClientRect()
    card.setPosition(touch.clientX - rect.left, touch.clientY - rect.top)
    card.activate()
  }
}

function handleTouchEnd() {
  for (const card of cards.value) {
    card.deactivate()
  }
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
