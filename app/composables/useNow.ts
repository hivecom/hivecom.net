/**
 * Singleton clock tick for relative time displays.
 *
 * One interval drives every "5 minutes ago" label on the page, so a chat log
 * with a few hundred timestamps doesn't spin up a few hundred timers. Read
 * `now` inside a computed and the value re-derives on each tick.
 *
 * Usage:
 *   const { now } = useNow()
 *   const label = computed(() => fromNow(props.date, now.value))
 */

import { readonly, ref, watch } from 'vue'
import { usePageVisibility } from '@/composables/usePageVisibility'

// 15s keeps sub-minute labels honest without re-rendering the world.
const TICK_MS = 15_000

const now = ref(Date.now())

if (import.meta.client) {
  setInterval(() => {
    now.value = Date.now()
  }, TICK_MS)

  // Background tabs throttle intervals, so resync the moment we're visible
  // again instead of showing however stale the last tick left us.
  const { isHidden } = usePageVisibility()
  watch(isHidden, (hidden) => {
    if (!hidden)
      now.value = Date.now()
  })
}

export function useNow() {
  return { now: readonly(now) }
}
