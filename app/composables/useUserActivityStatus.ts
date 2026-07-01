import type { MaybeRefOrGetter } from 'vue'
import type { UserActivityStatus } from '@/lib/lastSeen'
import { computed, toValue } from 'vue'
import { useUserId } from '@/composables/useUserId'
import { getUserActivityStatus } from '@/lib/lastSeen'

/**
 * Resolves a user's online/away/offline activity status, with one hard rule:
 * the currently signed-in user is ALWAYS reported as online.
 *
 * This is the single source of truth for the activity indicator. Do not
 * re-implement the "is this me?" check inline in components - it is subtly
 * wrong because `useSupabaseUser().value` returns JWT *claims* (id in `sub`),
 * so comparing against `useSupabaseUser().value?.id` fails intermittently.
 * `useUserId()` correctly reads `sub` (with `id` fallback); always use it.
 *
 * @param userId   The profile id being rendered.
 * @param lastSeen The profile's last_seen timestamp (string | Date | null).
 */
export function useUserActivityStatus(
  userId: MaybeRefOrGetter<string | null | undefined>,
  lastSeen: MaybeRefOrGetter<string | Date | null | undefined>,
) {
  const currentUserId = useUserId()

  return computed<UserActivityStatus | null>(() => {
    const id = toValue(userId)

    // The signed-in user is always online, everywhere. This must be checked
    // BEFORE last_seen so we never depend on (possibly stale or missing) DB
    // data to show our own status.
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

    return getUserActivityStatus(ls)
  })
}
