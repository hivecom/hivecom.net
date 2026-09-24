import { watch } from 'vue'

// The engine only hands over a fresh `progress` ~4 times a second, so stepping
// the visuals off it stutters. This anchors on each update and extrapolates a
// smooth 0..1 fraction. Pass the component's props and call `at(now)` per frame.
export function usePlayhead(props: { progress: number, duration: number }) {
  let basisProgress = 0
  let basisAt = 0

  watch(() => props.progress, (value) => {
    basisProgress = value
    basisAt = import.meta.client ? performance.now() : 0
  }, { immediate: true })

  // With duration 0 it can't advance, so it holds the basis.
  function at(now: number): number {
    const elapsed = props.duration > 0 ? (now - basisAt) / 1000 / props.duration : 0
    return Math.max(0, Math.min(1, basisProgress + elapsed))
  }

  return { at }
}
