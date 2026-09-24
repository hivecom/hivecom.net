// Compares calendar days, so an expense starting today is already active.
export function isPlannedExpense(startDate: string): boolean {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const start = new Date(startDate)
  start.setHours(0, 0, 0, 0)
  return start > today
}

export function getExpenseStatus(startedAt: string, endedAt: string | null): 'Planned' | 'Active' | 'Ended' {
  if (isPlannedExpense(startedAt))
    return 'Planned'
  if (endedAt != null && endedAt !== '')
    return 'Ended'

  return 'Active'
}
