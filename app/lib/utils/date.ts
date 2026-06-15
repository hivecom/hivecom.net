/**
 * Date formatting utilities.
 *
 * Display functions use the browser's locale via the Intl APIs so output
 * adapts automatically to the user's region and language settings.
 * Exception: relative time strings (fromNow) are always English.
 *
 * Non-display helpers (formatDateOnly, getBirthdayPatterns, isBirthdayDateToday)
 * produce locale-independent strings for inputs or database values.
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
 * Returns a locale-aware relative time string, e.g. "3 minutes ago" or
 * "il y a 3 minutes" for a French browser.
 * Returns an empty string for null/invalid values.
 */
export function fromNow(date: string | Date | null | undefined): string {
  const d = parse(date)
  if (!d)
    return ''

  const diffMs = d.getTime() - Date.now()
  const diffSecs = Math.round(diffMs / 1000)
  const absSecs = Math.abs(diffSecs)

  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })

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
 * Returns 'Unknown' for null/invalid values.
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

/**
 * Short date + time in locale-dependent format, e.g. "05/01/2025, 14:30".
 * Returns 'Unknown' for null/invalid values.
 */
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

/**
 * Full date with abbreviated month name, e.g. "Jan 5, 2025" or "5 jan. 2025".
 * Returns 'Unknown' for null/invalid values.
 */
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

/**
 * Full date with abbreviated month name and time, e.g. "Jan 5, 2025, 2:30 PM".
 * Returns 'Unknown' for null/invalid values.
 */
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

/**
 * Full date with long month name, e.g. "January 5, 2025".
 * Returns 'Unknown' for null/invalid values.
 */
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
 * Month and year only, e.g. "January 2025" or "janvier 2025".
 * Accepts a full date string, a Date object, or a "YYYY-MM" string.
 * Returns 'Unknown' for null/invalid values.
 */
export function fullMonth(date: string | Date | null | undefined): string {
  // Handle bare "YYYY-MM" strings without appending a time component that
  // could shift the date across a UTC boundary into the wrong month.
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

/**
 * Full date with weekday, abbreviated month name, and time,
 * e.g. "Monday, Jan 5, 2025, 2:30 PM" or "lundi 5 janv. 2025 à 14:30".
 * Returns 'Unknown' for null/invalid values.
 */
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

/**
 * Year only, e.g. "2025".
 * Returns 'Unknown' for null/invalid values.
 */
export function yearOnly(date: string | Date | null | undefined): string {
  const d = parse(date)
  if (!d)
    return 'Unknown'
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
  }).format(d)
}

/**
 * ISO 8601 timestamp string for display purposes, e.g. "2025-01-05T14:30:00.000Z".
 * Returns an empty string for null/invalid values.
 */
export function timestamp(date: string | Date | null | undefined): string {
  const d = parse(date)
  if (!d)
    return ''
  return d.toISOString()
}

// ---------------------------------------------------------------------------
// Non-display utilities (locale-independent)
// ---------------------------------------------------------------------------

/**
 * Serialises a Date to a YYYY-MM-DD string suitable for HTML date inputs and
 * database birthday columns. Uses local calendar values so the result matches
 * what the user sees in the date picker.
 */
export function formatDateOnly(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * Compute the set of MM-DD patterns that cover "today" across all timezones.
 * Offsets UTC by ±12 h so a birthday filter catches every user whose local
 * date is "today".
 */
export function getBirthdayPatterns(): string[] {
  const now = Date.now()
  const minus12h = new Date(now - 12 * 60 * 60 * 1000)
  const plus12h = new Date(now + 12 * 60 * 60 * 1000)

  const pad = (n: number) => String(n).padStart(2, '0')
  const toMD = (d: Date) => `${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`

  const patterns = new Set([toMD(minus12h), toMD(new Date(now)), toMD(plus12h)])
  return [...patterns]
}

/**
 * Returns true if a YYYY-MM-DD birthday string falls on "today", accounting
 * for timezone drift (±12 h around UTC).
 */
export function isBirthdayDateToday(birthday: string | null | undefined): boolean {
  if (birthday == null || birthday === '')
    return false
  const mmdd = birthday.slice(5) // "YYYY-MM-DD" → "MM-DD"
  return getBirthdayPatterns().includes(mmdd)
}

/**
 * Time only in locale-aware format, e.g. "2:30 PM" (en-US) or "14:30" (en-GB).
 * Returns 'Unknown' for null/invalid values.
 *
 * Previously produced a hardcoded "HH:mm" string - now locale-aware.
 */
export function formatTime(date: string | Date | null | undefined): string {
  const d = parse(date)
  if (!d)
    return 'Unknown'
  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  }).format(d)
}
