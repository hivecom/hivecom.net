/**
 * Display formatters use the browser's locale, except fromNow which is always
 * English. The non-display helpers produce locale-independent strings for
 * inputs and database values.
 */

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function parse(date: string | Date | null | undefined): Date | null {
  if (date == null || date === '')
    return null

  const d = typeof date === 'string' ? new Date(date) : date
  return Number.isNaN(d.getTime()) ? null : d
}

// ---------------------------------------------------------------------------
// Display formatters (all locale-aware)
// ---------------------------------------------------------------------------

/**
 * English relative time, e.g. "3 minutes ago". Empty for null or invalid input.
 *
 * Pass `now`, usually the shared tick from useNow, or the value never ages.
 * `style` 'narrow' reads "3h ago".
 */
export function fromNow(
  date: string | Date | null | undefined,
  now: number = Date.now(),
  style: Intl.RelativeTimeFormatStyle = 'long',
): string {
  const d = parse(date)
  if (!d)
    return ''

  const diffMs = d.getTime() - now
  const diffSecs = Math.round(diffMs / 1000)
  const absSecs = Math.abs(diffSecs)

  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto', style })

  if (absSecs < 60)
    return rtf.format(diffSecs, 'second')
  if (absSecs < 3600)
    return rtf.format(Math.round(diffSecs / 60), 'minute')
  if (absSecs < 86400)
    return rtf.format(Math.round(diffSecs / 3600), 'hour')
  if (absSecs < 604800)
    return rtf.format(Math.round(diffSecs / 86400), 'day')
  if (absSecs < 2592000)
    return rtf.format(Math.round(diffSecs / 604800), 'week')
  if (absSecs < 31536000)
    return rtf.format(Math.round(diffSecs / 2592000), 'month')

  return rtf.format(Math.round(diffSecs / 31536000), 'year')
}

/**
 * Short date in locale-dependent order, e.g. "05/01/2025" (en-GB) or
 * "01/05/2025" (en-US).
 */
export function displayDate(date: string | Date | null | undefined): string {
  const d = parse(date)
  if (!d)
    return 'Unknown'

  return new Intl.DateTimeFormat(undefined, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(d)
}

/** e.g. "05/01/2025, 14:30" */
export function displayDateTime(date: string | Date | null | undefined): string {
  const d = parse(date)
  if (!d)
    return 'Unknown'

  return new Intl.DateTimeFormat(undefined, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d)
}

/** e.g. "Jan 5, 2025" */
export function fullDate(date: string | Date | null | undefined): string {
  const d = parse(date)
  if (!d)
    return 'Unknown'

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(d)
}

/** e.g. "Jan 5, 2025, 2:30 PM" */
export function fullDateTime(date: string | Date | null | undefined): string {
  const d = parse(date)
  if (!d)
    return 'Unknown'

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d)
}

/** e.g. "January 5, 2025" */
export function fullDateLong(date: string | Date | null | undefined): string {
  const d = parse(date)
  if (!d)
    return 'Unknown'

  return new Intl.DateTimeFormat(undefined, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(d)
}

/**
 * e.g. "September 1, 2026". Formats in UTC so a date-only value shows the same
 * calendar day in every timezone.
 */
export function calendarDateLong(date: string | Date | null | undefined): string {
  const d = parse(date)
  if (!d)
    return 'Unknown'

  return new Intl.DateTimeFormat(undefined, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(d)
}

/** e.g. "January 2025". Also accepts a bare "YYYY-MM". */
export function fullMonth(date: string | Date | null | undefined): string {
  // A bare "YYYY-MM" parses as UTC and can land in the previous month locally.
  // Adding a time makes it parse as local.
  if (typeof date === 'string' && /^\d{4}-\d{2}$/.test(date))
    date = `${date}T00:00:00`

  const d = parse(date)
  if (!d)
    return 'Unknown'

  return new Intl.DateTimeFormat(undefined, {
    month: 'long',
    year: 'numeric',
  }).format(d)
}

/** e.g. "Monday, Jan 5, 2025, 2:30 PM" */
export function fullDateTimeWeekday(date: string | Date | null | undefined): string {
  const d = parse(date)
  if (!d)
    return 'Unknown'

  return new Intl.DateTimeFormat(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d)
}

export function yearOnly(date: string | Date | null | undefined): string {
  const d = parse(date)
  if (!d)
    return 'Unknown'

  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
  }).format(d)
}

export function timestamp(date: string | Date | null | undefined): string {
  const d = parse(date)
  if (!d)
    return ''

  return d.toISOString()
}

/** Local time for detail tooltips, e.g. "2026-09-13 10:09:18". */
export function timestampDetail(date: string | Date | null | undefined): string | null {
  const d = parse(date)
  if (!d)
    return null

  const pad = (n: number) => String(n).padStart(2, '0')

  const day = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`

  return `${day} ${time}`
}

// ---------------------------------------------------------------------------
// Non-display utilities (locale-independent)
// ---------------------------------------------------------------------------

/**
 * YYYY-MM-DD for date inputs and birthday columns. Uses local calendar values
 * so it matches what the date picker shows.
 */
export function formatDateOnly(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

// MM-DD patterns covering "today" in every timezone, UTC plus or minus 12h.
export function getBirthdayPatterns(): string[] {
  const now = Date.now()
  const minus12h = new Date(now - 12 * 60 * 60 * 1000)
  const plus12h = new Date(now + 12 * 60 * 60 * 1000)

  const pad = (n: number) => String(n).padStart(2, '0')
  const toMD = (d: Date) => `${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`

  const patterns = new Set([toMD(minus12h), toMD(new Date(now)), toMD(plus12h)])
  return [...patterns]
}

export function isBirthdayDateToday(birthday: string | null | undefined): boolean {
  if (birthday == null || birthday === '')
    return false

  const mmdd = birthday.slice(5) // "YYYY-MM-DD" to "MM-DD"
  return getBirthdayPatterns().includes(mmdd)
}

/** e.g. "2:30 PM" (en-US) or "14:30" (en-GB) */
export function formatTime(date: string | Date | null | undefined): string {
  const d = parse(date)
  if (!d)
    return 'Unknown'

  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  }).format(d)
}
