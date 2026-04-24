/**
 * Composable for managing game assets with caching.
 * Handles icons, covers, and backgrounds for games with fallback to Steam assets.
 *
 * Caching is handled by useCache({ storage: 'localStorage' }) so entries survive
 * page reloads within the TTL window. Cache is shared across all composable instances
 * via the module-level _gameAssetCache.
 *
 * Only positive results are cached - null results are not stored so newly uploaded
 * assets are always picked up on the next fetch.
 */

import type { Tables } from '@/types/database.overrides'
import type { Database } from '@/types/database.types'
import { useCache } from '@/composables/useCache'
import { getGameAssetUrl } from '@/lib/storage'

const GAME_ASSET_TTL = 30 * 60 * 1000 // 30 minutes

const _gameAssetCache = useCache({ ttl: GAME_ASSET_TTL })

function getAssetCacheKey(gameId: number, assetType: 'icon' | 'cover' | 'background') {
  return `game_asset:${gameId}:${assetType}`
}

function getAssetCacheKeyByShorthand(shorthand: string, assetType: 'icon' | 'cover' | 'background') {
  return `game_asset_sh:${shorthand}:${assetType}`
}

export function useDataGameAssets() {
  const supabase = useSupabaseClient<Database>()

  /**
   * Get game icon URL with caching.
   */
  async function getGameIconUrl(game: Tables<'games'>): Promise<string | null> {
    try {
      if (game.shorthand == null || game.shorthand.trim() === '')
        return null

      const cacheKey = getAssetCacheKey(game.id, 'icon')
      const cached = _gameAssetCache.get<string>(cacheKey)
      if (cached !== null)
        return cached

      const url = await getGameAssetUrl(supabase, game.shorthand, 'icon')
      if (url !== null)
        _gameAssetCache.set(cacheKey, url)
      return url
    }
    catch (error) {
      console.error(`Failed to load icon for game ${game.id}:`, error)
      return null
    }
  }

  /**
   * Get game cover URL with caching.
   */
  async function getGameCoverUrl(game: Tables<'games'>): Promise<string | null> {
    try {
      if (game.shorthand == null || game.shorthand.trim() === '')
        return null

      const cacheKey = getAssetCacheKey(game.id, 'cover')
      const cached = _gameAssetCache.get<string>(cacheKey)
      if (cached !== null)
        return cached

      const url = await getGameAssetUrl(supabase, game.shorthand, 'cover')
      if (url !== null)
        _gameAssetCache.set(cacheKey, url)
      return url
    }
    catch (error) {
      console.error(`Failed to load cover for game ${game.id}:`, error)
      return null
    }
  }

  /**
   * Get game background URL with caching.
   */
  async function getGameBackgroundUrl(game: Tables<'games'>): Promise<string | null> {
    try {
      if (game.shorthand == null || game.shorthand.trim() === '')
        return null

      const cacheKey = getAssetCacheKey(game.id, 'background')
      const cached = _gameAssetCache.get<string>(cacheKey)
      if (cached !== null)
        return cached

      const url = await getGameAssetUrl(supabase, game.shorthand, 'background')
      if (url !== null)
        _gameAssetCache.set(cacheKey, url)
      return url
    }
    catch (error) {
      console.error(`Failed to load background for game ${game.id}:`, error)
      return null
    }
  }

  /**
   * Get game background URL by shorthand string with caching.
   * Use this when no full game object (with id) is available - e.g. link embeds.
   * Keyed by shorthand so multiple instances with different games don't collide.
   */
  async function getGameBackgroundUrlByShorthand(shorthand: string): Promise<string | null> {
    try {
      if (shorthand == null || shorthand.trim() === '')
        return null

      const cacheKey = getAssetCacheKeyByShorthand(shorthand, 'background')
      const cached = _gameAssetCache.get<string>(cacheKey)
      if (cached !== null)
        return cached

      const url = await getGameAssetUrl(supabase, shorthand, 'background')
      if (url !== null)
        _gameAssetCache.set(cacheKey, url)
      return url
    }
    catch (error) {
      console.error(`Failed to load background for game shorthand ${shorthand}:`, error)
      return null
    }
  }

  /**
   * Preload all assets for a game.
   */
  async function preloadGameAssets(game: Tables<'games'>) {
    await Promise.allSettled([
      getGameIconUrl(game),
      getGameCoverUrl(game),
      getGameBackgroundUrl(game),
    ])
  }

  /**
   * Clear all cached assets for a specific game.
   */
  function clearGameAssets(gameId: number) {
    _gameAssetCache.invalidateByPattern(`game_asset:${gameId}:`)
  }

  return {
    getGameIconUrl,
    getGameCoverUrl,
    getGameBackgroundUrl,
    getGameBackgroundUrlByShorthand,
    preloadGameAssets,
    clearGameAssets,
  }
}
