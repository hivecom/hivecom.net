import dayjs from 'dayjs'

export const dateFormat = {
  display: 'dddd YYYY-MM-DD',
  displayTime: 'dddd YYYY-MM-DD, HH:mm',
  default: 'YYYY-MM-DD, HH:mm',
  calendarDefault: 'YYYY-MM-DD',
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
