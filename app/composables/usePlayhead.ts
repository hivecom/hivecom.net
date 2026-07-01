import { watch } from 'vue'

// The playhead extrapolation AudioSpectrum and AudioVisualization both run. The
// engine only hands us a fresh `progress` ~4 times a second, so stepping the
// visuals straight off it stutters. Instead we anchor on each progress update
// (the value, and when it landed) and extrapolate a smooth 0..1 fraction from
// the frame's `now` timestamp, clamped to the range.
//
// Pass the component's props (it reads `progress` and `duration` live). Call the
// returned `at(now)` inside the frame loop. The math is exactly what both
// components had inline, kept identical so nothing about the motion changes.
export function usePlayhead(props: { progress: number, duration: number }) {
  // The progress value last handed to us and when it landed.
  let basisProgress = 0
  let basisAt = 0

  // Re-anchor whenever a fresh progress value arrives.
  watch(() => props.progress, (value) => {
    basisProgress = value
    basisAt = import.meta.client ? performance.now() : 0
  }, { immediate: true })

  // Extrapolated 0..1 playhead at the given frame timestamp. With duration 0 we
  // can't advance, so it just holds the basis.
  function at(now: number): number {
    const elapsed = props.duration > 0 ? (now - basisAt) / 1000 / props.duration : 0
    return Math.max(0, Math.min(1, basisProgress + elapsed))
  }

  return { at }
}
