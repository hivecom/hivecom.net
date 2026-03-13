/**
 * Composable that centralises all event timing derived state.
 *
 * Previously, `eventStart`, `eventEnd`, `hasEventEnded`, `isUpcoming`,
 * `isOngoing`, `timeAgo`, and `countdown` were independently re-implemented
 * in four separate files:
 *   - pages/events/[id].vue
 *   - components/Events/RSVPButton.vue
 *   - components/Events/EventRSVPCount.vue
 *   - components/Events/EventRSVPModal.vue
 *
 * This composable owns the single `now` ref and its `useIntervalFn` ticker so
 * that each consumer no longer spawns its own interval.
 *
 * @example
 * ```ts
 * const { eventStart, eventEnd, hasEventEnded, isUpcoming, isOngoing, timeAgo, countdown } =
 *   useEventTiming(toRef(props, 'event'))
 * ```
 */

import type { ComputedRef, MaybeRefOrGetter } from 'vue'
import type { Tables } from '@/types/database.overrides'
import { useIntervalFn } from '@vueuse/core'
import { computed, ref, toValue } from 'vue'

export interface EventCountdown {
  days: number
  hours: number
  minutes: number
  seconds: number
}

export interface EventTimingResult {
  /** Parsed start date of the event, or null when the event is not yet loaded. */
  eventStart: ComputedRef<Date | null>
  /** Parsed end date of the event (start + duration), or null when not loaded. */
  eventEnd: ComputedRef<Date | null>
  /** True when the current time is past the event end. */
  hasEventEnded: ComputedRef<boolean>
  /** True when the event has not yet started. */
  isUpcoming: ComputedRef<boolean>
  /** True while the event is in progress (start <= now <= end). */
  isOngoing: ComputedRef<boolean>
  /**
   * Human-readable "X days/hours/minutes ago" string for past events.
   * Returns an empty string while the event is upcoming or ongoing.
   */
  timeAgo: ComputedRef<string>
  /**
   * Countdown object for upcoming events, or zeroed object for ongoing events.
   * Returns null when the event has already ended.
   */
  countdown: ComputedRef<EventCountdown | null>
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function msToCountdown(ms: number): EventCountdown {
  const total = Math.max(0, ms)
  const days = Math.floor(total / (1000 * 60 * 60 * 24))
  const hours = Math.floor((total % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
  const minutes = Math.floor((total % (1000 * 60 * 60)) / (1000 * 60))
  const seconds = Math.floor((total % (1000 * 60)) / 1000)
  return { days, hours, minutes, seconds }
}

const ZERO_COUNTDOWN: EventCountdown = { days: 0, hours: 0, minutes: 0, seconds: 0 }

function buildTimeAgo(diffMs: number): string {
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60))

  if (days > 0)
    return days === 1 ? '1 day ago' : `${days} days ago`
  if (hours > 0)
    return hours === 1 ? '1 hour ago' : `${hours} hours ago`
  if (minutes > 0)
    return minutes === 1 ? '1 minute ago' : `${minutes} minutes ago`
  return 'Just now'
}

// ---------------------------------------------------------------------------
// Composable
// ---------------------------------------------------------------------------

export function useEventTiming(
  event: MaybeRefOrGetter<Tables<'events'> | null | undefined>,
): EventTimingResult {
  // Single shared clock - ticks every second so countdown stays accurate.
  // useIntervalFn is cleaned up automatically when the component unmounts.
  const now = ref(new Date())
  useIntervalFn(() => {
    now.value = new Date()
  }, 1_000, { immediate: true })

  // ---------------------------------------------------------------------------
  // Derived dates
  // ---------------------------------------------------------------------------

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
  // ---------------------------------------------------------------------------

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
  // ---------------------------------------------------------------------------

  const timeAgo = computed<string>(() => {
    if (!eventEnd.value || isUpcoming.value || isOngoing.value)
      return ''
    const diff = now.value.getTime() - eventEnd.value.getTime()
    return buildTimeAgo(diff)
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
