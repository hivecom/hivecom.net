/**
 * Badge catalog - single source of truth for badge metadata, icons, labels,
 * descriptions, and tier thresholds.
 *
 * "kind" describes how a badge is earned:
 *  - manual:   granted by admin via admin_set_profile_badge RPC
 *  - flag:     driven by a boolean column on profiles (supporter_patreon, etc.)
 *  - computed: derived from a count or date, upserted by DB triggers / cron
 */

export type BadgeVariant = 'shiny' | 'gold' | 'silver' | 'bronze'

// Ordered from highest to lowest prestige - used for sorting badge lists.
export const BADGE_VARIANT_ORDER: BadgeVariant[] = ['shiny', 'gold', 'silver', 'bronze']

// ---------------------------------------------------------------------------
// Catalog entry shapes
// ---------------------------------------------------------------------------

interface BadgeBase {
  label: string
  icon: string
  description: string
  /** Canonical display order - lower = shown first within same tier. */
  sortOrder: number
}

export interface ManualBadge extends BadgeBase {
  kind: 'manual'
  defaultTier: BadgeVariant
}

export interface FlagBadge extends BadgeBase {
  kind: 'flag'
  defaultTier: BadgeVariant
  /** Column name on `profiles` that drives this badge. */
  driverColumn: string
}

export interface ComputedBadge extends BadgeBase {
  kind: 'computed'
  /**
   * Map of tier -> minimum value (count or years) required.
   * Tiers not listed are not awarded for this badge.
   */
  tiers: Partial<Record<BadgeVariant, number>>
  unit: 'years' | 'rsvps' | 'discussions' | 'replies'
  /**
   * When true, the numeric `progress` value is rendered inside the badge hex
   * instead of the default icon (e.g. the "One of Us" years badge).
   */
  hexShowsProgress?: boolean
}

export type BadgeCatalogEntry = ManualBadge | FlagBadge | ComputedBadge

// ---------------------------------------------------------------------------
// The catalog
// ---------------------------------------------------------------------------

export const BADGE_CATALOG = {
  founder: {
    kind: 'manual',
    defaultTier: 'shiny',
    label: 'Founder',
    icon: 'ph:crown-simple-bold',
    description: 'One of the original founders',
    sortOrder: 0,
  },
  earlybird: {
    kind: 'manual',
    defaultTier: 'gold',
    label: 'Early Bird',
    icon: 'ph:rocket-launch-bold',
    description: 'Joined in the early days of the community',
    sortOrder: 1,
  },
  builder: {
    kind: 'manual',
    defaultTier: 'silver',
    label: 'Builder',
    icon: 'ph:barbell',
    description: 'Contributed to open source development or infrastructure',
    sortOrder: 2,
  },
  host: {
    kind: 'manual',
    defaultTier: 'silver',
    label: 'Host',
    icon: 'ph:users-three-bold',
    description: 'Hosted or organized multiple events for the community.',
    sortOrder: 3,
  },
  supporter: {
    kind: 'flag',
    defaultTier: 'gold',
    label: 'Supporter',
    icon: 'ph:heart-bold',
    description: 'Monthly Patreon supporter of the community',
    driverColumn: 'supporter_patreon',
    sortOrder: 4,
  },
  supporter_lifetime: {
    kind: 'flag',
    defaultTier: 'gold',
    label: 'Lifetime Supporter',
    icon: 'ph:infinity-bold',
    description: 'Contributed to the community in a significant way',
    driverColumn: 'supporter_lifetime',
    sortOrder: 5,
  },
  one_of_us: {
    kind: 'computed',
    label: 'One of Us',
    icon: 'ph:calendar-blank',
    description: 'Member of the community',
    tiers: { shiny: 20, gold: 10, silver: 5, bronze: 1 },
    unit: 'years',
    hexShowsProgress: true,
    sortOrder: 6,
  },
  party_animal: {
    kind: 'computed',
    label: 'Party Animal',
    icon: 'ph:confetti-bold',
    description: 'RSVPd Yes to community events',
    tiers: { gold: 50, silver: 10, bronze: 3 },
    unit: 'rsvps',
    sortOrder: 7,
  },
  forum_regular: {
    kind: 'computed',
    label: 'Forum Regular',
    icon: 'ph:note-pencil-bold',
    description: 'Started forum discussions',
    tiers: { gold: 1000, silver: 100, bronze: 10 },
    unit: 'discussions',
    sortOrder: 8,
  },
  chatterbox: {
    kind: 'computed',
    label: 'Chatterbox',
    icon: 'ph:chats-bold',
    description: 'Posted discussion replies',
    tiers: { gold: 10000, silver: 1000, bronze: 100 },
    unit: 'replies',
    sortOrder: 9,
  },
} as const satisfies Record<string, BadgeCatalogEntry>

