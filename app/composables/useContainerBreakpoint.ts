import type { Ref } from 'vue'
import { useElementSize } from '@vueuse/core'
import { computed } from 'vue'

/**
 * True when the element is narrower than `threshold` px. Element-scoped
 * `useBreakpoint`: false during SSR and before mount.
 */
export function useContainerBreakpoint(el: Ref<HTMLElement | null>, threshold: number) {
  const { width } = useElementSize(el, { width: 0, height: 0 })

  // Width is 0 before mount, so the guard keeps it false (desktop) during SSR.
  return computed(() => width.value > 0 && width.value < threshold)
}
