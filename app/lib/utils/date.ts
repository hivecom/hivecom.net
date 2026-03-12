import dayjs from 'dayjs'

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
