export type BadgeVariant = 'shiny' | 'gold' | 'silver' | 'bronze'
type PartyAnimalVariant = Extract<BadgeVariant, 'gold' | 'silver' | 'bronze'>

// TODO: This shouldn't be here there's a better way to share this logic

export const PARTY_ANIMAL_BADGETHRESHOLDS: Record<PartyAnimalVariant, number> = {
  gold: 50,
  silver: 10,
  bronze: 3,
}

export const PARTY_ANIMAL_MIN_RSVPS = PARTY_ANIMAL_BADGETHRESHOLDS.bronze

export function getPartyAnimalVariant(rsvpCount: number | null | undefined): PartyAnimalVariant | undefined {
  const safeCount = typeof rsvpCount === 'number' && Number.isFinite(rsvpCount) ? rsvpCount : 0

  if (safeCount >= PARTY_ANIMAL_BADGETHRESHOLDS.gold)
    return 'gold'
  if (safeCount >= PARTY_ANIMAL_BADGETHRESHOLDS.silver)
    return 'silver'
  if (safeCount >= PARTY_ANIMAL_BADGETHRESHOLDS.bronze)
    return 'bronze'

  return undefined
}
