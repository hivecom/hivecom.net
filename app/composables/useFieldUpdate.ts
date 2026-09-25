import { nextTick } from 'vue'

// Per-field updates for a form component that emits its whole state object on
// v-model. The prop only catches up when the parent re-renders, so two fields
// emitting in one tick would each spread the stale prop and the second would
// undo the first. Updates build on the last emitted object until that render.
export function useFieldUpdate<T extends object>(source: () => T, emitValue: (value: T) => void) {
  let pending: T | null = null

  return function update<K extends keyof T>(key: K, value: T[K]) {
    const next = { ...(pending ?? source()), [key]: value }
    const first = pending === null
    pending = next

    // Emit before scheduling the reset, so the nextTick lands after the flush
    // that the emit queues on the parent.
    emitValue(next)

    if (first) {
      void nextTick(() => {
        pending = null
      })
    }
  }
}
