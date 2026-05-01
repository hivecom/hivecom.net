import type { Tables } from '@/types/database.overrides'

// ─── Types ────────────────────────────────────────────────────────────────────

type EventRow = Tables<'events'>

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

  // UNTIL can be UTC datetime (20250615T120000Z) or date-only (20250615).
  // The value is already uppercased by the loop above.
  const untilRaw = parts.UNTIL
  let until: Date | null = null
  if (untilRaw != null && untilRaw !== '') {
    // Normalise date-only to an ISO-like string so Date can parse it
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

/** Clone a Date and set its UTC date part, preserving the time-of-day. */
function withDate(original: Date, year: number, month: number, day: number): Date {
  const d = new Date(original)
  d.setFullYear(year, month, day)
  return d
}

/** Advance `d` by `n` days in-place and return it. */
function addDays(d: Date, n: number): Date {
  d.setDate(d.getDate() + n)
  return d
}

/** Return a new Date advanced by `n` months from `d`. */
function addMonths(d: Date, n: number): Date {
  const result = new Date(d)
  result.setMonth(result.getMonth() + n)
  return result
}

/** Return a new Date advanced by `n` years from `d`. */
function addYears(d: Date, n: number): Date {
  const result = new Date(d)
  result.setFullYear(result.getFullYear() + n)
  return result
}

// ─── Expand ───────────────────────────────────────────────────────────────────

const MAX_OCCURRENCES = 500

/**
 * Expands a recurring event into virtual occurrences within [windowStart, windowEnd].
 * For non-recurring events (no recurrence_rule), returns [event] unchanged.
 * Each synthetic occurrence is a spread of the original with `date` overridden.
 */
export function expandRecurringEvent(
  event: EventRow,
  windowStart: Date | string,
  windowEnd: Date | string,
): EventRow[] {
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

  // If the origin is after the window, there's nothing to generate.
  if (originDate > winEnd)
    return []

  const results: EventRow[] = []

  const pushIfInWindow = (d: Date) => {
    if (d >= winStart && d <= effectiveWinEnd && results.length < MAX_OCCURRENCES) {
      results.push({ ...event, date: d.toISOString() })
      return true
    }
    return null
  }

  if (parsed.freq === 'DAILY') {
    // Start from originDate, step forward by interval days until we pass effectiveEndTime
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
      // Generate one occurrence per listed weekday per week-interval
      // Find the start of the week containing originDate (Sunday=0)
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
        // Advance by interval weeks
        addDays(cursor, 7 * parsed.interval)
      }
    }
    else {
      // No BYDAY - use the event's own weekday, step by interval weeks
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
    // Walk month by month from origin
    let cursorTime = new Date(originDate).getTime()
    let count = 0
    while (cursorTime <= effectiveEndTime && count < MAX_OCCURRENCES) {
      const cursor = new Date(cursorTime)
      const candidate = withDate(originDate, cursor.getFullYear(), cursor.getMonth(), targetDay)
      // Make sure the day didn't overflow (e.g. Feb 31 -> March)
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

/**
 * Converts an iCal RRULE string into a human-readable recurrence label.
 *
 * Examples:
 *   "FREQ=DAILY"               -> "Repeats daily"
 *   "FREQ=DAILY;INTERVAL=2"    -> "Repeats every 2 days"
 *   "FREQ=WEEKLY"              -> "Repeats weekly"
 *   "FREQ=WEEKLY;INTERVAL=2"   -> "Repeats every 2 weeks"
 *   "FREQ=WEEKLY;BYDAY=SA"     -> "Repeats every Saturday"
 *   "FREQ=WEEKLY;BYDAY=MO,WE"  -> "Repeats every Monday, Wednesday"
 *   "FREQ=MONTHLY"             -> "Repeats monthly"
 *   "FREQ=YEARLY"              -> "Repeats yearly"
 *   fallback                   -> "Repeats"
 */
/**
 * Returns the next occurrence of a recurring event at or after `after`.
 * Returns null if the series has ended (UNTIL passed) or is non-recurring.
 */
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
 * Returns true when the event is a recurring series parent that still has
 * future occurrences (i.e. not capped with a past UNTIL).
 * Used by RSVP components to avoid treating ended series as active.
 */
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
      if (dayNames.length > 0)
        return `Repeats every ${dayNames.join(', ')}`
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
