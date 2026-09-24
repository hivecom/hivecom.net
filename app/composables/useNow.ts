/**
 * Singleton clock tick for relative time displays.
 *
 * One interval drives every "5 minutes ago" label on the page, so a chat log
 * with a few hundred timestamps doesn't spin up a few hundred timers. Read
 * `now` inside a computed and the value re-derives on each tick.
 *
 * Pass the date being labelled and the clock speeds up to a 1s tick while that
 * date is within a minute of now, so "12 seconds ago" counts up instead of
 * jumping in 15s steps. It drops back to the slow tick once nothing is fresh.
 */

import type { MaybeRefOrGetter } from 'vue'
import { getCurrentScope, onScopeDispose, readonly, ref, toValue, watch } from 'vue'
import { usePageVisibility } from '@/composables/usePageVisibility'

// 15s is plenty once labels read in minutes. Seconds need the fast tick.
const TICK_MS = 15_000
const FAST_TICK_MS = 1_000

// fromNow switches from seconds to minutes at this distance.
const FRESH_MS = 60_000

// setTimeout fires immediately past 2^31-1 ms (~24.8 days), so dates further
// out than this never get a wait scheduled.
const MAX_WAIT_MS = 2_147_483_647

const now = ref(Date.now())

// Number of mounted labels currently showing a sub-minute value.
let freshCount = 0
let timer: ReturnType<typeof setInterval> | undefined

function tick() {
  now.value = Date.now()
}

function schedule() {
  if (timer)
    clearInterval(timer)

  timer = setInterval(tick, freshCount > 0 ? FAST_TICK_MS : TICK_MS)
}

if (import.meta.client) {
  schedule()

  // Background tabs throttle intervals, so resync the moment we're visible
  // again instead of showing however stale the last tick left us.
  const { isHidden } = usePageVisibility()
  watch(isHidden, (hidden) => {
    if (!hidden)
      tick()
  })
}

// Holds the fast tick for as long as the date sits within FRESH_MS of now.
// Future dates wait until they come into range, so a countdown hours out
// doesn't pin the clock at 1s the whole time.
function holdWhileFresh(date: MaybeRefOrGetter<string | Date | null | undefined>) {
  let held = false
  let timeout: ReturnType<typeof setTimeout> | undefined

  function release() {
    if (timeout)
      clearTimeout(timeout)
    timeout = undefined

    if (!held)
      return

    held = false
    freshCount--
    if (freshCount === 0)
      schedule()
  }

  function hold(until: number) {
    held = true
    freshCount++

    // First fresh label: catch up now rather than waiting out the slow tick.
    if (freshCount === 1) {
      tick()
      schedule()
    }

    timeout = setTimeout(release, until - Date.now())
  }

  watch(() => toValue(date), (value) => {
    release()

    const at = value ? new Date(value).getTime() : Number.NaN
    if (Number.isNaN(at))
      return

    const start = at - FRESH_MS
    const end = at + FRESH_MS
    const current = Date.now()

    if (current >= end)
      return

    if (current >= start)
      hold(end)
    else if (start - current <= MAX_WAIT_MS)
      timeout = setTimeout(hold, start - current, end)
  }, { immediate: true })

  onScopeDispose(release)
}

export function useNow(date?: MaybeRefOrGetter<string | Date | null | undefined>) {
  if (date !== undefined && import.meta.client && getCurrentScope())
    holdWhileFresh(date)

  return { now: readonly(now) }
}
