// `agreed_content_rules` is write-once, so a cached `true` is trusted for the
// session. Cached because every RichTextEditor mount would otherwise query it.

import type { Database } from '@/types/database.types'
import { readonly, ref, watch } from 'vue'
import { useCache } from './useCache'

const TTL = 24 * 60 * 60 * 1000

function getCacheKey(userId: string): string {
  return `content-rules:agreed:${userId}`
}

export function useContentRulesAgreement() {
  const supabase = useSupabaseClient<Database>()
  const userId = useUserId()
  const cache = useCache({ ttl: TTL })

  const agreed = ref<boolean | null>(null)
  const loading = ref(false)

  // Evict on SIGNED_IN, at setup time, so the immediate watch below never reads
  // a value from a previous session (e.g. before a dev DB reset). Never
  // unsubscribed: the extra fetch on login is negligible.
  supabase.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_IN') {
      const id = userId.value
      if (id != null && id !== '') {
        cache.delete(getCacheKey(id))
      }
      agreed.value = null
    }
  })

  async function fetch(force = false): Promise<void> {
    const id = userId.value

    if (id == null || id === '') {
      agreed.value = null
      return
    }

    // Agreement is permanent, so true is trusted unconditionally.
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

  // Call after the DB write succeeds, so other mounted editors update without a re-fetch.
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
