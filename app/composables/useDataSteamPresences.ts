import type { Database } from '@/types/database.types'
import { onMounted, ref, watch } from 'vue'

export interface SteamPresenceGame {
  appId: number
  appName: string | null
}

export interface RecentlyPlayedGame {
  appName: string | null
  count: number
}

// Module-level singleton so all consumers share one cache and one request
const currentPlayersBySteamId = ref<Map<number, string[]>>(new Map())
const currentGameByProfileId = ref<Map<string, SteamPresenceGame>>(new Map())
const recentlyPlayedByAppId = ref<Map<number, RecentlyPlayedGame>>(new Map())
const presencesLoading = ref(false)
let fetched = false

export function useDataSteamPresences() {
  const supabase = useSupabaseClient<Database>()
  const user = useSupabaseUser()

  async function fetchCurrentPlayers(): Promise<void> {
    presencesLoading.value = true
    const { data } = await supabase
      .from('presences_steam')
      .select('profile_id, current_app_id, current_app_name, last_app_id, last_app_name')
      .or('current_app_id.not.is.null,last_app_id.not.is.null')
    presencesLoading.value = false
    if (!data)
      return
    const bySteamId = new Map<number, string[]>()
    const byProfileId = new Map<string, SteamPresenceGame>()
    const recentByAppId = new Map<number, RecentlyPlayedGame>()
    for (const row of data) {
      if (row.current_app_id != null) {
        const existing = bySteamId.get(row.current_app_id) ?? []
        existing.push(row.profile_id)
        bySteamId.set(row.current_app_id, existing)
        byProfileId.set(row.profile_id, {
          appId: row.current_app_id,
          appName: row.current_app_name,
        })
      }
      // Recently played is a generic aggregate on purpose - counts per game,
      // never which profile played it. Each profile contributes one game:
      // what they play now, else what they played last.
      const recentAppId = row.current_app_id ?? row.last_app_id
      const recentAppName = row.current_app_id != null ? row.current_app_name : row.last_app_name
      if (recentAppId != null) {
        const entry = recentByAppId.get(recentAppId)
        if (entry === undefined)
          recentByAppId.set(recentAppId, { appName: recentAppName, count: 1 })
        else
          entry.count += 1
      }
    }
    currentPlayersBySteamId.value = bySteamId
    currentGameByProfileId.value = byProfileId
    recentlyPlayedByAppId.value = recentByAppId
    fetched = true
  }

  function currentPlayersForSteamId(steamId: number | null | undefined): string[] {
    if (steamId == null)
      return []
    return currentPlayersBySteamId.value.get(steamId) ?? []
  }

  onMounted(() => {
    if (user.value && !fetched)
      void fetchCurrentPlayers()
  })

  watch(user, (u) => {
    if (u && !fetched)
      void fetchCurrentPlayers()
  })

  return {
    currentPlayersBySteamId,
    /** Reverse index: profile id -> the game they are in right now. */
    currentGameByProfileId,
    /** Generic aggregate: app id -> name + how many members play it now or played it last. */
    recentlyPlayedByAppId,
    presencesLoading,
    fetchCurrentPlayers,
    currentPlayersForSteamId,
  }
}
