import type { Database } from '@/types/database.types'
import { onMounted, ref, watch } from 'vue'
import { METRICS_COLLECTION_INTERVAL, METRICS_REFRESH_BUFFER_MS } from '@/composables/useDataMetrics'

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
let inflight: Promise<void> | null = null
let lastFetchedAt = 0

// Presences come from the same cron as metrics, so they go stale on the same
// five-minute cadence. Without this the first mount of the session was the only
// fetch that ever ran and only a full reload showed new players.
let refreshTimer: ReturnType<typeof setTimeout> | null = null
let activeConsumers = 0

// Set by the composable so the module-level timer and visibility listener can
// refetch without a Nuxt context of their own.
let refetchPresences: (() => Promise<void>) | null = null

// Aligned to the collection boundary so a refetch lands just after the cron has
// written, rather than drifting by whenever the page happened to load.
function schedulePresencesRefresh(): void {
  if (refreshTimer !== null)
    clearTimeout(refreshTimer)

  refreshTimer = setTimeout(() => {
    void (refetchPresences?.() ?? Promise.resolve()).finally(() => {
      if (activeConsumers > 0)
        schedulePresencesRefresh()
    })
  }, METRICS_COLLECTION_INTERVAL - (Date.now() % METRICS_COLLECTION_INTERVAL) + METRICS_REFRESH_BUFFER_MS)
}

// Timers throttle in a background tab and stop outright across sleep, so by the
// time the tab is visible again the roster can be far older than one interval.
if (import.meta.client) {
  const { isHidden } = usePageVisibility()

  watch(isHidden, (hidden) => {
    if (hidden || activeConsumers === 0)
      return
    if (Date.now() - lastFetchedAt >= METRICS_COLLECTION_INTERVAL)
      void refetchPresences?.()
    schedulePresencesRefresh()
  })
}

export function useDataSteamPresences() {
  const supabase = useSupabaseClient<Database>()
  const user = useSupabaseUser()

  async function loadCurrentPlayers(): Promise<void> {
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
    lastFetchedAt = Date.now()
  }

  // Concurrent callers join the pending request instead of firing duplicates.
  async function fetchCurrentPlayers(): Promise<void> {
    if (inflight !== null)
      return inflight
    inflight = loadCurrentPlayers().finally(() => {
      inflight = null
    })
    return inflight
  }

  function currentPlayersForSteamId(steamId: number | null | undefined): string[] {
    if (steamId == null)
      return []
    return currentPlayersBySteamId.value.get(steamId) ?? []
  }

  // Signed-out visitors can't read the table, so the scheduled refetch is a
  // no-op for them rather than a stream of rejected queries.
  refetchPresences = async () => {
    if (!user.value)
      return
    await fetchCurrentPlayers()
  }

  onMounted(() => {
    if (user.value && !fetched)
      void fetchCurrentPlayers()
  })

  watch(user, (u) => {
    if (u && !fetched)
      void fetchCurrentPlayers()
  })

  if (getCurrentScope() !== undefined) {
    activeConsumers++
    if (activeConsumers === 1)
      schedulePresencesRefresh()

    onScopeDispose(() => {
      activeConsumers--
      if (activeConsumers === 0 && refreshTimer !== null) {
        clearTimeout(refreshTimer)
        refreshTimer = null
      }
    })
  }

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
