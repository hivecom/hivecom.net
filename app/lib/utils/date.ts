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

// Format date for display
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
