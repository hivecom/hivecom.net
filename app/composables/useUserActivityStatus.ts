import type { MaybeRefOrGetter } from 'vue'
import type { UserActivityStatus } from '@/lib/lastSeen'
import { computed, toValue } from 'vue'
import { useNow } from '@/composables/useNow'
import { useUserId } from '@/composables/useUserId'
import { getUserActivityStatus } from '@/lib/lastSeen'

/**
 * The signed-in user is always online. Don't reimplement the "is this me?"
 * check inline: useSupabaseUser().value holds JWT claims with the id in `sub`,
 * so comparing its .id fails intermittently. useUserId() reads `sub`.
 */
export function useUserActivityStatus(
  userId: MaybeRefOrGetter<string | null | undefined>,
  lastSeen: MaybeRefOrGetter<string | Date | null | undefined>,
) {
  const currentUserId = useUserId()

  // Shared clock tick, so a user drops from online to offline as their
  // last_seen ages instead of holding whatever state the first render saw.
  const { now } = useNow()

  return computed<UserActivityStatus | null>(() => {
    const id = toValue(userId)

    // Checked before last_seen so your own status never depends on stale or
    // missing DB data.
    if (id && currentUserId.value && id === currentUserId.value) {
      return {
        isActive: true,
        isAway: false,
        lastSeenText: 'Online',
        lastSeenTimestamp: new Date(),
      }
    }

    const ls = toValue(lastSeen)
    if (!ls)
      return null

    return getUserActivityStatus(ls, now.value)
  })
}
