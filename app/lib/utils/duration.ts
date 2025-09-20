/**
 * Formats a duration in milliseconds to a human-readable string
 * @param milliseconds The duration in milliseconds
 * @returns Formatted duration string (e.g., "2 weeks 3 days", "1 day 2 hours", "45 minutes", "1 hour")
 */
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
  if (hours > 0 && weeks === 0) { // Don't show hours if we have weeks
    parts.push(`${hours} hour${hours === 1 ? '' : 's'}`)
  }
  if (minutes > 0 && weeks === 0 && days === 0) { // Only show minutes if no weeks or days
    parts.push(`${minutes} minute${minutes === 1 ? '' : 's'}`)
  }

  return parts.join(' ')
}

/**
 * Formats a duration in minutes to a human-readable string
 * @param minutes The duration in minutes
 * @returns Formatted duration string (e.g., "2 weeks 3 days", "1 day 2 hours", "45 minutes", "1 hour")
 */
export function formatDurationFromMinutes(minutes: number | null): string {
  if (minutes === null || minutes === undefined || minutes <= 0)
    return ''

  // Convert minutes to milliseconds and use the main formatter
  return formatDuration(minutes * 60 * 1000)
}
