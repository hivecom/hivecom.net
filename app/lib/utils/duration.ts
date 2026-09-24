// TODO: check how much can be replaced with dayjs
// https://day.js.org/docs/en/durations/durations

/**
 * `M:SS`, or `H:MM:SS` past an hour. Non-finite or negative input reads `0:00`.
 */
export function formatClock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0)
    return '0:00'

  const total = Math.floor(seconds)
  const hours = Math.floor(total / 3600)
  const mins = Math.floor((total % 3600) / 60)
  const secs = total % 60
  const ss = secs.toString().padStart(2, '0')
  if (hours > 0)
    return `${hours}:${mins.toString().padStart(2, '0')}:${ss}`

  return `${mins}:${ss}`
}

/**
 * Formats a past duration in milliseconds to a human-readable "X ago" string.
 * Returns "Just now" for sub-minute durations.
 *
 * @deprecated use `/lib/date`'s `formatTimeAgo`
 */
export function formatTimeAgo(diffMs: number): string {
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

/** e.g. "2 weeks 3 days", "1 day 2 hours", "45 minutes" */
export function formatDuration(milliseconds: number | null): string {
  if (milliseconds === null || milliseconds === undefined || milliseconds <= 0)
    return ''

  const totalMinutes = Math.floor(milliseconds / (1000 * 60))
  const totalHours = Math.floor(totalMinutes / 60)
  const totalDays = Math.floor(totalHours / 24)
  const totalWeeks = Math.floor(totalDays / 7)

  const weeks = totalWeeks
  const days = totalDays % 7
  const hours = totalHours % 24
  const minutes = totalMinutes % 60

  const parts: string[] = []

  if (weeks > 0) {
    parts.push(`${weeks} week${weeks === 1 ? '' : 's'}`)
  }
  if (days > 0) {
    parts.push(`${days} day${days === 1 ? '' : 's'}`)
  }
  if (hours > 0 && weeks === 0) {
    parts.push(`${hours} hour${hours === 1 ? '' : 's'}`)
  }
  if (minutes > 0 && weeks === 0 && days === 0) {
    parts.push(`${minutes} minute${minutes === 1 ? '' : 's'}`)
  }

  return parts.join(' ')
}

export function formatDurationFromMinutes(minutes: number | null): string {
  if (minutes === null || minutes === undefined || minutes <= 0)
    return ''

  return formatDuration(minutes * 60 * 1000)
}

/** e.g. "3 days" or "1 year, 3 months". `endDate` defaults to now. */
export function calculateDurationBetweenDates(startDate: string, endDate?: string | null): string {
  const start = new Date(startDate)
  const end = endDate != null && endDate.length > 0 ? new Date(endDate) : new Date()

  const diffTime = Math.abs(end.getTime() - start.getTime())
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24))

  const years = Math.floor(diffDays / 365)
  const remainingAfterYears = diffDays % 365
  const months = Math.floor(remainingAfterYears / 30)
  const days = remainingAfterYears % 30

  const parts: string[] = []
  if (years > 0)
    parts.push(`${years} year${years > 1 ? 's' : ''}`)
  if (months > 0)
    parts.push(`${months} month${months > 1 ? 's' : ''}`)
  if (days > 0 || parts.length === 0)
    parts.push(`${days} day${days !== 1 ? 's' : ''}`)

  return parts.join(', ')
}

/** e.g. "23h", "3d" */
export function formatDurationCompact(milliseconds: number | null): string {
  if (milliseconds === null || milliseconds === undefined || milliseconds <= 0)
    return ''

  const totalSeconds = Math.floor(milliseconds / 1000)
  const totalMinutes = Math.floor(totalSeconds / 60)
  const totalHours = Math.floor(totalMinutes / 60)
  const totalDays = Math.floor(totalHours / 24)

  if (totalDays >= 1)
    return `${totalDays}d`

  if (totalHours >= 1)
    return `${totalHours}h`

  if (totalMinutes >= 1)
    return `${totalMinutes}m`

  const seconds = Math.max(1, totalSeconds)
  return `${seconds}s`
}
