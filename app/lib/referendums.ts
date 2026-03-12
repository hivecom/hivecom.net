export type ReferendumStatus = 'active' | 'upcoming' | 'concluded'

export type ReferendumStatusVariant = 'success' | 'warning' | 'neutral'

/**
 * Determines the current status of a referendum based on its start and end dates.
 */
export function getReferendumStatus(referendum: { date_start: string, date_end: string }): ReferendumStatus {
  const now = new Date()
  const start = new Date(referendum.date_start)
  const end = new Date(referendum.date_end)

  if (now < start)
    return 'upcoming'
  if (now > end)
    return 'concluded'
  return 'active'
}

/**
 * Maps a referendum status to its corresponding VUI badge variant.
 */
export function getReferendumStatusVariant(status: ReferendumStatus): ReferendumStatusVariant {
  switch (status) {
    case 'active':
      return 'success'
    case 'upcoming':
      return 'warning'
    case 'concluded':
      return 'neutral'
  }
}
