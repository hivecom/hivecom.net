import type { Ref } from 'vue'
import type { Database } from '@/types/database.types'
import { ref } from 'vue'
import { useCache } from '@/composables/useCache'

const DRAFT_COUNT_TTL = 2 * 60 * 1000 // 2 minutes

export function useForumDraftCount(userId: Ref<string | null | undefined>) {
  const supabase = useSupabaseClient<Database>()
  const draftCountCache = useCache()

  const draftCount = ref<number>(0)

  function fetchDraftCount(force = false) {
    const uid = userId.value
    if (uid == null)
      return

    const cacheKey = `draft-count:${uid}`

    if (!force && draftCountCache.has(cacheKey)) {
      const cached = draftCountCache.get<number>(cacheKey)
      if (cached !== null)
        draftCount.value = cached
      return
    }

    supabase
      .from('discussions')
      .select('id', { count: 'exact', head: true })
      .eq('created_by', uid)
      .eq('is_draft', true)
      .then(({ count }) => {
        if (count !== null) {
          draftCount.value = count
          draftCountCache.set(cacheKey, count, DRAFT_COUNT_TTL)
        }
      })
  }

  function handleDraftUpdated() {
    const uid = userId.value
    if (uid != null)
      draftCountCache.delete(`draft-count:${uid}`)
    fetchDraftCount(true)
  }

  return {
    draftCount,
    fetchDraftCount,
    handleDraftUpdated,
  }
}
