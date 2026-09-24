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
  /** How many of those members are in it right now. */
  playing: number
  /** Most recent time a member stopped playing it, for when nobody is on. */
  lastPlayedAt: string | null
}

/** Shape of the entries worker-sync-steam writes into presences_steam.recent_apps. */
export interface SteamRecentApp {
  app_id: number
  app_name: string | null
  last_played_at: string
}

// Module-level singleton so all consumers share one cache and one request
const currentPlayersBySteamId = ref<Map<number, string[]>>(new Map())
const currentGameByProfileId = ref<Map<string, SteamPresenceGame>>(new Map())
const recentlyPlayedByAppId = ref<Map<number, RecentlyPlayedGame>>(new Map())
const recentPlayersBySteamId = ref<Map<number, string[]>>(new Map())
const presencesLoading = ref(false)
// True once the roster has landed at least once. Consumers skeleton on this
// rather than on presencesLoading, which also flips during background refetches.
const presencesReady = ref(false)
let inflight: Promise<void> | null = null
let lastFetchedAt = 0

// My own recent apps live on a single presence row, so they get their own
// query and their own guards. Keyed by profile so a different account signing
// in doesn't inherit the previous one's list.
const myRecentApps = ref<SteamRecentApp[]>([])
const myRecentAppsLoading = ref(false)
let myRecentAppsProfileId: string | null = null
let myRecentAppsInflight: Promise<void> | null = null

// Presences come from the same cron as metrics, so they go stale on the same
// five-minute cadence and need their own refresh timer.
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
  const userId = useUserId()

  async function loadCurrentPlayers(): Promise<void> {
    presencesLoading.value = true
    const { data } = await supabase
      .from('presences_steam')
      .select('profile_id, current_app_id, current_app_name, last_app_id, last_app_name, last_app_ended_at, recent_apps')
      .or('current_app_id.not.is.null,last_app_id.not.is.null')
    presencesLoading.value = false
    if (!data)
      return

    const bySteamId = new Map<number, string[]>()
    const byProfileId = new Map<string, SteamPresenceGame>()
    const recentByAppId = new Map<number, RecentlyPlayedGame>()
    const recentSessions: { steamId: number, profileId: string, lastPlayedAt: string }[] = []
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

      // Headcounts only. Who played what is a separate lookup. Each profile
      // counts once: what they play now, else what they played last.
      const isPlayingNow = row.current_app_id != null
      const recentAppId = row.current_app_id ?? row.last_app_id
      const recentAppName = isPlayingNow ? row.current_app_name : row.last_app_name
      if (recentAppId != null) {
        const entry = recentByAppId.get(recentAppId)
        if (entry === undefined) {
          recentByAppId.set(recentAppId, {
            appName: recentAppName,
            count: 1,
            playing: isPlayingNow ? 1 : 0,
            lastPlayedAt: isPlayingNow ? null : row.last_app_ended_at,
          })
        }
        else {
          entry.count += 1
          entry.appName ??= recentAppName

          if (isPlayingNow) {
            entry.playing += 1
          }
          // Newest wins, so the line reads as when the game was last touched
          // rather than whichever row the query happened to return first.
          else if (row.last_app_ended_at != null && (entry.lastPlayedAt == null || row.last_app_ended_at > entry.lastPlayedAt)) {
            entry.lastPlayedAt = row.last_app_ended_at
          }
        }
      }

      // Who played what: the per-profile recent list flattened so it can be
      // regrouped by game below. The column is jsonb, so the shape is checked.
      const apps = row.recent_apps as unknown
      if (Array.isArray(apps)) {
        for (const app of apps as SteamRecentApp[]) {
          if (typeof app?.app_id === 'number' && typeof app.last_played_at === 'string')
            recentSessions.push({ steamId: app.app_id, profileId: row.profile_id, lastPlayedAt: app.last_played_at })
        }
      }
    }

    // Newest session first within each game, so a cut-off cluster keeps the
    // people who were in it most recently.
    recentSessions.sort((a, b) => b.lastPlayedAt.localeCompare(a.lastPlayedAt))

    const recentBySteamId = new Map<number, string[]>()
    for (const session of recentSessions) {
      const ids = recentBySteamId.get(session.steamId) ?? []
      ids.push(session.profileId)
      recentBySteamId.set(session.steamId, ids)
    }

    currentPlayersBySteamId.value = bySteamId
    currentGameByProfileId.value = byProfileId
    recentlyPlayedByAppId.value = recentByAppId
    recentPlayersBySteamId.value = recentBySteamId
    presencesReady.value = true
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

  async function loadMyRecentApps(profileId: string): Promise<void> {
    myRecentAppsLoading.value = true
    const { data, error } = await supabase
      .from('presences_steam')
      .select('recent_apps')
      .eq('profile_id', profileId)
      .maybeSingle()
    myRecentAppsLoading.value = false

    // A failed read leaves the previous list alone rather than blanking the
    // card, and stays uncached so the next tick retries.
    if (error != null)
      return

    myRecentApps.value = (data?.recent_apps as unknown as SteamRecentApp[] | null) ?? []
    myRecentAppsProfileId = profileId
  }

  // The roster query only returns members who are in a game, so it can't
  // double as the source for my own recent list.
  async function fetchMyRecentApps(force = false): Promise<void> {
    const profileId = userId.value
    if (profileId == null)
      return

    if (!force && myRecentAppsProfileId === profileId)
      return

    if (myRecentAppsInflight !== null)
      return myRecentAppsInflight

    myRecentAppsInflight = loadMyRecentApps(profileId).finally(() => {
      myRecentAppsInflight = null
    })
    return myRecentAppsInflight
  }

  function currentPlayersForSteamId(steamId: number | null | undefined): string[] {
    if (steamId == null)
      return []

    return currentPlayersBySteamId.value.get(steamId) ?? []
  }

  /** Members with this app in their recent list, newest session first. */
  function recentPlayersForSteamId(steamId: number | null | undefined): string[] {
    if (steamId == null)
      return []

    return recentPlayersBySteamId.value.get(steamId) ?? []
  }

  // Signed-out visitors can't read the table, so the scheduled refetch is a
  // no-op for them rather than a stream of rejected queries.
  refetchPresences = async () => {
    if (!user.value)
      return

    await Promise.all([fetchCurrentPlayers(), fetchMyRecentApps(true)])
  }

  onMounted(() => {
    if (!user.value)
      return

    if (!presencesReady.value)
      void fetchCurrentPlayers()
    void fetchMyRecentApps()
  })

  watch(user, (u) => {
    // Signing out clears the per-user list so the next account never sees it.
    if (!u) {
      myRecentApps.value = []
      myRecentAppsProfileId = null
      return
    }

    if (!presencesReady.value)
      void fetchCurrentPlayers()
    void fetchMyRecentApps()
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
    currentGameByProfileId,
    /** Counts members who play it now or played it last. */
    recentlyPlayedByAppId,
    /** Newest session first. */
    recentPlayersBySteamId,
    /** The signed-in user's own recent games, newest first. */
    myRecentApps,
    presencesLoading,
    presencesReady,
    myRecentAppsLoading,
    fetchCurrentPlayers,
    fetchMyRecentApps,
    currentPlayersForSteamId,
    recentPlayersForSteamId,
  }
}
