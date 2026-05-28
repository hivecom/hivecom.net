import type { Tables } from '@/types/database.overrides'
import { useNow } from '@vueuse/core'
import dayjs from 'dayjs'
import { computed } from 'vue'
import { useDataEvents } from '@/composables/useDataEvents'
import { expandRecurringEvent } from '@/lib/utils/rrule'

export function useOngoingEvents() {
  const { events } = useDataEvents()
  const now = useNow({ interval: 60_000 })

  const ongoingEvents = computed<Tables<'events'>[]>(() => {
    const nowMs = now.value.getTime()
    const seen = new Set<number>()
    const result: Tables<'events'>[] = []

    for (const event of events.value) {
      const durationMs = (event.duration_minutes ?? 0) * 60_000

      const hasRRule = event.recurrence_rule != null && event.recurrence_rule !== ''
      if (!hasRRule) {
        // Non-recurring: check if now is within [start, start + duration]
        const start = new Date(event.date).getTime()
        const end = start + durationMs
        if (nowMs >= start && nowMs <= end) {
          result.push(event)
        }
      }
      else {
        // Recurring: expand a window from (now - duration) to (now + 1 min)
        const windowStart = new Date(nowMs - Math.max(durationMs, 0))
        const windowEnd = new Date(nowMs + 60_000)
        const occurrences = expandRecurringEvent(event, windowStart, windowEnd)

        for (const occurrence of occurrences) {
          if (seen.has(event.id))
            break

          const occStart = dayjs(occurrence.date).valueOf()
          const occEnd = occStart + durationMs

          if (nowMs >= occStart && nowMs <= occEnd) {
            seen.add(event.id)
            result.push(occurrence)
          }
        }
      }
    }

    return result
  })

  function getOngoingEventsForGame(gameId: number): Tables<'events'>[] {
    return ongoingEvents.value.filter(event => event.games?.includes(gameId))
  }

  function hasOngoingEventForGame(gameId: number): boolean {
    return getOngoingEventsForGame(gameId).length > 0
  }

  return {
    ongoingEvents,
    getOngoingEventsForGame,
    hasOngoingEventForGame,
  }
}
