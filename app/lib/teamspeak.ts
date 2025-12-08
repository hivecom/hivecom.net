import type { Tables } from '@/types/database.types'
import type { TeamSpeakIdentityRecord } from '@/types/teamspeak'

export function normalizeTeamSpeakIdentities(
  value: Tables<'profiles'>['teamspeak_identities'] | TeamSpeakIdentityRecord[] | null | undefined,
): TeamSpeakIdentityRecord[] {
  if (!Array.isArray(value))
    return []

  const normalized: TeamSpeakIdentityRecord[] = []

  value.forEach((entry) => {
    if (entry === null || entry === undefined || typeof entry !== 'object')
      return

    const serverId = (entry as { serverId?: unknown }).serverId
    const uniqueId = (entry as { uniqueId?: unknown }).uniqueId
    const linkedAt = (entry as { linkedAt?: unknown }).linkedAt

    if (typeof serverId !== 'string' || typeof uniqueId !== 'string')
      return

    normalized.push({
      serverId,
      uniqueId,
      linkedAt: typeof linkedAt === 'string' ? linkedAt : undefined,
    })
  })

  return normalized
}

export function identityKey(identity: TeamSpeakIdentityRecord): string {
  return `${identity.serverId}:${identity.uniqueId}`
}
