/**
 * One `now` ticker per call, shared by every timing derived from it.
 */

import type { ComputedRef, MaybeRefOrGetter } from 'vue'
import type { Tables } from '@/types/database.overrides'
import { useIntervalFn } from '@vueuse/core'
import { computed, ref, toValue } from 'vue'
import { formatTimeAgo } from '@/lib/utils/duration'

export interface EventCountdown {
  days: number
  hours: number
  minutes: number
  seconds: number
}

export interface EventTimingResult {
  /** Null until the event has loaded. */
  eventStart: ComputedRef<Date | null>
  /** Start plus duration, null until the event has loaded. */
  eventEnd: ComputedRef<Date | null>
  hasEventEnded: ComputedRef<boolean>
  isUpcoming: ComputedRef<boolean>
  /** Inclusive at both ends: start <= now <= end. */
  isOngoing: ComputedRef<boolean>
  /** Empty while the event is upcoming or ongoing. */
  timeAgo: ComputedRef<string>
  /** Zeroed while ongoing, null once ended. */
  countdown: ComputedRef<EventCountdown | null>
}

// ---------------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------------
function msToCountdown(ms: number): EventCountdown {
  const total = Math.max(0, ms)
  const days = Math.floor(total / (1000 * 60 * 60 * 24))
  const hours = Math.floor((total % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
  const minutes = Math.floor((total % (1000 * 60 * 60)) / (1000 * 60))
  const seconds = Math.floor((total % (1000 * 60)) / 1000)
  return { days, hours, minutes, seconds }
}

const ZERO_COUNTDOWN: EventCountdown = { days: 0, hours: 0, minutes: 0, seconds: 0 }

// ---------------------------------------------------------------------------
// Composable
// ------------------------------------------------------------------------
export function useEventTiming(
  event: MaybeRefOrGetter<Tables<'events'> | null | undefined>,
): EventTimingResult {
  // Ticks every second so the countdown stays accurate. useIntervalFn cleans
  // up when the component unmounts.
  const now = ref(new Date())
  useIntervalFn(() => {
    now.value = new Date()
  }, 1_000, { immediate: true })

  // ---------------------------------------------------------------------------
  // Derived dates
  // ------------------------------------------------------------------------
  const eventStart = computed<Date | null>(() => {
    const ev = toValue(event)
    return ev ? new Date(ev.date) : null
  })

  const eventEnd = computed<Date | null>(() => {
    const ev = toValue(event)
    if (!ev || !eventStart.value)
      return null

    if (ev.duration_minutes != null) {
      return new Date(eventStart.value.getTime() + ev.duration_minutes * 60 * 1000)
    }
    return eventStart.value
  })

  // ---------------------------------------------------------------------------
  // Status flags
  // ------------------------------------------------------------------------
  const hasEventEnded = computed<boolean>(() => {
    if (!eventEnd.value)
      return false

    return now.value >= eventEnd.value
  })

  const isUpcoming = computed<boolean>(() => {
    if (!eventStart.value)
      return false

    return eventStart.value > now.value
  })

  const isOngoing = computed<boolean>(() => {
    if (!eventStart.value || !eventEnd.value)
      return false

    return eventStart.value <= now.value && now.value <= eventEnd.value
  })

  // ---------------------------------------------------------------------------
  // Display helpers
  // ------------------------------------------------------------------------
  const timeAgo = computed<string>(() => {
    if (!eventEnd.value || isUpcoming.value || isOngoing.value)
      return ''

    const diff = now.value.getTime() - eventEnd.value.getTime()
    return formatTimeAgo(diff)
  })

  const countdown = computed<EventCountdown | null>(() => {
    if (hasEventEnded.value)
      return null
    if (isOngoing.value)
      return { ...ZERO_COUNTDOWN }
    if (!eventStart.value)
      return null

    const diff = eventStart.value.getTime() - now.value.getTime()
    return msToCountdown(diff)
  })

  return {
    eventStart,
    eventEnd,
    hasEventEnded,
    isUpcoming,
    isOngoing,
    timeAgo,
    countdown,
  }
}
