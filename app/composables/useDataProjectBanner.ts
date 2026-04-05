// Banner URL is wrapped in an object when stored so that a cached null (no banner)
// is distinguishable from a cache miss (useCache.get returns null for both otherwise).
import type { Ref } from 'vue'
import type { Database } from '@/types/database.types'
import { onMounted, readonly, ref, unref, watchEffect } from 'vue'
import { useCache } from '@/composables/useCache'
import { useProjectBannerBus } from '@/composables/useProjectBannerBus'
import { getProjectBannerUrl } from '@/lib/storage'

interface BannerCacheEntry { value: string | null }

// Cache is shared across all composable instances and persists across page reloads.
// Positive and negative results use different TTLs (passed per-set-call).
const _bannerCache = useCache()

const CACHE_PREFIX = 'project-banner:'

function getCacheKey(projectId: number): string {
  return `${CACHE_PREFIX}${projectId}`
}

export interface UseProjectBannerOptions {
  ttl?: number
  negativeTtl?: number
}

type MaybeRef<T> = T | Ref<T>

/**
 * Invalidate the cached banner for a specific project.
 * Exported so callers outside the composable (e.g. admin upload flows) can bust the cache.
 */
export function invalidateProjectBannerData(projectId: number) {
  _bannerCache.delete(getCacheKey(projectId))
}

export function useDataProjectBanner(
  projectId: MaybeRef<number | null | undefined>,
  options: UseProjectBannerOptions = {},
) {
  const supabase = useSupabaseClient<Database>()
  const ttl = options.ttl ?? 30 * 60 * 1000
  const negativeTtl = options.negativeTtl ?? 5 * 60 * 1000

  const bannerUrl = ref<string | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)
  let requestToken = 0

  async function fetchBanner(id: number, force = false) {
    if (!force) {
      const cached = _bannerCache.get<BannerCacheEntry>(getCacheKey(id))
      if (cached !== null) {
        bannerUrl.value = cached.value
        error.value = null
        loading.value = false
        return
      }
    }

    const currentRequest = ++requestToken
    loading.value = true
    error.value = null

    try {
      const url = await getProjectBannerUrl(supabase, id)
      if (currentRequest !== requestToken)
        return

      bannerUrl.value = url
      _bannerCache.set(getCacheKey(id), { value: url }, url !== null ? ttl : negativeTtl)
    }
    catch (err) {
      if (currentRequest !== requestToken)
        return

      console.error(`Failed to load project banner for ${id}:`, err)
      error.value = err instanceof Error ? err.message : 'Failed to load project banner'
      bannerUrl.value = null
    }
    finally {
      if (currentRequest === requestToken)
        loading.value = false
    }
  }

  watchEffect(() => {
    const id = unref(projectId)
    if (id === null || id === undefined || Number.isNaN(id)) {
      bannerUrl.value = null
      error.value = null
      loading.value = false
      return
    }

    void fetchBanner(id)
  })

  function refetch() {
    const id = unref(projectId)
    if (id === null || id === undefined || Number.isNaN(id))
      return

    invalidateProjectBannerData(id)
    void fetchBanner(id, true)
  }

  if (import.meta.client) {
    const { onProjectBannerUpdated } = useProjectBannerBus()

    onMounted(() => {
      onProjectBannerUpdated((detail) => {
        const id = unref(projectId)
        if (id === null || id === undefined || id !== detail.projectId)
          return

        bannerUrl.value = detail.url
        error.value = null
        loading.value = false
        _bannerCache.set(getCacheKey(detail.projectId), { value: detail.url }, ttl)
      })
    })
  }

  return {
    bannerUrl: readonly(bannerUrl),
    loading: readonly(loading),
    error: readonly(error),
    refetch,
  }
}
