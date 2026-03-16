/**
 * Cached content-rules agreement status for the current user.
 *
 * ## Why this exists
 *
 * `agreed_content_rules` is a write-once boolean on `profiles` - once a user
 * agrees, it never reverts. Fetching it on every `RichTextEditor` mount (which
 * can appear multiple times per page) produces a storm of identical queries.
 *
 * ## Caching strategy
 *
 * - TTL: 24 hours (long - the value almost never changes)
 * - Write-once fast path: if the cached value is `true`, subsequent calls
 *   within the same session skip the DB entirely, even if the TTL hasn't
 *   expired yet. Agreement is permanent so a cache hit of `true` is always
 *   correct.
 * - `markAgreed()`: called by `ContentRulesModal` immediately after the DB
 *   update succeeds. Warms the cache to `true` so any other mounted editor
 *   on the same page reflects the change without a re-fetch.
 *
 * ## Usage
 *
 *   const { agreed, loading, refresh, markAgreed } = useContentRulesAgreement()
 */

import type { Database } from '@/types/database.types'
import { readonly, ref, watch } from 'vue'
import { useCache } from './useCache'

const TTL = 24 * 60 * 60 * 1000 // 24 hours

function getCacheKey(userId: string): string {
  return `content-rules:agreed:${userId}`
}

export function useContentRulesAgreement() {
  const supabase = useSupabaseClient<Database>()
  const userId = useUserId()
  const cache = useCache({ ttl: TTL })

  const agreed = ref<boolean | null>(null)
  const loading = ref(false)

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
        .select('agreed_content_rules')
        .eq('id', id)
        .maybeSingle()

      if (error)
        throw error

      if (!data)
        return

      const value = data.agreed_content_rules

      // Only cache true permanently - false can change, so respect the TTL
      cache.set(cacheKey, value, value === true ? TTL : 5 * 60 * 1000)
      agreed.value = value
    }
    catch (err) {
      console.error('[useContentRulesAgreement] failed to fetch:', err)
    }
    finally {
      loading.value = false
    }
  }

  /**
   * Called by ContentRulesModal after the DB write succeeds.
   * Warms the cache to true so other mounted editors reflect agreement
   * immediately without a re-fetch.
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
    markAgreed,
  }
}
