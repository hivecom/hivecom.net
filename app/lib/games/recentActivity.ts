import type { MetricsHistoryEntry } from '@/composables/useDataMetrics'
import type { Tables } from '@/types/database.overrides'

// One derivation of "what has the community been playing", so every list of it
// tells the same story.

export interface NowPlayingEntry {
  game: Tables<'games'>
  playerIds: string[]
  live: true
}

export interface RecentlyPlayedEntry {
  game: Tables<'games'>
  playerIds: string[]
  live: false
  lastSeen: number
  peakCount: number
}

export type PlayingEntry = NowPlayingEntry | RecentlyPlayedEntry

/**
 * Collapse metrics history into one row per game: when it was last seen with
 * anyone in it, and the highest headcount across the window.
 */
export function buildRecentlyPlayedMap(
  history: MetricsHistoryEntry[],
): Map<number, { lastSeen: number, peakCount: number }> {
  const byGameId = new Map<number, { lastSeen: number, peakCount: number }>()
  const sortedHistory = [...history].sort((a, b) => new Date(a.capturedAt).getTime() - new Date(b.capturedAt).getTime())

  for (const entry of sortedHistory) {
    if (!entry.usersByGame)
      continue

    const capturedAt = new Date(entry.capturedAt).getTime()

    for (const [idStr, count] of Object.entries(entry.usersByGame)) {
      if (!count || count < 1)
        continue

      const id = Number(idStr)
      if (Number.isNaN(id))
        continue

      const existing = byGameId.get(id)
      if (existing === undefined) {
        byGameId.set(id, { lastSeen: capturedAt, peakCount: count })
        continue
      }

      existing.lastSeen = Math.max(existing.lastSeen, capturedAt)
      existing.peakCount = Math.max(existing.peakCount, count)
    }
  }

  return byGameId
}

// Signed-out visitors can't read the presence roster.
export function buildNowPlaying(
  currentPlayersBySteamId: Map<number, string[]>,
  games: Tables<'games'>[],
  isLoggedIn: boolean,
): NowPlayingEntry[] {
  if (!isLoggedIn)
    return []

  const entries: NowPlayingEntry[] = []

  for (const [steamId, playerIds] of currentPlayersBySteamId) {
    const game = games.find(g => g.steam_id === steamId)
    if (game)
      entries.push({ game, playerIds, live: true })
  }

  return entries.sort((a, b) => b.playerIds.length - a.playerIds.length)
}
