<script setup lang="ts">
import type { FocusTargetHandle } from '@/components/Shared/focusFrame'
import { usePreferredReducedMotion } from '@vueuse/core'
import { onBeforeUnmount, onMounted, provide, ref, watch } from 'vue'
import { focusFrameKey } from '@/components/Shared/focusFrame'
import { useBreakpoint } from '@/lib/mediaQuery'

// FocusFrame draws one set of corner brackets fixed to the viewport and eases
// them onto whichever registered FocusTarget currently has focus, like a camera
// reticle settling on its subject. Nothing shows until a target first scrolls
// into view. Focus then sticks to that target until another one fills enough
// of the viewport to take it, so the brackets ride along with the focused tile
// while it scrolls and only travel on a hand-off. Hovering a target takes focus
// until the cursor leaves it.
//
// The easing runs on the offset between the brackets and their goal rather
// than on the position itself. Scrolling moves goal and brackets together with
// zero lag, and a hand-off leaves an offset that decays frame by frame.

interface Rect {
  x: number
  y: number
  w: number
  h: number
}

const props = withDefaults(defineProps<{
  // How far the brackets sit outside a focused target's box.
  padding?: number
  // Share of a target that must be visible for it to take focus by scrolling.
  threshold?: number
}>(), {
  padding: 12,
  threshold: 0.5,
})

// Fraction of the remaining offset closed per frame.
const EASE = 0.16
const SETTLE_PX = 0.5

const ZERO: Rect = { x: 0, y: 0, w: 0, h: 0 }

const overlayRef = ref<HTMLElement | null>(null)
const visible = ref(false)
const isHovered = ref(false)

const targets: FocusTargetHandle[] = []
let hovered: FocusTargetHandle | null = null
let scrolled: FocusTargetHandle | null = null

let lastFocused: FocusTargetHandle | null = null
let lastGoal: Rect | null = null
let offset: Rect = ZERO
let frame = 0
let resizeObserver: ResizeObserver | null = null

// Brackets over a phone-width tile would sit on top of its text, so the frame
// only runs from tablet widths up.
const isNarrow = useBreakpoint('<m')
const reducedMotion = usePreferredReducedMotion()

function register(target: FocusTargetHandle) {
  targets.push(target)
  const el = target.getEl()
  if (el && resizeObserver)
    resizeObserver.observe(el)
  schedule()
}

function unregister(target: FocusTargetHandle) {
  const index = targets.indexOf(target)
  if (index !== -1)
    targets.splice(index, 1)
  const el = target.getEl()
  if (el && resizeObserver)
    resizeObserver.unobserve(el)
  if (hovered === target)
    hovered = null
  if (scrolled === target)
    scrolled = null
  schedule()
}

function notifyEnter(target: FocusTargetHandle) {
  hovered = target
  isHovered.value = true
  schedule()
}

function notifyLeave(target: FocusTargetHandle) {
  if (hovered !== target)
    return
  hovered = null
  isHovered.value = false
  schedule()
}

provide(focusFrameKey, { register, unregister, notifyEnter, notifyLeave })

// The fixed nav covers the top strip of the viewport, so visibility is judged
// against the part below it.
function navBottom(): number {
  const nav = document.querySelector('.navigation')
  return nav ? Math.max(0, nav.getBoundingClientRect().bottom) : 0
}

function targetRect(target: FocusTargetHandle): Rect | null {
  const el = target.getEl()
  if (!el)
    return null
  const r = el.getBoundingClientRect()
  const pad = target.getPadding() ?? props.padding
  const padTop = target.getPaddingTop() ?? pad
  return { x: r.left - pad, y: r.top - padTop, w: r.width + pad * 2, h: r.height + pad + padTop }
}

// Share of the target's box (capped at one viewport) that is on screen below
// the nav.
function visibleShare(target: FocusTargetHandle, top: number): number {
  const el = target.getEl()
  if (!el)
    return 0
  const r = el.getBoundingClientRect()
  const viewHeight = window.innerHeight - top
  if (viewHeight <= 0 || r.height <= 0)
    return 0
  const visible = Math.min(r.bottom, window.innerHeight) - Math.max(r.top, top)
  return Math.max(0, visible) / Math.min(r.height, viewHeight)
}

// Read phase: work out which target holds focus. Scroll focus only ever moves
// forward to a target that has earned it, never back to nothing.
function measureFocus(): FocusTargetHandle | null {
  const top = navBottom()

  let best: FocusTargetHandle | null = null
  let bestShare = 0
  for (const target of targets) {
    const share = visibleShare(target, top)
    if (share > bestShare) {
      best = target
      bestShare = share
    }
  }

  if (best && best !== scrolled && bestShare >= props.threshold)
    scrolled = best

  return hovered ?? scrolled
}

