import type { Tables } from '@/types/database.overrides'
import type { Database } from '@/types/database.types'
import { useCache } from '@/composables/useCache'
import { getGameAssetUrl } from '@/lib/storage'

const GAME_ASSET_TTL = 30 * 60 * 1000

// Only found URLs are cached, so a newly uploaded asset shows up on the next fetch.
const _gameAssetCache = useCache({ ttl: GAME_ASSET_TTL })

function getAssetCacheKey(gameId: number, assetType: 'icon' | 'cover' | 'background') {
  return `game_asset:${gameId}:${assetType}`
}

function getAssetCacheKeyByShorthand(shorthand: string, assetType: 'icon' | 'cover' | 'background') {
  return `game_asset_sh:${shorthand}:${assetType}`
}

export function useDataGameAssets() {
  const supabase = useSupabaseClient<Database>()

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

  // For when there's no game row with an id, like link embeds. Cached by shorthand.
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

  async function preloadGameAssets(game: Tables<'games'>) {
    await Promise.allSettled([
      getGameIconUrl(game),
      getGameCoverUrl(game),
      getGameBackgroundUrl(game),
    ])
  }

  // Pass shorthands too when available. Link embeds cache by shorthand, and those
  // entries would otherwise stay stale until the TTL runs out.
  function clearGameAssets(gameId: number | null, ...shorthands: Array<string | null | undefined>) {
    if (gameId !== null)
      _gameAssetCache.invalidateByPattern(`game_asset:${gameId}:`)
    for (const shorthand of shorthands) {
      if (shorthand)
        _gameAssetCache.invalidateByPattern(`game_asset_sh:${shorthand}:`)
    }
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
