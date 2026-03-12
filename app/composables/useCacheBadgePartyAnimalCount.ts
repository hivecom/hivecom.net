/**
 * Cached "Party Animal" RSVP count for a given user.
 *
 * Thin wrapper around the generic `useCacheBadgeCount` factory.
 * Counts all "yes" RSVPs a user has made across all events.
 */

import type { Ref } from 'vue'
import type { CacheConfig } from './useCache'
import { useCacheBadgeCount } from './useCacheBadgeCount'

interface PartyAnimalCountOptions extends Omit<CacheConfig, 'ttl'> {
  enabled?: Ref<boolean> | boolean
  ttl?: number
  cacheKeyPrefix?: string
}

export function useCacheBadgePartyAnimalCount(
  userId: Ref<string | null | undefined> | string | null | undefined,
  options: PartyAnimalCountOptions = {},
) {
  const {
    cacheKeyPrefix = 'user:life_of_party_yes_rsvps',
    ...rest
  } = options

  return useCacheBadgeCount(userId, {
    cacheKeyPrefix,
    badgeName: 'Party Animal (yes RSVPs)',
    ...rest,
    fetchCount: async (supabase, profileId) => {
      const { count, error } = await supabase
        .from('events_rsvps')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', profileId)
        .eq('rsvp', 'yes')

      if (error)
        throw error

      return count ?? 0
    },
  })
}
