import type { SupabaseClient } from '@supabase/supabase-js'
import type { Ref } from 'vue'
import type { Database } from '@/types/database.types'
import { onBeforeUnmount, onMounted, readonly, ref, unref, watchEffect } from 'vue'
import { getAnnouncementBackgroundUrl, getAnnouncementBannerUrl } from '@/lib/storage'

const CACHE_PREFIX = 'announcement-asset'
const memoryCache = new Map<string, { url: string | null, expiresAt: number }>()

export interface UseAnnouncementAssetsOptions {
  ttl?: number
  negativeTtl?: number
}

type MaybeRef<T> = T | Ref<T>
type AnnouncementAssetsType = 'banner' | 'background'
type AnnouncementAssetsFetcher = (
  client: SupabaseClient<Database>,
  announcementId: number,
) => Promise<string | null>

const fetchAnnouncementBannerUrl = getAnnouncementBannerUrl as AnnouncementAssetsFetcher
const fetchAnnouncementBackgroundUrl = getAnnouncementBackgroundUrl as AnnouncementAssetsFetcher

interface CacheEntry {
  url: string | null
  expiresAt: number
}

function now() {
  return Date.now()
}

function getCacheKey(type: AnnouncementAssetsType, announcementId: number) {
  return `${CACHE_PREFIX}:${type}:${announcementId}`
}

function canUseBrowserCache() {
  return typeof window !== 'undefined'
}

function readCache(type: AnnouncementAssetsType, announcementId: number): string | null | undefined {
  if (!canUseBrowserCache())
    return undefined

  const key = getCacheKey(type, announcementId)
  const entry = memoryCache.get(key)
  if (entry && entry.expiresAt > now())
    return entry.url
  if (entry)
    memoryCache.delete(key)

  const raw = window.localStorage.getItem(key)
  if (raw === null)
    return undefined

  try {
    const parsed = JSON.parse(raw) as CacheEntry
    if (parsed.expiresAt <= now()) {
      window.localStorage.removeItem(key)
      return undefined
    }

    memoryCache.set(key, parsed)
    return parsed.url
  }
  catch {
    window.localStorage.removeItem(key)
    return undefined
  }
}

function writeCache(
  type: AnnouncementAssetsType,
  announcementId: number,
  url: string | null,
  ttl: number,
  negativeTtl: number,
) {
  if (!canUseBrowserCache())
    return

  const key = getCacheKey(type, announcementId)
  const expiresAt = now() + (url !== null ? ttl : negativeTtl)
  const entry: CacheEntry = { url, expiresAt }
  memoryCache.set(key, entry)

  try {
    window.localStorage.setItem(key, JSON.stringify(entry))
  }
  catch {
    // localStorage may be unavailable (e.g., Safari private mode)
  }
}

export function invalidateAnnouncementAssetsCache(type: AnnouncementAssetsType, announcementId: number) {
  const key = getCacheKey(type, announcementId)
  memoryCache.delete(key)
  if (canUseBrowserCache())
    window.localStorage.removeItem(key)
}

function useCacheAnnouncementAssetsInternal(
  announcementId: MaybeRef<number | null | undefined>,
  assetType: AnnouncementAssetsType,
  options: UseAnnouncementAssetsOptions = {},
) {
  const supabase = useSupabaseClient<Database>()
  const ttl = options.ttl ?? 30 * 60 * 1000
  const negativeTtl = options.negativeTtl ?? 5 * 60 * 1000

  const assetUrl = ref<string | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)
  let requestToken = 0

  async function fetchAsset(id: number, force = false) {
    if (!force) {
      const cached = readCache(assetType, id)
      if (cached !== undefined) {
        assetUrl.value = cached
        error.value = null
        loading.value = false
        return
      }
    }

    const currentRequest = ++requestToken
    loading.value = true
    error.value = null

    try {
      const url = assetType === 'banner'
        ? await fetchAnnouncementBannerUrl(supabase, id)
        : await fetchAnnouncementBackgroundUrl(supabase, id)
      if (currentRequest !== requestToken)
        return

      assetUrl.value = url
      writeCache(assetType, id, url, ttl, negativeTtl)
    }
    catch (err) {
      if (currentRequest !== requestToken)
        return

      console.error(`Failed to load announcement ${assetType}:`, err)
      error.value = err instanceof Error ? err.message : `Failed to load announcement ${assetType}`
      assetUrl.value = null
    }
    finally {
      if (currentRequest === requestToken)
        loading.value = false
    }
  }

  watchEffect(() => {
    const id = unref(announcementId)
    if (id === null || id === undefined || Number.isNaN(id)) {
      assetUrl.value = null
      error.value = null
      loading.value = false
      return
    }

    void fetchAsset(id)
  })

  function refetch() {
    const id = unref(announcementId)
    if (id === null || id === undefined || Number.isNaN(id))
      return

    invalidateAnnouncementAssetsCache(assetType, id)
    void fetchAsset(id, true)
  }

  if (import.meta.client) {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ announcementId: number, assetType: AnnouncementAssetsType, url: string | null }>).detail
      if (detail == null || detail.assetType !== assetType)
        return

      const id = unref(announcementId)
      if (id === null || id === undefined || id !== detail.announcementId)
        return

      assetUrl.value = detail.url
      error.value = null
      loading.value = false
      writeCache(assetType, detail.announcementId, detail.url, ttl, negativeTtl)
    }

    onMounted(() => {
      window.addEventListener('announcement-asset-updated', handler as EventListener)
    })

    onBeforeUnmount(() => {
      window.removeEventListener('announcement-asset-updated', handler as EventListener)
    })
  }

  return {
    assetUrl: readonly(assetUrl),
    loading: readonly(loading),
    error: readonly(error),
    refetch,
  }
}

export function useCacheAnnouncementBanner(
  announcementId: MaybeRef<number | null | undefined>,
  options: UseAnnouncementAssetsOptions = {},
) {
  return useCacheAnnouncementAssetsInternal(announcementId, 'banner', options)
}

export function useCacheAnnouncementBackground(
  announcementId: MaybeRef<number | null | undefined>,
  options: UseAnnouncementAssetsOptions = {},
) {
  return useCacheAnnouncementAssetsInternal(announcementId, 'background', options)
}
