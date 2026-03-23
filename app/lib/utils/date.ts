import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'

dayjs.extend(relativeTime)

export const dateFormat = {
  display: 'dddd YYYY-MM-DD',
  displayTime: 'dddd YYYY-MM-DD, HH:mm',
  default: 'YYYY-MM-DD, HH:mm',
  calendarDefault: 'YYYY-MM-DD',
  time: 'HH:mm',
}

/**
 * @deprecated Produces a non-standard format ("YYYY-MM-DD, HH:mm") that
 * differs from all other date helpers in this file.  Prefer:
 * - `formatDateShort`    → "Jan 5, 2025"
 * - `formatDateLong`     → "January 5, 2025"
 * - `formatDateWithTime` → "Jan 5, 2025, 02:30 PM"
 * - `formatDate` from dayjs directly if you need a custom format string
 *
 * This function is not imported anywhere in the app - it exists only for
 * backwards compatibility.  Remove once confirmed unused.
 */
export function formatDate(dateStr: string) {
  return dayjs(dateStr).format(dateFormat.default)
}

// Format month helper
export function formatMonth(month: string): string {
  return new Date(`${month}T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  })
}

export function formatTime(dateStr: string) {
  return dayjs(dateStr).format(dateFormat.time)
}

export function formatSimpleDate(dateStr: string) {
  return dayjs(dateStr).format(dateFormat.display)
}

/**
 * Serialises a Date object to a YYYY-MM-DD string suitable for HTML date
 * inputs and database birthday columns.  Uses local calendar values so the
 * result matches what the user sees in the date picker.
 */
export function formatDateOnly(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * Formats a date string as a short human-readable date: "Jan 5, 2025".
 * Returns 'Unknown' when the value is falsy or not a valid date.
 */
export function formatDateShort(dateString: string | null | undefined): string {
  if (dateString == null || dateString === '')
    return 'Unknown'
  const parsed = new Date(dateString)
  if (Number.isNaN(parsed.getTime()))
    return 'Unknown'
  return parsed.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

/**
 * Formats a date string as a long human-readable date: "January 5, 2025".
 * Returns 'Unknown' when the value is falsy or not a valid date.
 */
export function formatDateLong(dateString: string | null | undefined): string {
  if (dateString == null || dateString === '')
    return 'Unknown'
  const parsed = new Date(dateString)
  if (Number.isNaN(parsed.getTime()))
    return 'Unknown'
  return parsed.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

/**
 * Formats a date string with time: "Jan 5, 2025, 02:30 PM".
 * Returns 'Unknown' when the value is falsy or not a valid date.
 */
export function formatDateWithTime(dateString: string | null | undefined): string {
  if (dateString == null || dateString === '')
    return 'Unknown'
  const parsed = new Date(dateString)
  if (Number.isNaN(parsed.getTime()))
    return 'Unknown'
  return parsed.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * Compute the set of MM-DD patterns that cover "today" across all timezones.
 * We offset the current UTC time by -12h and +12h, then collect the unique
 * month-day strings so a birthday filter catches every user whose local date
 * is "today".
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
 * Checks whether a birthday date string (YYYY-MM-DD) falls on "today",
 * accounting for timezone drift (±12 h around UTC).
 *
 * Returns `false` for null/undefined/empty values.
 */
export function isBirthdayDateToday(birthday: string | null | undefined): boolean {
  if (birthday == null || birthday === '')
    return false
  const mmdd = birthday.slice(5) // "YYYY-MM-DD" → "MM-DD"
  return getBirthdayPatterns().includes(mmdd)
}

/**
 * Returns a human-readable relative time string, e.g. "3 minutes ago", "2 days ago".
 * Returns an empty string when the value is falsy or not a valid date.
 */
export function formatTimeAgo(dateString: string | null | undefined): string {
  if (dateString == null || dateString === '')
    return ''
  const parsed = dayjs(dateString)
  if (!parsed.isValid())
    return ''
  return parsed.fromNow()
}
