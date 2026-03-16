/**
 * Composable for managing game assets with caching
 * Handles both icons and covers for games with fallback to Steam assets
 *
 * ## Why localStorage instead of `useCache`?
 *
 * Game asset URLs are signed/public CDN paths that change only when an admin
 * explicitly re-uploads an asset. They are worth caching across page reloads
 * so that navigating away and back doesn't re-hit storage on every visit.
 *
 * `useCache` (in-memory, module-level Map) is cleared on every full page
 * reload, making it unsuitable for this use-case.  localStorage survives
 * reloads and makes the asset cache effectively persistent until the TTL or
 * an explicit `clearGameAssets()` call.
 *
 * Tradeoffs vs `useCache`:
 * - NOT visible to `cache.invalidateByPattern` / `cache.clearCache`
 * - NOT swept by the shared TTL cleanup timer
 * - Survives hard reloads (desirable here)
 * - Bounded by localStorage quota (mitigated by only caching positive results
 *   and evicting on TTL expiry)
 *
 * If a cross-reload persistent cache becomes a common need, consider
 * extracting a `usePersistentCache` composable and adopting it here and
 * elsewhere consistently.
 */

import type { Tables } from '@/types/database.overrides'
import type { Database } from '@/types/database.types'
import { getGameAssetUrl } from '@/lib/storage'

export interface GameAssetOptions {
  /**
   * Cache TTL in milliseconds
   * @default 30 minutes
   */
  ttl?: number
}

export function useCacheGameAssets(options: GameAssetOptions = {}) {
  const {
    ttl = 30 * 60 * 1000, // 30 minutes
  } = options

  const supabase = useSupabaseClient<Database>()

  /**
   * Generate cache key for game assets
   */
  function getAssetCacheKey(
    gameId: number,
    assetType: 'icon' | 'cover' | 'background',
  ) {
    return `game_asset:${gameId}:${assetType}`
  }

  /**
   * Get cached asset URL from localStorage
   */
  function getCachedAssetUrl(cacheKey: string): string | null | undefined {
    if (typeof window === 'undefined')
      return undefined

    const cached = window.localStorage.getItem(cacheKey)
    if (cached === null || cached.length === 0)
      return undefined

    try {
      const parsed = JSON.parse(cached) as { url: string | null, timestamp: number }
      const { url, timestamp } = parsed

      // Evict legacy negative cache entries - we no longer cache null results
      if (url === null) {
        window.localStorage.removeItem(cacheKey)
        return undefined
      }

      const isExpired = Date.now() - timestamp > ttl

      if (isExpired) {
        window.localStorage.removeItem(cacheKey)
        return undefined
      }

      return url
    }
    catch {
      // Invalid cache entry, remove it
      window.localStorage.removeItem(cacheKey)
      return undefined
    }
  }

  /**
   * Cache asset URL in localStorage
   */
  function cacheAssetUrl(cacheKey: string, url: string | null): void {
    if (typeof window === 'undefined')
      return

    try {
      window.localStorage.setItem(cacheKey, JSON.stringify({
        url,
        timestamp: Date.now(),
      }))
    }
    catch {
      // localStorage might be full, ignore cache errors
    }
  }

  /**
   * Get game icon URL with caching
   */
  async function getGameIconUrl(game: Tables<'games'>): Promise<string | null> {
    try {
      // Try: Custom icon from storage (check cache first)
      if (game.shorthand !== null && game.shorthand !== undefined && game.shorthand.trim() !== '') {
        const customIconCacheKey = getAssetCacheKey(game.id, 'icon')

        // Check cache first
        const cachedUrl = getCachedAssetUrl(customIconCacheKey)
        if (cachedUrl !== undefined) {
          return cachedUrl
        }

        // Not in cache, fetch from storage
        const customIconUrl = await getGameAssetUrl(supabase, game.shorthand, 'icon')

        // Only cache positive results - don't cache null so newly uploaded assets are picked up
        if (customIconUrl !== null)
          cacheAssetUrl(customIconCacheKey, customIconUrl)

        return customIconUrl
      }

      return null
    }
    catch (error) {
      console.error(`Failed to load icon for game ${game.id}:`, error)
      return null
    }
  }

  /**
   * Get game cover URL with caching
   */
  async function getGameCoverUrl(game: Tables<'games'>): Promise<string | null> {
    try {
      // Try: Custom cover from storage (check cache first)
      if (game.shorthand !== null && game.shorthand !== undefined && game.shorthand.trim() !== '') {
        const customCoverCacheKey = getAssetCacheKey(game.id, 'cover')

        // Check cache first
        const cachedUrl = getCachedAssetUrl(customCoverCacheKey)

        if (cachedUrl !== undefined) {
          return cachedUrl
        }

        // Not in cache, fetch from storage
        const customCoverUrl = await getGameAssetUrl(supabase, game.shorthand, 'cover')

        // Only cache positive results - don't cache null so newly uploaded assets are picked up
        if (customCoverUrl !== null)
          cacheAssetUrl(customCoverCacheKey, customCoverUrl)

        return customCoverUrl
      }

      return null
    }
    catch (error) {
      console.error(`Failed to load cover for game ${game.id}:`, error)
      return null
    }
  }

  /**
   * Get game background URL with caching
   */
  async function getGameBackgroundUrl(game: Tables<'games'>): Promise<string | null> {
    try {
      // Try: Custom background from storage (check cache first)
      if (game.shorthand !== null && game.shorthand !== undefined && game.shorthand.trim() !== '') {
        const customBgCacheKey = getAssetCacheKey(game.id, 'background')

        // Check cache first
        const cachedUrl = getCachedAssetUrl(customBgCacheKey)
        if (cachedUrl !== undefined) {
          return cachedUrl
        }

        // Not in cache, fetch from storage
        const customBgUrl = await getGameAssetUrl(supabase, game.shorthand, 'background')

        // Only cache positive results - don't cache null so newly uploaded assets are picked up
        if (customBgUrl !== null)
          cacheAssetUrl(customBgCacheKey, customBgUrl)

        return customBgUrl
      }

      return null
    }
    catch (error) {
      console.error(`Failed to load background for game ${game.id}:`, error)
      return null
    }
  }

  /**
   * Preload all assets for a game
   */
  async function preloadGameAssets(game: Tables<'games'>) {
    await Promise.allSettled([
      getGameIconUrl(game),
      getGameCoverUrl(game),
      getGameBackgroundUrl(game),
    ])
  }

  /**
   * Clear cached assets for a specific game
   */
  function clearGameAssets(gameId: number) {
    if (typeof window === 'undefined')
      return

    // Remove all cache entries for this game
    const keysToRemove = [
      getAssetCacheKey(gameId, 'icon'),
      getAssetCacheKey(gameId, 'cover'),
      getAssetCacheKey(gameId, 'background'),
    ]

    keysToRemove.forEach((key) => {
      window.localStorage.removeItem(key)
    })
  }

  return {
    getGameIconUrl,
    getGameCoverUrl,
    getGameBackgroundUrl,
    preloadGameAssets,
    clearGameAssets,
  }
}
