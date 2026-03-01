export type BadgeVariant = 'shiny' | 'gold' | 'silver' | 'bronze'
type DiscussionBadgeVariant = Extract<BadgeVariant, 'gold' | 'silver' | 'bronze'>

// --- Forum Regular (discussions started) ---

export const DISCUSSION_STARTER_THRESHOLDS: Record<DiscussionBadgeVariant, number> = {
  gold: 1000,
  silver: 100,
  bronze: 10,
}

export const DISCUSSION_STARTER_MIN_COUNT = DISCUSSION_STARTER_THRESHOLDS.bronze

export function getDiscussionStarterVariant(count: number | null | undefined): DiscussionBadgeVariant | undefined {
  const safeCount = typeof count === 'number' && Number.isFinite(count) ? count : 0

  if (safeCount >= DISCUSSION_STARTER_THRESHOLDS.gold)
    return 'gold'
  if (safeCount >= DISCUSSION_STARTER_THRESHOLDS.silver)
    return 'silver'
  if (safeCount >= DISCUSSION_STARTER_THRESHOLDS.bronze)
    return 'bronze'

  return undefined
}

// --- Chatterbox (discussion replies) ---

export const DISCUSSION_REPLY_THRESHOLDS: Record<DiscussionBadgeVariant, number> = {
  gold: 10000,
  silver: 1000,
  bronze: 100,
}

export const DISCUSSION_REPLY_MIN_COUNT = DISCUSSION_REPLY_THRESHOLDS.bronze

export function getDiscussionReplyVariant(count: number | null | undefined): DiscussionBadgeVariant | undefined {
  const safeCount = typeof count === 'number' && Number.isFinite(count) ? count : 0

  if (safeCount >= DISCUSSION_REPLY_THRESHOLDS.gold)
    return 'gold'
  if (safeCount >= DISCUSSION_REPLY_THRESHOLDS.silver)
    return 'silver'
  if (safeCount >= DISCUSSION_REPLY_THRESHOLDS.bronze)
    return 'bronze'

  return undefined
}
