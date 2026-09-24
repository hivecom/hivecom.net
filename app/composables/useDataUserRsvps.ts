import type { Database } from '@/types/database.types'
import { onMounted, ref, watch } from 'vue'
import { useCacheModule } from '@/composables/useCacheModule'
import { useRsvpBus } from '@/composables/useRsvpBus'
import { useUserId } from '@/composables/useUserId'
import { CACHE_NAMESPACES } from '@/lib/cache/namespaces'

type RsvpStatus = Database['public']['Enums']['events_rsvp_status']
type RsvpRow = Pick<Database['public']['Tables']['event_rsvps']['Row'], 'event_id' | 'rsvp'>

const TTL = 3 * 60 * 1000 // own RSVPs rarely change outside explicit writes

function cacheKey(userId: string): string {
  return `user-rsvps:${userId}`
}

// An event can have both a series row and occurrence rows. The map keeps the
// strongest status per event ("did I show interest in this event"), which is
// what list-level consumers need. Exact per-occurrence resolution lives in
// useRSVP.
const STATUS_RANK: Record<RsvpStatus, number> = { yes: 2, tentative: 1, no: 0 }

// The current user's RSVPs as event id to status, for cross-event lookups.
// useRSVP handles a single event.
export function useDataUserRsvps() {
  const { withCache, cache, loading, error } = useCacheModule(CACHE_NAMESPACES.rsvps)
  const supabase = useSupabaseClient<Database>()
  const userId = useUserId()

  const rsvpByEventId = ref<Map<number, RsvpStatus>>(new Map())

  function applyRows(rows: RsvpRow[]): void {
    const map = new Map<number, RsvpStatus>()
    for (const row of rows) {
      const existing = map.get(row.event_id)
      if (existing === undefined || STATUS_RANK[row.rsvp] > STATUS_RANK[existing])
        map.set(row.event_id, row.rsvp)
    }
    rsvpByEventId.value = map
  }

  // Pre-populate synchronously from cache so the first render has data.
  const _uid = userId.value
  if (_uid != null) {
    const cached = cache.getInitial<RsvpRow[]>(cacheKey(_uid))
    if (cached !== null)
      applyRows(cached)
  }

  async function fetch(force = false): Promise<void> {
    const uid = userId.value
    if (uid == null)
      return

    const result = await withCache(cacheKey(uid), async () => {
      const { data, error: fetchError } = await supabase
        .from('event_rsvps')
        .select('event_id, rsvp')
        .eq('user_id', uid)
      if (fetchError)
        throw fetchError

      return data ?? []
    }, { force, ttl: TTL })
    if (result !== null)
      applyRows(result)
  }

  onMounted(() => {
    void fetch()
  })

  watch(userId, (uid) => {
    if (uid != null)
      void fetch()
  })

  // RSVP writes elsewhere announce on the bus, so force-refresh to track them immediately.
  const { onRsvpUpdated } = useRsvpBus()
  onRsvpUpdated(() => {
    void fetch(true)
  })

  return {
    rsvpByEventId,
    loading,
    error,
    refresh: async () => fetch(true),
  }
}
