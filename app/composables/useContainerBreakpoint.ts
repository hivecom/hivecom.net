import type { Ref } from 'vue'
import { useElementSize } from '@vueuse/core'
import { computed } from 'vue'

/**
 * Returns true when the referenced element's rendered width is below the given
 * threshold in pixels. Uses container width rather than viewport width, so
 * components respond to their actual available space regardless of context
 * (e.g. chat panel, sidebar, narrow window).
 *
 * Mirrors the behaviour of `useBreakpoint` but element-scoped:
 * returns false during SSR / before mount (width = 0), then the real value
 * once ResizeObserver fires after mount.
 *
 * @param el        Template ref to the element to observe
 * @param threshold Width in pixels below which the boolean becomes true
 */
export function useContainerBreakpoint(el: Ref<HTMLElement | null>, threshold: number) {
  const { width } = useElementSize(el, { width: 0, height: 0 })
  // width.value === 0 before mount - guard keeps it false (desktop) during SSR
  return computed(() => width.value > 0 && width.value < threshold)
}
