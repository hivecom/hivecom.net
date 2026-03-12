// Re-exported from lib/badges.ts - this file is kept for backwards compatibility.
// Import directly from '@/lib/badges' in new code.
export type { BadgeVariant } from '@/lib/badges'
export { getPartyAnimalVariant, PARTY_ANIMAL_BADGE_THRESHOLDS, PARTY_ANIMAL_MIN_RSVPS } from '@/lib/badges'

// Legacy alias so existing callers that reference the old typo name still compile.
export { PARTY_ANIMAL_BADGE_THRESHOLDS as PARTY_ANIMAL_BADGETHRESHOLDS } from '@/lib/badges'