function isZero(r: Rect): boolean {
  return Math.abs(r.x) < SETTLE_PX
    && Math.abs(r.y) < SETTLE_PX
    && Math.abs(r.w) < SETTLE_PX
    && Math.abs(r.h) < SETTLE_PX
}

function tick() {
  frame = 0
  const overlay = overlayRef.value
  if (!overlay || isNarrow.value)
    return

  const focused = measureFocus()
  const goal = focused ? targetRect(focused) : null
  if (!goal) {
    visible.value = false
    return
  }

  // A hand-off carries the brackets' current position over as an offset from
  // the new goal, so they travel from where they are instead of jumping.
  const handoff = lastGoal !== null && focused !== lastFocused
  if (handoff && lastGoal) {
    offset = {
      x: lastGoal.x + offset.x - goal.x,
      y: lastGoal.y + offset.y - goal.y,
      w: lastGoal.w + offset.w - goal.w,
      h: lastGoal.h + offset.h - goal.h,
    }
  }
  lastFocused = focused
  lastGoal = goal

  if (reducedMotion.value === 'reduce') {
    offset = ZERO
  }
  else {
    const keep = 1 - EASE
    offset = { x: offset.x * keep, y: offset.y * keep, w: offset.w * keep, h: offset.h * keep }
    if (isZero(offset))
      offset = ZERO
  }

  // Write phase.
  overlay.style.transform = `translate3d(${goal.x + offset.x}px, ${goal.y + offset.y}px, 0)`
  overlay.style.width = `${goal.w + offset.w}px`
  overlay.style.height = `${goal.h + offset.h}px`
  visible.value = true

  if (offset !== ZERO)
    frame = requestAnimationFrame(tick)
}

function schedule() {
  if (frame)
    return
  frame = requestAnimationFrame(tick)
}

watch(isNarrow, schedule)

onMounted(() => {
  resizeObserver = new ResizeObserver(schedule)
  for (const target of targets) {
    const el = target.getEl()
    if (el)
      resizeObserver.observe(el)
  }
  window.addEventListener('scroll', schedule, { passive: true, capture: true })
  window.addEventListener('resize', schedule, { passive: true })
  schedule()
})

onBeforeUnmount(() => {
  window.removeEventListener('scroll', schedule, { capture: true })
  window.removeEventListener('resize', schedule)
  resizeObserver?.disconnect()
  resizeObserver = null
  if (frame) {
    cancelAnimationFrame(frame)
    frame = 0
  }
})
</script>

<template>
  <slot />
  <!-- Teleported so no ancestor transform (the home swap transition, for one)
       can turn the fixed overlay into an absolutely positioned one. -->
  <ClientOnly>
    <Teleport to="body">
      <div
        v-show="!isNarrow"
        ref="overlayRef"
        class="focus-frame"
        :class="[visible && 'is-visible', isHovered && 'is-hovered']"
        aria-hidden="true"
      >
        <span class="focus-frame__corner focus-frame__corner--tl" />
        <span class="focus-frame__corner focus-frame__corner--tr" />
        <span class="focus-frame__corner focus-frame__corner--bl" />
        <span class="focus-frame__corner focus-frame__corner--br" />
      </div>
    </Teleport>
  </ClientOnly>
</template>

<style scoped lang="scss">
.focus-frame {
  position: fixed;
  top: 0;
  left: 0;
  z-index: var(--z-sticky);
  pointer-events: none;
  opacity: 0;
  color: var(--color-border);
  transition:
    opacity 0.4s ease,
    color 0.3s ease;
  will-change: transform, width, height;

  &.is-visible {
    opacity: 1;
  }

  &.is-hovered {
    color: var(--color-accent);
  }
}

.focus-frame__corner {
  position: absolute;
  width: 28px;
  height: 28px;
  border-color: currentColor;
  border-style: solid;

  &--tl {
    top: 0;
    left: 0;
    border-width: 2px 0 0 2px;
    border-radius: var(--border-radius-xs) 0 0 0;
  }

  &--tr {
    top: 0;
    right: 0;
    border-width: 2px 2px 0 0;
    border-radius: 0 var(--border-radius-xs) 0 0;
  }

  &--bl {
    bottom: 0;
    left: 0;
    border-width: 0 0 2px 2px;
    border-radius: 0 0 0 var(--border-radius-xs);
  }

  &--br {
    bottom: 0;
    right: 0;
    border-width: 0 2px 2px 0;
    border-radius: 0 0 var(--border-radius-xs) 0;
  }
}
</style>
