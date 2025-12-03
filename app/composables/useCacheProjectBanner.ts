import type { SupabaseClient } from '@supabase/supabase-js'
import type { Ref } from 'vue'
import type { Database } from '@/types/database.types'
import { onBeforeUnmount, onMounted, readonly, ref, unref, watchEffect } from 'vue'
import { getProjectBannerUrl } from '@/lib/storage'

const CACHE_PREFIX = 'project-banner:'
const memoryCache = new Map<number, { url: string | null, expiresAt: number }>()

export interface UseProjectBannerOptions {
  ttl?: number
  negativeTtl?: number
}

type MaybeRef<T> = T | Ref<T>
type ProjectBannerFetcher = (client: SupabaseClient<Database>, projectId: number) => Promise<string | null>

function now() {
  return Date.now()
}

function getCacheKey(projectId: number) {
  return `${CACHE_PREFIX}${projectId}`
}

function canUseBrowserCache() {
  return typeof window !== 'undefined'
}

function readCache(projectId: number): string | null | undefined {
  if (!canUseBrowserCache())
    return undefined

  const entry = memoryCache.get(projectId)
  if (entry && entry.expiresAt > now())
    return entry.url
  if (entry)
    memoryCache.delete(projectId)

  const cacheKey = getCacheKey(projectId)
  const raw = window.localStorage.getItem(cacheKey)
  if (raw === null)
    return undefined

  try {
    const parsed = JSON.parse(raw) as { url: string | null, expiresAt: number }
    if (parsed.expiresAt <= now()) {
      window.localStorage.removeItem(cacheKey)
      return undefined
    }

    memoryCache.set(projectId, parsed)
    return parsed.url
  }
  catch {
    window.localStorage.removeItem(cacheKey)
    return undefined
  }
}

function writeCache(projectId: number, url: string | null, ttl: number, negativeTtl: number) {
  if (!canUseBrowserCache())
    return

  const expiresAt = now() + (url !== null ? ttl : negativeTtl)
  const entry = { url, expiresAt }
  memoryCache.set(projectId, entry)

  try {
    window.localStorage.setItem(getCacheKey(projectId), JSON.stringify(entry))
  }
  catch {
    // localStorage may be unavailable (e.g., Safari private mode)
  }
}

export function invalidateProjectBannerCache(projectId: number) {
  memoryCache.delete(projectId)
  if (canUseBrowserCache()) {
    window.localStorage.removeItem(getCacheKey(projectId))
  }
}

export function useCacheProjectBanner(
  projectId: MaybeRef<number | null | undefined>,
  options: UseProjectBannerOptions = {},
) {
  const supabase = useSupabaseClient<Database>()
  const ttl = options.ttl ?? 30 * 60 * 1000
  const negativeTtl = options.negativeTtl ?? 5 * 60 * 1000
  const fetchProjectBannerUrl = getProjectBannerUrl as ProjectBannerFetcher

  const bannerUrl = ref<string | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)
  let requestToken = 0

  async function fetchBanner(id: number, force = false) {
    if (!force) {
      const cached = readCache(id)
      if (cached !== undefined) {
        bannerUrl.value = cached
        error.value = null
        loading.value = false
        return
      }
    }

    const currentRequest = ++requestToken
    loading.value = true
    error.value = null

    try {
      const url = await fetchProjectBannerUrl(supabase, id)
      if (currentRequest !== requestToken)
        return

      bannerUrl.value = url
      writeCache(id, url, ttl, negativeTtl)
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

    invalidateProjectBannerCache(id)
    void fetchBanner(id, true)
  }

  if (import.meta.client) {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ projectId: number, url: string | null }>).detail
      if (detail == null)
        return

      const id = unref(projectId)
      if (id === null || id === undefined || id !== detail.projectId)
        return

      bannerUrl.value = detail.url
      error.value = null
      loading.value = false
      writeCache(detail.projectId, detail.url, ttl, negativeTtl)
    }

    onMounted(() => {
      window.addEventListener('project-banner-updated', handler as EventListener)
    })

    onBeforeUnmount(() => {
      window.removeEventListener('project-banner-updated', handler as EventListener)
    })
  }

  return {
    bannerUrl: readonly(bannerUrl),
    loading: readonly(loading),
    error: readonly(error),
    refetch,
  }
}
