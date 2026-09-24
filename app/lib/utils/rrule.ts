import type { Tables } from '@/types/database.overrides'

// ─── Types ────────────────────────────────────────────────────────────────────

type EventRow = Tables<'events'>

/** The fields expansion reads, so unsaved form state can be expanded too. */
type ExpandableEvent = Pick<EventRow, 'date' | 'recurrence_rule'> & {
  excluded_dates?: readonly string[] | null
}

interface ParsedRRule {
  freq: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY'
  interval: number
  byDay: string[] // e.g. ['MO', 'TU']
  byMonthDay: number | null
  until: Date | null
}

// ─── Day name maps ────────────────────────────────────────────────────────────

const DAY_CODE_TO_INDEX: Record<string, number> = {
  SU: 0,
  MO: 1,
  TU: 2,
  WE: 3,
  TH: 4,
  FR: 5,
  SA: 6,
}

const DAY_CODE_TO_NAME: Record<string, string> = {
  MO: 'Monday',
  TU: 'Tuesday',
  WE: 'Wednesday',
  TH: 'Thursday',
  FR: 'Friday',
  SA: 'Saturday',
  SU: 'Sunday',
}

// ─── Parser ───────────────────────────────────────────────────────────────────

function parseRRule(rule: string): ParsedRRule | null {
  const parts: Record<string, string> = {}
  for (const part of rule.split(';')) {
    const [key, value] = part.split('=')
    if (key != null && key !== '' && value != null && value !== '')
      parts[key.trim().toUpperCase()] = value.trim().toUpperCase()
  }

  const freq = parts.FREQ
  if (freq == null || freq === '' || !['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'].includes(freq))
    return null

  const intervalRaw = parts.INTERVAL
  const interval = intervalRaw != null && intervalRaw !== '' ? Math.max(1, Number.parseInt(intervalRaw, 10)) : 1

  const byDayRaw = parts.BYDAY
  const byDay = byDayRaw != null && byDayRaw !== '' ? byDayRaw.split(',').map(d => d.trim()) : []

  const byMonthDayRaw = parts.BYMONTHDAY
  const byMonthDay = byMonthDayRaw != null && byMonthDayRaw !== '' ? Number.parseInt(byMonthDayRaw, 10) : null

  // UNTIL can be a UTC datetime (20250615T120000Z) or date-only (20250615).
  const untilRaw = parts.UNTIL
  let until: Date | null = null
  if (untilRaw != null && untilRaw !== '') {
    const normalised = untilRaw.includes('T')
      ? untilRaw.replace(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/, '$1-$2-$3T$4:$5:$6$7')
      : untilRaw.replace(/^(\d{4})(\d{2})(\d{2})$/, '$1-$2-$3')
    const parsed = new Date(normalised)
    until = Number.isNaN(parsed.getTime()) ? null : parsed
  }

  return {
    freq: freq as ParsedRRule['freq'],
    interval,
    byDay,
    byMonthDay,
    until,
  }
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

/** Sets the local date part on a copy, keeping the time of day. */
function withDate(original: Date, year: number, month: number, day: number): Date {
  const d = new Date(original)
  d.setFullYear(year, month, day)
  return d
}

/** Mutates `d`. */
function addDays(d: Date, n: number): Date {
  d.setDate(d.getDate() + n)
  return d
}

function addMonths(d: Date, n: number): Date {
  const result = new Date(d)
  result.setMonth(result.getMonth() + n)
  return result
}

function addYears(d: Date, n: number): Date {
  const result = new Date(d)
  result.setFullYear(result.getFullYear() + n)
  return result
}

// ─── Excluded dates ───────────────────────────────────────────────────────────

// Occurrences step in the viewer's local time, so the same one can land an hour
// or two apart in UTC across DST. Six hours absorbs that and stays well under
// the one day minimum gap. The excluded_dates RSVP cleanup trigger must use the
// same value.
const EXCLUSION_TOLERANCE_MS = 6 * 60 * 60 * 1000

export function isOccurrenceExcluded(date: Date | string, excludedDates: readonly string[] | null | undefined): boolean {
  if (excludedDates == null || excludedDates.length === 0)
    return false

  const time = new Date(date).getTime()
  return excludedDates.some(excluded => Math.abs(new Date(excluded).getTime() - time) < EXCLUSION_TOLERANCE_MS)
}

// ─── Expand ───────────────────────────────────────────────────────────────────

const MAX_OCCURRENCES = 500

/**
 * Occurrences within [windowStart, windowEnd], each a spread of the original
 * with `date` overridden. A non-recurring event comes back as [event].
 */
export function expandRecurringEvent<T extends ExpandableEvent>(
  event: T,
  windowStart: Date | string,
  windowEnd: Date | string,
): T[] {
  if (event.recurrence_rule == null || event.recurrence_rule === '')
    return [event]

  const parsed = parseRRule(event.recurrence_rule)
  if (!parsed)
    return [event]

  const winStart = new Date(windowStart)
  const winEnd = new Date(windowEnd)
  const winEndTime = winEnd.getTime()
  const effectiveEndTime = parsed.until != null ? Math.min(winEndTime, parsed.until.getTime()) : winEndTime
  const effectiveWinEnd = new Date(effectiveEndTime)
  const originDate = new Date(event.date)

  if (originDate > winEnd)
    return []

  const results: T[] = []

  const pushIfInWindow = (d: Date) => {
    if (isOccurrenceExcluded(d, event.excluded_dates))
      return null

    if (d >= winStart && d <= effectiveWinEnd && results.length < MAX_OCCURRENCES) {
      results.push({ ...event, date: d.toISOString() })
      return true
    }
    return null
  }

  if (parsed.freq === 'DAILY') {
    const cursor = new Date(originDate)
    let count = 0
    while (cursor.getTime() <= effectiveEndTime && count < MAX_OCCURRENCES) {
      pushIfInWindow(new Date(cursor))
      addDays(cursor, parsed.interval)
      count++
    }
  }
  else if (parsed.freq === 'WEEKLY') {
    if (parsed.byDay.length > 0) {
      const cursor = new Date(originDate)
      cursor.setDate(cursor.getDate() - cursor.getDay()) // rewind to Sunday
      cursor.setHours(
        originDate.getHours(),
        originDate.getMinutes(),
        originDate.getSeconds(),
        originDate.getMilliseconds(),
      )

      let count = 0
      while (cursor.getTime() <= effectiveEndTime && count < MAX_OCCURRENCES) {
        for (const dayCode of parsed.byDay) {
          const dayIndex = DAY_CODE_TO_INDEX[dayCode]
          if (dayIndex === undefined)
            continue

          const occurrence = new Date(cursor)
          occurrence.setDate(cursor.getDate() + dayIndex)
          if (occurrence >= originDate) {
            pushIfInWindow(occurrence)
          }
          count++
          if (count >= MAX_OCCURRENCES)
            break
        }

        addDays(cursor, 7 * parsed.interval)
      }
    }
    else {
      // No BYDAY, so the event's own weekday.
      const cursor = new Date(originDate)
      let count = 0
      while (cursor.getTime() <= effectiveEndTime && count < MAX_OCCURRENCES) {
        pushIfInWindow(new Date(cursor))
        addDays(cursor, 7 * parsed.interval)
        count++
      }
    }
  }
  else if (parsed.freq === 'MONTHLY') {
    const targetDay = parsed.byMonthDay ?? originDate.getDate()

    let cursorTime = new Date(originDate).getTime()
    let count = 0
    while (cursorTime <= effectiveEndTime && count < MAX_OCCURRENCES) {
      const cursor = new Date(cursorTime)
      const candidate = withDate(originDate, cursor.getFullYear(), cursor.getMonth(), targetDay)

      // Skip months where the day overflows, e.g. Feb 31 into March.
      if (candidate.getMonth() === cursor.getMonth()) {
        if (candidate >= originDate) {
          pushIfInWindow(candidate)
        }
      }
      cursorTime = addMonths(cursor, parsed.interval).getTime()
      count++
    }
  }
  else if (parsed.freq === 'YEARLY') {
    let cursorTime = new Date(originDate).getTime()
    let count = 0
    while (cursorTime <= effectiveEndTime && count < MAX_OCCURRENCES) {
      const cursor = new Date(cursorTime)
      pushIfInWindow(new Date(cursor))
      cursorTime = addYears(cursor, parsed.interval).getTime()
      count++
    }
  }

  return results
}

// ─── Humanize ─────────────────────────────────────────────────────────────────

/** Null once the series has ended or when it isn't recurring. */
export function nextOccurrenceDate(event: EventRow, after: Date = new Date()): Date | null {
  if (event.recurrence_rule == null || event.recurrence_rule === '')
    return null

  const occurrences = expandRecurringEvent(
    event,
    after,
    new Date(after.getTime() + 5 * 365 * 24 * 60 * 60 * 1000),
  )
  return occurrences.length > 0 ? new Date(occurrences[0]!.date) : null
}

/**
 * Looks back by `duration_minutes` so an occurrence already in progress is
 * returned instead of skipped for the next one.
 */
export function currentOrNextOccurrenceDate(event: EventRow, now: Date = new Date()): Date | null {
  const lookbackMs = (event.duration_minutes ?? 0) * 60 * 1000
  return nextOccurrenceDate(event, new Date(now.getTime() - lookbackMs))
}

/** True for a recurring series parent that isn't capped with a past UNTIL. */
export function isSeriesActive(event: EventRow, now: Date = new Date()): boolean {
  if (event.recurrence_rule == null || event.recurrence_rule === '' || event.recurrence_parent_id != null)
    return false

  const parsed = parseRRule(event.recurrence_rule)
  if (!parsed)
    return false
  if (parsed.until != null && parsed.until < now)
    return false

  return true
}

export function humanizeRrule(rule: string): string {
  const parsed = parseRRule(rule)
  if (!parsed)
    return 'Repeats'

  const { freq, interval, byDay } = parsed

  if (freq === 'DAILY') {
    if (interval === 1)
      return 'Repeats daily'

    return `Repeats every ${interval} days`
  }

  if (freq === 'WEEKLY') {
    if (byDay.length > 0) {
      const dayNames = byDay
        .map(code => DAY_CODE_TO_NAME[code])
        .filter((name): name is string => name != null && name !== '')
      if (dayNames.length > 0) {
        const dayLabel = dayNames.join(', ')
        if (interval === 1)
          return `Repeats every ${dayLabel}`

        return `Repeats every ${interval} weeks on ${dayLabel}`
      }
    }
    if (interval === 1)
      return 'Repeats weekly'

    return `Repeats every ${interval} weeks`
  }

  if (freq === 'MONTHLY') {
    if (interval === 1)
      return 'Repeats monthly'

    return `Repeats every ${interval} months`
  }

  if (freq === 'YEARLY') {
    if (interval === 1)
      return 'Repeats yearly'

    return `Repeats every ${interval} years`
  }

  return 'Repeats'
}
