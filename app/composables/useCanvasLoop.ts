import { onBeforeUnmount } from 'vue'

// The requestAnimationFrame plumbing all three canvas visualizers repeat: hold
// one rafId, start it idempotently (never stack two loops), cancel on teardown.
// The per-frame work and the "keep looping?" decision differ per component, so
// they stay in the component: the frame callback gets the `now` timestamp and
// returns whether to schedule another frame. We just own the bookkeeping so the
// loop parks itself the moment the callback says it's done (paused and settled,
// coast window elapsed, ...).
//
// Client-only: start() is a no-op on the server, so callers don't have to guard
// it. Self-cleaning: cancels any pending frame on unmount.
export function useCanvasLoop(frame: (now: number) => boolean) {
  let rafId: number | null = null

  function tick(now: number) {
    if (frame(now))
      rafId = requestAnimationFrame(tick)
    else
      rafId = null
  }

  function start() {
    if (rafId == null && import.meta.client)
      rafId = requestAnimationFrame(tick)
  }

  function stop() {
    if (rafId != null) {
      cancelAnimationFrame(rafId)
      rafId = null
    }
  }

  onBeforeUnmount(stop)

  return { start, stop }
}

// DPR-aware canvas backing-store resize the three visualizers share. Caps the
// device pixel ratio at 2 (past that costs fill rate for no visible gain) and
// only writes width/height when they actually change, since assigning either
// clears the canvas. Returns the dpr so the caller can setTransform with it.
export function resizeCanvasToDisplay(canvas: HTMLCanvasElement, w: number, h: number): number {
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  const cw = Math.round(w * dpr)
  const ch = Math.round(h * dpr)
  if (canvas.width !== cw || canvas.height !== ch) {
    canvas.width = cw
    canvas.height = ch
  }
  return dpr
}
