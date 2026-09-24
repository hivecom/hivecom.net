import { onBeforeUnmount } from 'vue'

// rAF bookkeeping for the canvas visualizers. start() never stacks two loops and
// is a no-op on the server. The frame callback returns whether to keep going, so
// the loop parks itself as soon as the component is done.
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

// DPR is capped at 2, past that costs fill rate for no visible gain. width and
// height are only written on change, since assigning either clears the canvas.
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
