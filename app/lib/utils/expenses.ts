/**
 * Returns true if the expense's start date is in the future (i.e. not yet active).
 */
export function isPlannedExpense(startDate: string): boolean {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const start = new Date(startDate)
  start.setHours(0, 0, 0, 0)
  return start > today
}

/**
 * Derives the display status of an expense from its dates.
 */
export function getExpenseStatus(startedAt: string, endedAt: string | null): 'Planned' | 'Active' | 'Ended' {
  if (isPlannedExpense(startedAt))
    return 'Planned'
  if (endedAt != null && endedAt !== '')
    return 'Ended'
  return 'Active'
}
