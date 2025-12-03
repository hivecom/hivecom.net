export type BadgeVariant = 'shiny' | 'gold' | 'silver' | 'bronze'
type LifeOfPartyVariant = Extract<BadgeVariant, 'silver' | 'bronze'>

// TODO: This shouldn't be here there's a better way to dshare this logic

export const PARTY_ANIMAL_BADGETHRESHOLDS: Record<LifeOfPartyVariant, number> = {
  silver: 10,
  bronze: 3,
}

export const LIFE_OF_PARTY_MIN_RSVPS = PARTY_ANIMAL_BADGETHRESHOLDS.bronze

export function getLifeOfThePartyVariant(rsvpCount: number | null | undefined): LifeOfPartyVariant | undefined {
  const safeCount = typeof rsvpCount === 'number' && Number.isFinite(rsvpCount) ? rsvpCount : 0

  if (safeCount >= PARTY_ANIMAL_BADGETHRESHOLDS.silver)
    return 'silver'
  if (safeCount >= PARTY_ANIMAL_BADGETHRESHOLDS.bronze)
    return 'bronze'

  return undefined
}
