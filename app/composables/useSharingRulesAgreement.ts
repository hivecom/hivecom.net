/**
 * Cached sharing-rules agreement status for the current user.
 *
 * Mirrors {@link useContentRulesAgreement}: `agreed_sharing_rules` is a
 * write-once boolean on `profiles` gating uploads to Orbit Depot. The caching
 * strategy is identical (24h TTL, write-once fast path, evict on SIGNED_IN).
 *
 * ## Usage
 *
 *   const { agreed, loading, refresh, markAgreed } = useSharingRulesAgreement()
 */

import type { Database } from '@/types/database.types'
import { readonly, ref, watch } from 'vue'
import { useCache } from './useCache'

const TTL = 24 * 60 * 60 * 1000 // 24 hours

function getCacheKey(userId: string): string {
  return `sharing-rules:agreed:${userId}`
}

// Shared state. Unlike content rules (which mount many editor instances and
// want per-instance refs), the sharing gate is consulted from several places at
// once (chat composer, chat app, sharing page) and a single agree must be
// visible to all of them immediately. Module-level refs make markAgreed()
// reactive everywhere; the per-instance watch/listener below stay cheap because
// fetches are cache-deduped and short-circuit on the write-once fast path.
const agreed = ref<boolean | null>(null)
const loading = ref(false)

// Bound once for the module rather than once per instance. The state it touches
// is shared and several components hold this composable at the same time, so
// per-instance binding piles up handlers that never unsubscribe and each redo
// the same work.
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

  /**
   * Called by SharingRulesModal after the DB write succeeds. Warms the cache to
   * `true` so other consumers on the same page reflect the change without a
   * re-fetch.
   */
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

  // Re-fetch when the user changes (account switch or sign-in)
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
