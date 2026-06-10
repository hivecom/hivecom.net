<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

interface Props {
  speed?: number
  direction?: 'left' | 'right'
  pauseOnHover?: boolean
  draggable?: boolean
}

interface DragEndPayload {
  dragged: boolean
}

const props = withDefaults(defineProps<Props>(), {
  speed: 40,
  direction: 'left',
  pauseOnHover: true,
  draggable: true,
})

const emit = defineEmits<{
  dragstart: []
  dragend: [payload: DragEndPayload]
}>()

// --- Refs ---
const trackRef = ref<HTMLElement | null>(null)
const contentRef = ref<HTMLElement | null>(null)

const offset = ref(0)
const contentWidth = ref(0)
const isDragging = ref(false)

// --- Internal state (non-reactive) ---
let currentVelocity = 0
let rafId: number | null = null
let lastTimestamp: number | null = null
const isHovering = ref(false)
let reducedMotion = false

// Drag state
let dragStartX = 0
let dragStartOffset = 0
let didDrag = false

interface VelocitySample {
  dx: number
  dt: number
}
let velocitySamples: VelocitySample[] = []

// Observers
let resizeObserver: ResizeObserver | null = null
let intersectionObserver: IntersectionObserver | null = null
let isVisible = true

// --- Computed ---
const targetVelocity = computed<number>(() => {
  if (isDragging.value || isHovering.value)
    return 0
  return props.direction === 'left' ? -props.speed : props.speed
})

const trackStyle = computed(() => ({
  transform: `translate3d(${offset.value}px, 0, 0)`,
  willChange: 'transform',
}))

// --- rAF loop ---
function normalizeOffset() {
  const w = contentWidth.value
  if (w <= 0)
    return
  // Keep offset in (-w, 0] for BOTH directions. The track lays out two
  // identical copies at [0, w] and [w, 2w], so the viewport is only guaranteed
  // to be covered while offset <= 0 (a positive offset exposes a blank gap on
  // the left). Direction only flips the velocity sign (see targetVelocity);
  // subtracting whole multiples of w here never shifts the visible image
  // because the two copies are identical and adjacent.
  offset.value = ((offset.value % w) - w) % w
}

function loop(timestamp: number) {
  if (lastTimestamp === null)
    lastTimestamp = timestamp

  const elapsed = timestamp - lastTimestamp
  lastTimestamp = timestamp

  const dt = Math.min(elapsed, 50) / 1000

  currentVelocity = currentVelocity + (targetVelocity.value - currentVelocity) * dt * 6

  offset.value += currentVelocity * dt
  normalizeOffset()

  rafId = requestAnimationFrame(loop)
}

function startLoop() {
  if (reducedMotion)
    return
  if (rafId !== null)
    return
  lastTimestamp = null
  rafId = requestAnimationFrame(loop)
}

function stopLoop() {
  if (rafId !== null) {
    cancelAnimationFrame(rafId)
    rafId = null
    lastTimestamp = null
  }
}

// --- Pointer drag handlers ---
let pendingPointerId: number | null = null

function onPointerDown(e: PointerEvent) {
  if (!props.draggable)
    return
  // Track start position but don't capture yet - capturing immediately
  // redirects pointerup to this element, which causes the browser to fire
  // click here instead of on the child target, breaking child click handlers.
  pendingPointerId = e.pointerId
  dragStartX = e.clientX
  dragStartOffset = offset.value
  didDrag = false
  velocitySamples = []
  currentVelocity = 0
}

function onPointerMove(e: PointerEvent) {
  if (pendingPointerId === null && !isDragging.value)
    return
  const dx = e.clientX - dragStartX

  // Only start a real drag once threshold is crossed
  if (!isDragging.value) {
    if (Math.abs(dx) <= 5)
      return
    // Threshold crossed - now capture and enter drag mode
    isDragging.value = true
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    emit('dragstart')
  }

  offset.value = dragStartOffset + dx
  normalizeOffset()
  didDrag = true

  velocitySamples.push({ dx: e.movementX, dt: 1 / 60 })
  if (velocitySamples.length > 5)
    velocitySamples.shift()
}

function onPointerUp(e: PointerEvent) {
  const wasTracking = pendingPointerId !== null
  pendingPointerId = null

  if (!isDragging.value) {
    // Clean click - emit dragend so consumers reset their wasDragged state
    if (wasTracking)
      emit('dragend', { dragged: false })
    return
  }
  isDragging.value = false
  ;(e.currentTarget as HTMLElement | null)?.releasePointerCapture?.(e.pointerId)

  // Compute weighted velocity from samples
  let totalDx = 0
  let totalDt = 0
  for (const s of velocitySamples) {
    totalDx += s.dx
    totalDt += s.dt
  }
  const flickVelocity = totalDt > 0 ? totalDx / totalDt : 0

  currentVelocity = Math.abs(flickVelocity) > 1 ? flickVelocity : targetVelocity.value

  emit('dragend', { dragged: didDrag })
}

// --- Hover handlers ---
function onPointerEnter() {
  if (!props.pauseOnHover || isDragging.value)
    return
  isHovering.value = true
}

function onPointerLeave() {
  if (isDragging.value)
    return
  isHovering.value = false
}

// --- Lifecycle ---
onMounted(() => {
  // Reduced motion check
  if (typeof window !== 'undefined' && window.matchMedia) {
    reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  }

  // ResizeObserver
  if (contentRef.value) {
    resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry)
        return
      const newWidth = entry.contentRect.width
      if (newWidth > 0 && contentWidth.value > 0) {
        // Normalize offset proportionally to avoid jump
        const ratio = newWidth / contentWidth.value
        offset.value = offset.value * ratio
      }
      contentWidth.value = newWidth
      normalizeOffset()
    })
    resizeObserver.observe(contentRef.value)
  }

  // IntersectionObserver
  if (trackRef.value?.parentElement) {
    intersectionObserver = new IntersectionObserver(
      (entries) => {
        const entry = entries[0]
        if (!entry)
          return
        isVisible = entry.isIntersecting
        if (isVisible) {
          startLoop()
        }
        else {
          stopLoop()
        }
      },
      { threshold: 0 },
    )
    intersectionObserver.observe(trackRef.value.parentElement)
  }

  startLoop()
})

onBeforeUnmount(() => {
  stopLoop()
  resizeObserver?.disconnect()
  intersectionObserver?.disconnect()
})
</script>

<template>
  <div
    class="marquee"
    :class="{
      'marquee--draggable': draggable,
      'is-dragging': isDragging,
    }"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="onPointerUp"
    @pointerenter="onPointerEnter"
    @pointerleave="onPointerLeave"
  >
    <div
      ref="trackRef"
      class="marquee__track"
      :style="trackStyle"
      @dragstart.prevent
    >
      <div ref="contentRef" class="marquee__content">
        <slot />
      </div>
      <div class="marquee__content" aria-hidden="true">
        <slot />
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.marquee {
  overflow: hidden;
  width: 100%;
  position: relative;

  &--draggable {
    cursor: grab;
  }

  &.is-dragging {
    cursor: grabbing;
    user-select: none;
  }
}

.marquee__track {
  display: flex;
  width: max-content;
  touch-action: pan-y;
}

.marquee__content {
  display: flex;
  flex-shrink: 0;
}
</style>
