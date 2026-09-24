/**
 * agreed_sharing_rules is a write-once boolean on profiles that gates uploads
 * to Orbit Depot.
 */

import type { Database } from '@/types/database.types'
import { readonly, ref, watch } from 'vue'
import { useCache } from './useCache'

const TTL = 24 * 60 * 60 * 1000

function getCacheKey(userId: string): string {
  return `sharing-rules:agreed:${userId}`
}

// Module-level so a single agree shows up at once everywhere the gate is
// consulted. The per-instance watch stays cheap since fetches are cache-deduped
// and true short-circuits.
const agreed = ref<boolean | null>(null)
const loading = ref(false)

// Bound once per module. The state is shared, and binding per instance piles up
// handlers that never unsubscribe.
let authListenerBound = false

export function useSharingRulesAgreement() {
  const supabase = useSupabaseClient<Database>()
  const userId = useUserId()
  const cache = useCache({ ttl: TTL })

  // Evict any stale localStorage entry on SIGNED_IN so a stale `true` from a
  // previous session (e.g. after a dev DB reset) is cleared before it's read.
  if (import.meta.client && !authListenerBound) {
    authListenerBound = true
    supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN') {
        const id = userId.value
        if (id != null && id !== '') {
          cache.delete(getCacheKey(id))
        }
        agreed.value = null

        // Supabase re-emits SIGNED_IN mid-session (a token refresh when the tab
        // regains focus counts), so this isn't only a login path. Re-fetch right
        // away, otherwise the value sits at null with nothing left to resolve it
        // and the upload gate prompts someone who agreed months ago.
        void fetch()
      }
    })
  }

  async function fetch(force = false): Promise<void> {
    const id = userId.value

    if (id == null || id === '') {
      agreed.value = null
      return
    }

    // Write-once fast path: true is permanent, trust it unconditionally.
    if (agreed.value === true)
      return

    const cacheKey = getCacheKey(id)

    if (!force) {
      const cached = cache.get<boolean>(cacheKey)
      if (cached !== null) {
        agreed.value = cached
        return
      }
    }

    loading.value = true

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('agreed_sharing_rules')
        .eq('id', id)
        .maybeSingle()

      if (error)
        throw error

      if (!data)
        return

      const value = data.agreed_sharing_rules

      cache.set(cacheKey, value, value === true ? TTL : 5 * 60 * 1000)
      agreed.value = value
    }
    catch (err) {
      console.error('[useSharingRulesAgreement] failed to fetch:', err)
    }
    finally {
      loading.value = false
    }
  }

  // Call after the DB write succeeds. Other consumers update without a refetch.
  function markAgreed(): void {
    const id = userId.value
    if (id == null || id === '')
      return

    cache.set(getCacheKey(id), true, TTL)
    agreed.value = true
  }

  async function refresh(): Promise<void> {
    await fetch(true)
  }

  /**
   * Settle `agreed` if it's still unknown, then report it. Anything that gates
   * behaviour on the answer (the upload gate) should go through this: null means
   * "the fetch hasn't landed", which is not the same as "hasn't agreed".
   */
  async function ensure(): Promise<boolean> {
    if (agreed.value === null)
      await fetch()

    return agreed.value === true
  }

  watch(userId, (id, prevId) => {
    if (id !== prevId) {
      agreed.value = null
    }
    void fetch()
  }, { immediate: true })

  return {
    agreed: readonly(agreed),
    loading: readonly(loading),
    refresh,
    ensure,
    markAgreed,
  }
}
