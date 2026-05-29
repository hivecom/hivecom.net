import type { Ref } from 'vue'
import { useEventListener } from '@vueuse/core'
import { computed, ref } from 'vue'

/**
 * Pan / zoom / swipe gesture controller shared by the lightbox components.
 *
 * Handles, on a single stable container element:
 * - wheel + trackpad pinch (ctrl/cmd wheel) zoom on desktop
 * - Safari desktop trackpad pinch via gesture events
 * - touch pinch-to-zoom (two pointers)
 * - drag-to-pan while zoomed in
 * - horizontal swipe-to-navigate while at native scale
 * - double-click / double-tap to toggle zoom
 *
 * The container should keep `touch-action: none` so the browser doesn't steal
 * the gestures for its own scrolling/zooming.
 */

type GestureEventLike = Event & { scale: number, clientX: number, clientY: number }

interface UseLightboxZoomOptions {
  onNext: () => void
  onPrev: () => void
  canNext: () => boolean
  canPrev: () => boolean
}

const MIN_SCALE = 1
const MAX_SCALE = 5
const SWIPE_THRESHOLD = 60
const MOVE_THRESHOLD = 8
const DOUBLE_TAP_SCALE = 2.5
const DOUBLE_TAP_DELAY = 300

export function useLightboxZoom(
  container: Ref<HTMLElement | null | undefined>,
  content: Ref<HTMLElement | null | undefined>,
  options: UseLightboxZoomOptions,
) {
  const scale = ref(1)
  const offsetX = ref(0)
  const offsetY = ref(0)
  const navOffset = ref(0)
  const isSwiping = ref(false)
  const isInteracting = ref(false)
  const isPanning = ref(false)

  const isZoomed = computed(() => scale.value > 1.001)

  // Active pointers, keyed by pointerId, for pan + pinch tracking.
  const pointers = new Map<number, { x: number, y: number }>()
  let mode: 'none' | 'pan' | 'swipe' | 'pinch' = 'none'
  let startX = 0
  let startY = 0
  let lastX = 0
  let lastY = 0
  let pinchStartDist = 0
  let pinchStartScale = 1
  let gestureStartScale = 1
  // Touch double-tap tracking (touch devices don't reliably fire dblclick).
  let lastTapTime = 0
  let lastTapX = 0
  let lastTapY = 0

  function reset() {
    scale.value = 1
    offsetX.value = 0
    offsetY.value = 0
    navOffset.value = 0
    isSwiping.value = false
    isInteracting.value = false
    isPanning.value = false
    mode = 'none'
    pointers.clear()
  }

  function clampOffsets() {
    const el = content.value
    const wrap = container.value
    if (!el || !wrap)
      return
    const maxX = Math.max(0, (el.offsetWidth * scale.value - wrap.clientWidth) / 2)
    const maxY = Math.max(0, (el.offsetHeight * scale.value - wrap.clientHeight) / 2)
    offsetX.value = Math.min(maxX, Math.max(-maxX, offsetX.value))
    offsetY.value = Math.min(maxY, Math.max(-maxY, offsetY.value))
  }

  /**
   * Set a new scale while keeping the content point under (cx, cy) fixed.
   * (cx, cy) are relative to the container's center.
   */
  function zoomToScale(newScale: number, cx: number, cy: number) {
    const clamped = Math.min(MAX_SCALE, Math.max(MIN_SCALE, newScale))
    if (clamped === scale.value)
      return
    const ratio = clamped / scale.value
    offsetX.value = cx - (cx - offsetX.value) * ratio
    offsetY.value = cy - (cy - offsetY.value) * ratio
    scale.value = clamped
    if (clamped <= MIN_SCALE) {
      offsetX.value = 0
      offsetY.value = 0
    }
    clampOffsets()
  }

  function toCenter(clientX: number, clientY: number) {
    const wrap = container.value
    if (!wrap)
      return { x: 0, y: 0 }
    const rect = wrap.getBoundingClientRect()
    return {
      x: clientX - rect.left - rect.width / 2,
      y: clientY - rect.top - rect.height / 2,
    }
  }

  function pointerDistance(a: { x: number, y: number }, b: { x: number, y: number }) {
    return Math.hypot(a.x - b.x, a.y - b.y)
  }

  function onPointerDown(e: PointerEvent) {
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })

    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()]
      mode = 'pinch'
      pinchStartDist = pointerDistance(a!, b!)
      pinchStartScale = scale.value
      isInteracting.value = true
      for (const id of pointers.keys())
        container.value?.setPointerCapture?.(id)
    }
    else if (pointers.size === 1) {
      startX = lastX = e.clientX
      startY = lastY = e.clientY
      mode = 'none'
    }
  }

  function onPointerMove(e: PointerEvent) {
    if (!pointers.has(e.pointerId))
      return
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })

    if (mode === 'pinch' && pointers.size >= 2) {
      const [a, b] = [...pointers.values()]
      const dist = pointerDistance(a!, b!)
      const mid = toCenter((a!.x + b!.x) / 2, (a!.y + b!.y) / 2)
      if (pinchStartDist > 0)
        zoomToScale(pinchStartScale * (dist / pinchStartDist), mid.x, mid.y)
      e.preventDefault()
      return
    }

    if (pointers.size !== 1)
      return

    const dx = e.clientX - startX
    const dy = e.clientY - startY

    if (mode === 'none') {
      if (isZoomed.value) {
        mode = 'pan'
        isPanning.value = true
        isInteracting.value = true
        container.value?.setPointerCapture?.(e.pointerId)
      }
      else if (Math.abs(dx) > MOVE_THRESHOLD && Math.abs(dx) > Math.abs(dy)) {
        mode = 'swipe'
        isSwiping.value = true
        container.value?.setPointerCapture?.(e.pointerId)
      }
      else {
        return
      }
    }

    if (mode === 'pan') {
      offsetX.value += e.clientX - lastX
      offsetY.value += e.clientY - lastY
      clampOffsets()
      e.preventDefault()
    }
    else if (mode === 'swipe') {
      let raw = dx
      if (raw > 0 && !options.canPrev())
        raw = 0
      if (raw < 0 && !options.canNext())
        raw = 0
      navOffset.value = raw
      e.preventDefault()
    }

    lastX = e.clientX
    lastY = e.clientY
  }

  function onPointerUp(e: PointerEvent) {
    if (!pointers.has(e.pointerId))
      return
    pointers.delete(e.pointerId)

    if (mode === 'swipe') {
      const dx = e.clientX - startX
      if (dx <= -SWIPE_THRESHOLD && options.canNext())
        options.onNext()
      else if (dx >= SWIPE_THRESHOLD && options.canPrev())
        options.onPrev()
      navOffset.value = 0
      isSwiping.value = false
    }

    if (mode === 'pinch' && pointers.size < 2) {
      if (!isZoomed.value) {
        offsetX.value = 0
        offsetY.value = 0
      }
      // Hand off to single-pointer pan if a finger remains.
      const remaining = [...pointers.entries()][0]
      if (remaining) {
        mode = 'none'
        startX = lastX = remaining[1].x
        startY = lastY = remaining[1].y
      }
    }

    // Touch double-tap: a quick second tap near the first toggles zoom.
    // Mouse uses the native dblclick handler, so skip it here.
    if (
      e.pointerType !== 'mouse'
      && mode === 'none'
      && Math.abs(e.clientX - startX) <= MOVE_THRESHOLD
      && Math.abs(e.clientY - startY) <= MOVE_THRESHOLD
    ) {
      const now = Date.now()
      if (
        now - lastTapTime <= DOUBLE_TAP_DELAY
        && Math.abs(e.clientX - lastTapX) <= MOVE_THRESHOLD * 2
        && Math.abs(e.clientY - lastTapY) <= MOVE_THRESHOLD * 2
      ) {
        const { x, y } = toCenter(e.clientX, e.clientY)
        zoomToScale(isZoomed.value ? MIN_SCALE : DOUBLE_TAP_SCALE, x, y)
        lastTapTime = 0
      }
      else {
        lastTapTime = now
        lastTapX = e.clientX
        lastTapY = e.clientY
      }
    }

    if (pointers.size === 0) {
      mode = 'none'
      isPanning.value = false
      isInteracting.value = false
    }
  }

  function onWheel(e: WheelEvent) {
    e.preventDefault()
    const { x, y } = toCenter(e.clientX, e.clientY)
    const delta = Math.max(-50, Math.min(50, e.deltaY))
    zoomToScale(scale.value * Math.exp(-delta * 0.012), x, y)
  }

  function onDoubleClick(e: MouseEvent) {
    const { x, y } = toCenter(e.clientX, e.clientY)
    zoomToScale(isZoomed.value ? MIN_SCALE : DOUBLE_TAP_SCALE, x, y)
  }

  // Safari desktop trackpad pinch fires gesture events instead of ctrl+wheel.
  function onGestureStart(e: Event) {
    e.preventDefault()
    gestureStartScale = scale.value
  }

  function onGestureChange(e: Event) {
    e.preventDefault()
    const ge = e as GestureEventLike
    const { x, y } = toCenter(ge.clientX, ge.clientY)
    zoomToScale(gestureStartScale * ge.scale, x, y)
  }

  useEventListener(container, 'pointerdown', onPointerDown)
  useEventListener(container, 'pointermove', onPointerMove, { passive: false })
  useEventListener(container, 'pointerup', onPointerUp)
  useEventListener(container, 'pointercancel', onPointerUp)
  useEventListener(container, 'wheel', onWheel, { passive: false })
  useEventListener(container, 'dblclick', onDoubleClick)
  useEventListener(container, 'gesturestart', onGestureStart, { passive: false })
  useEventListener(container, 'gesturechange', onGestureChange, { passive: false })
  useEventListener(container, 'gestureend', (e: Event) => e.preventDefault(), { passive: false })

  const contentStyle = computed(() => ({
    transform: `translate3d(${offsetX.value}px, ${offsetY.value}px, 0) scale(${scale.value})`,
    transition: isInteracting.value ? 'none' : 'transform 0.18s ease',
    cursor: isZoomed.value ? (isPanning.value ? 'grabbing' : 'grab') : '',
  }))

  const navStyle = computed(() => isSwiping.value
    ? { transform: `translateX(${navOffset.value}px)`, transition: 'none' }
    : {})

  return { scale, isZoomed, contentStyle, navStyle, isSwiping, reset }
}
