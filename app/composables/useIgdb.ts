import { useRuntimeConfig, useSupabaseClient } from '#imports'

// Search result item (from mode=search)
export interface IgdbSearchResult {
  igdb_id: number
  name: string
  release_year: number | null
  cover_url: string | null
  summary: string | null
  genre_names: string[]
}

// Full normalised game data (from mode=details)
export interface IgdbGameDetails {
  igdb_id: number
  igdb_url: string | null
  name: string
  summary: string | null
  storyline: string | null
  release_date: string | null // ISO date YYYY-MM-DD
  website: string | null
  steam_id: string | null
  acronym: string | null
  genre_tags: string[]
  multiplayer_modes: string[]
  cover_url: string | null
  background_url: string | null
}

interface IgdbSearchResponse {
  results: IgdbSearchResult[]
}

interface IgdbDetailsResponse {
  game: IgdbGameDetails
}

/**
 * Composable wrapping calls to the `admin-igdb-search` Supabase edge function.
 *
 * All three methods use a direct `fetch` call rather than `supabase.functions.invoke`
 * because `invoke` does not support query string parameters natively.
 *
 * Callers are responsible for managing reactive loading/error state.
 */
export function useIgdb() {
  const supabase = useSupabaseClient()
  const config = useRuntimeConfig()
  const baseUrl = (config.public.supabase as { url: string }).url

  async function _getToken(): Promise<string> {
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token ?? ''
  }

  async function _fetchEdge<T>(params: Record<string, string>): Promise<T | null> {
    const token = await _getToken()
    const query = new URLSearchParams(params).toString()
    const url = `${baseUrl}/functions/v1/admin-igdb-search?${query}`

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    })

    if (!response.ok)
      return null

    return response.json() as Promise<T>
  }

  /**
   * Search IGDB games by name.
   */
  async function searchByName(q: string): Promise<IgdbSearchResult[]> {
    try {
      const data = await _fetchEdge<IgdbSearchResponse>({ mode: 'search', q })
      return data?.results ?? []
    }
    catch {
      return []
    }
  }

  /**
   * Search IGDB games by Steam app ID.
   */
  async function searchBySteamId(steamId: string): Promise<IgdbSearchResult[]> {
    try {
      const data = await _fetchEdge<IgdbSearchResponse>({ mode: 'search', steam_id: steamId })
      return data?.results ?? []
    }
    catch {
      return []
    }
  }

  /**
   * Fetch full normalised game details by IGDB ID.
   */
  async function getDetails(igdbId: number): Promise<IgdbGameDetails | null> {
    try {
      const data = await _fetchEdge<IgdbDetailsResponse>({ mode: 'details', id: String(igdbId) })
      return data?.game ?? null
    }
    catch {
      return null
    }
  }

  return { searchByName, searchBySteamId, getDetails }
}