export type BadgeSlug = keyof typeof BADGE_CATALOG

// ---------------------------------------------------------------------------
// Threshold helpers (replaces the scattered per-badge functions)
// ---------------------------------------------------------------------------

/**
 * Resolve the earned tier for a computed badge given a progress value.
 * Returns undefined if the value doesn't meet the lowest threshold.
 */
export function getComputedBadgeTier(
  slug: BadgeSlug,
  progress: number,
): BadgeVariant | undefined {
  const entry = BADGE_CATALOG[slug]
  if (entry.kind !== 'computed')
    return undefined

  for (const tier of BADGE_VARIANT_ORDER) {
    const threshold = (entry.tiers as Partial<Record<BadgeVariant, number>>)[tier]
    if (threshold !== undefined && progress >= threshold)
      return tier
  }
  return undefined
}

/**
 * Minimum progress value required to earn any tier of a computed badge.
 */
export function getComputedBadgeMinProgress(slug: BadgeSlug): number {
  const entry = BADGE_CATALOG[slug]
  if (entry.kind !== 'computed')
    return 0

  const values = Object.values(entry.tiers as Partial<Record<BadgeVariant, number>>).filter(
    (v): v is number => v !== undefined,
  )
  return values.length > 0 ? Math.min(...values) : 0
}

// ---------------------------------------------------------------------------
// Backwards-compatible wrappers (preserves existing call-sites until step 3)
// ---------------------------------------------------------------------------

export const DISCUSSION_STARTER_THRESHOLDS = BADGE_CATALOG.forum_regular.tiers as Record<'gold' | 'silver' | 'bronze', number>
export const DISCUSSION_STARTER_MIN_COUNT = DISCUSSION_STARTER_THRESHOLDS.bronze

export function getVariantDiscussionStarter(count: number | null | undefined): 'gold' | 'silver' | 'bronze' | undefined {
  const safeCount = typeof count === 'number' && Number.isFinite(count) ? count : 0
  return getComputedBadgeTier('forum_regular', safeCount) as 'gold' | 'silver' | 'bronze' | undefined
}

export const DISCUSSION_REPLY_THRESHOLDS = BADGE_CATALOG.chatterbox.tiers as Record<'gold' | 'silver' | 'bronze', number>
export const DISCUSSION_REPLY_MIN_COUNT = DISCUSSION_REPLY_THRESHOLDS.bronze

export function getVariantDiscussionReply(count: number | null | undefined): 'gold' | 'silver' | 'bronze' | undefined {
  const safeCount = typeof count === 'number' && Number.isFinite(count) ? count : 0
  return getComputedBadgeTier('chatterbox', safeCount) as 'gold' | 'silver' | 'bronze' | undefined
}

export const PARTY_ANIMAL_BADGE_THRESHOLDS = BADGE_CATALOG.party_animal.tiers as Record<'gold' | 'silver' | 'bronze', number>
export const PARTY_ANIMAL_BADGETHRESHOLDS = PARTY_ANIMAL_BADGE_THRESHOLDS // legacy typo alias
export const PARTY_ANIMAL_MIN_RSVPS = PARTY_ANIMAL_BADGE_THRESHOLDS.bronze

export function getVariantPartyAnimal(rsvpCount: number | null | undefined): 'gold' | 'silver' | 'bronze' | undefined {
  const safeCount = typeof rsvpCount === 'number' && Number.isFinite(rsvpCount) ? rsvpCount : 0
  return getComputedBadgeTier('party_animal', safeCount) as 'gold' | 'silver' | 'bronze' | undefined
}
