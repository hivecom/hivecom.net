import type { MaybeRefOrGetter } from 'vue'
import type { Database } from '@/types/database.types'
import { ref, toValue, watch } from 'vue'
import { useCacheModule } from '@/composables/useCacheModule'
import { useUserId } from '@/composables/useUserId'
import { CACHE_NAMESPACES } from '@/lib/cache/namespaces'

type FriendRsvpRow = Pick<Database['public']['Tables']['event_rsvps']['Row'], 'event_id' | 'user_id'>

const TTL = 3 * 60 * 1000 // 3 min - matches the user's own RSVP cache

// Keyed by the current user - the friend set derives from them, so a changed
// friend list within TTL is served stale until the next refresh.
function cacheKey(userId: string): string {
  return `friend-rsvps:${userId}`
}

/**
 * Yes-RSVPs of the given users (typically the current user's mutual friends,
 * see mutualFriendIds on useDataNotifications) grouped by event id.
 *
 * Feeds "friends are attending X" surfaces: cross-reference with events the
 * current user has not RSVPed to via useDataUserRsvps.
 */
export function useDataFriendRsvps(friendIds: MaybeRefOrGetter<string[]>) {
  const { withCache, cache, loading, error } = useCacheModule(CACHE_NAMESPACES.rsvps)
  const supabase = useSupabaseClient<Database>()
  const userId = useUserId()

  const attendingByEventId = ref<Map<number, string[]>>(new Map())

  function applyRows(rows: FriendRsvpRow[]): void {
    const map = new Map<number, string[]>()
    for (const row of rows) {
      const existing = map.get(row.event_id) ?? []
      if (!existing.includes(row.user_id))
        existing.push(row.user_id)
      map.set(row.event_id, existing)
    }
    attendingByEventId.value = map
  }

  // Pre-populate synchronously from cache so the first render has data.
  const _uid = userId.value
  if (_uid != null) {
    const cached = cache.get<FriendRsvpRow[]>(cacheKey(_uid))
    if (cached !== null)
      applyRows(cached)
  }

  async function fetch(force = false): Promise<void> {
    const uid = userId.value
    const ids = toValue(friendIds)
    if (uid == null || ids.length === 0)
      return
    const result = await withCache(cacheKey(uid), async () => {
      const { data, error: fetchError } = await supabase
        .from('event_rsvps')
        .select('event_id, user_id')
        .eq('rsvp', 'yes')
        .in('user_id', ids)
      if (fetchError)
        throw fetchError
      return data ?? []
    }, { force, ttl: TTL })
    if (result !== null)
      applyRows(result)
  }

  // Friend ids usually resolve async (notifications fetch), so fetch reacts to
  // them becoming available rather than running once on mount.
  watch(
    () => [userId.value, toValue(friendIds)] as const,
    ([uid, ids]) => {
      if (uid != null && ids.length > 0)
        void fetch()
    },
    { immediate: true, deep: true },
  )

  return {
    attendingByEventId,
    loading,
    error,
    refresh: async () => fetch(true),
  }
}
