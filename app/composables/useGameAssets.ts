/**
 * Composable for managing game assets with caching
 * Handles both icons and covers for games with fallback to Steam assets
 */

import type { Database, Tables } from '@/types/database.types'
import { getGameAssetUrl } from '@/lib/utils/storage'

export interface GameAssetOptions {
  /**
   * Cache TTL in milliseconds
   * @default 30 minutes
   */
  ttl?: number
  /**
   * TTL for negative results (when asset doesn't exist)
   * @default 5 minutes
   */
  negativeTtl?: number
}

export function useGameAssets(options: GameAssetOptions = {}) {
  const {
    ttl = 30 * 60 * 1000, // 30 minutes
    negativeTtl = 5 * 60 * 1000, // 5 minutes
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
      const cacheTtl = (url !== null && url !== undefined) ? ttl : negativeTtl
      const isExpired = Date.now() - timestamp > cacheTtl

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

        // Cache the result
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

        // Cache the result
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

        // Cache the result
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
