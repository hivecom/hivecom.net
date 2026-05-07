import type { SupabaseClient } from '@supabase/supabase-js'
import type { Tables } from '@/types/database.overrides'
import type { Database } from '@/types/database.types'
import type { MetricsSnapshot } from '@/types/metrics'
import { onUnmounted, ref } from 'vue'
import { useCache } from '@/composables/useCache'
import { CACHE_NAMESPACES } from '@/lib/cache/namespaces'

export type MetricsPeriod = '24h' | '7d' | '14d' | '30d' | '90d'

interface PeriodConfig {
  label: string
  hours: number
  bucketMs: number
}

export const PERIOD_CONFIGS: Record<MetricsPeriod, PeriodConfig> = {
  '24h': { label: 'Last 24 Hours', hours: 24, bucketMs: 15 * 60 * 1000 },
  '7d': { label: 'Last 7 Days', hours: 168, bucketMs: 60 * 60 * 1000 },
  '14d': { label: 'Last 14 Days', hours: 336, bucketMs: 24 * 60 * 60 * 1000 },
  '30d': { label: 'Last 30 Days', hours: 720, bucketMs: 3 * 60 * 60 * 1000 },
  '90d': { label: 'Last 90 Days', hours: 2160, bucketMs: 24 * 60 * 60 * 1000 },
}

export const METRICS_PERIOD_OPTIONS = (Object.entries(PERIOD_CONFIGS) as [MetricsPeriod, PeriodConfig][]).map(
  ([value, cfg]) => ({ value, label: cfg.label }),
)

export interface MetricsHistoryEntry {
  capturedAt: string
  membersOnline: number | null
  membersTotal: number | null
  teamspeakOnline: number | null
  gameserversPlayers: number | null
  teamspeakByServer: Record<string, number> | null
  gameserversByServer: Record<string, number> | null
  discussionsTotal: number | null
  discussionsReplies: number | null
  discussionsNewTotal: number | null
  discussionsNewReplies: number | null
}

const METRICS_CACHE_KEY = 'metrics:latest'
const METRICS_COLLECTION_INTERVAL = 15 * 60 * 1000 // 15 minutes

/**
 * Returns ms until the next 15-min collection boundary.
 * e.g. at 12:07 -> 8 min; at 12:00 -> 15 min (fresh boundary).
 */
function msUntilNextCollection(): number {
  const now = Date.now()
  const elapsed = now % METRICS_COLLECTION_INTERVAL
  return METRICS_COLLECTION_INTERVAL - elapsed
}

// Convert a millisecond duration to a Postgres interval string.
function msToPgInterval(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  return `${hours} hours ${minutes} minutes ${seconds} seconds`
}

const METRICS_BUCKET = 'hivecom-content-static'
const METRICS_LATEST_PATH = 'metrics/latest.json'

function normalizeMetricsSnapshot(snapshot: unknown): MetricsSnapshot | null {
  if (snapshot === null || snapshot === undefined || typeof snapshot !== 'object')
    return null

  const record = snapshot as Record<string, unknown>
  const collectedAt = record.collectedAt
  const members = record.members as Record<string, unknown> | undefined
  const community = record.community as Record<string, unknown> | undefined
  const teamspeak = record.teamspeak as Record<string, unknown> | undefined
  const gameservers = record.gameservers as Record<string, unknown> | undefined

  if (typeof collectedAt !== 'string' || members === undefined)
    return null

  return {
    collectedAt,
    members: {
      total: typeof members.total === 'number' ? members.total : 0,
      online: typeof members.online === 'number' ? members.online : 0,
      byCountry: (typeof members.byCountry === 'object' && members.byCountry !== null)
        ? (members.byCountry as Record<string, number>)
        : {},
      byGame: (typeof members.byGame === 'object' && members.byGame !== null)
        ? (members.byGame as Record<string, number>)
        : {},
      bySteamGame: (typeof members.bySteamGame === 'object' && members.bySteamGame !== null)
        ? (members.bySteamGame as Record<string, number>)
        : {},
    },
    community: {
      projects: typeof community?.projects === 'number' ? community.projects : 0,
    },
    discussions: {
      total: typeof (record.discussions as Record<string, unknown>)?.total === 'number' ? (record.discussions as Record<string, unknown>).total as number : 0,
      replies: typeof (record.discussions as Record<string, unknown>)?.replies === 'number' ? (record.discussions as Record<string, unknown>).replies as number : 0,
      newTotal: typeof (record.discussions as Record<string, unknown>)?.newTotal === 'number' ? (record.discussions as Record<string, unknown>).newTotal as number : 0,
      newReplies: typeof (record.discussions as Record<string, unknown>)?.newReplies === 'number' ? (record.discussions as Record<string, unknown>).newReplies as number : 0,
    },
    teamspeak: {
      online: typeof teamspeak?.online === 'number' ? teamspeak.online : 0,
      byServer: (typeof teamspeak?.byServer === 'object' && teamspeak.byServer !== null)
        ? (teamspeak.byServer as Record<string, number>)
        : {},
    },
    gameservers: {
      total: typeof gameservers?.total === 'number' ? gameservers.total : 0,
      players: typeof gameservers?.players === 'number' ? gameservers.players : 0,
      byServer: (typeof gameservers?.byServer === 'object' && gameservers.byServer !== null)
        ? (gameservers.byServer as MetricsSnapshot['gameservers']['byServer'])
        : {},
    },
    storage: {
      buckets: (typeof (record.storage as Record<string, unknown>)?.buckets === 'object'
        && (record.storage as Record<string, unknown>)?.buckets !== null)
        ? (record.storage as Record<string, unknown>).buckets as MetricsSnapshot['storage']['buckets']
        : {},
    },
  }
}

async function fetchMetricsFromStorage(supabase: SupabaseClient<Database>) {
  const { data: { publicUrl } } = supabase.storage.from(METRICS_BUCKET).getPublicUrl(METRICS_LATEST_PATH)
  const bustUrl = `${publicUrl}?t=${Date.now()}`

  let text: string
  try {
    const res = await fetch(bustUrl, { cache: 'no-store' })
    if (!res.ok)
      return null
    text = await res.text()
  }
  catch {
    return null
  }

  try {
    const parsed = JSON.parse(text) as unknown
    return normalizeMetricsSnapshot(parsed)
  }
  catch {
    return null
  }
}

// Normalise one row returned by get_metrics_bucketed into MetricsHistoryEntry.
// The RPC already handles bucketing/averaging - we just map column names.
function normalizeRpcRow(row: Record<string, unknown>): MetricsHistoryEntry {
  return {
    capturedAt: row.captured_at as string,
    membersOnline: row.members_online as number | null,
    membersTotal: row.members_total as number | null,
    teamspeakOnline: row.teamspeak_online as number | null,
    gameserversPlayers: row.gameservers_players as number | null,
    teamspeakByServer: row.teamspeak_by_server as Record<string, number> | null,
    gameserversByServer: row.gameservers_by_server as Record<string, number> | null,
    discussionsTotal: row.discussions_total as number | null,
    discussionsReplies: row.discussions_replies as number | null,
    discussionsNewTotal: row.discussions_new_total as number | null,
    discussionsNewReplies: row.discussions_new_replies as number | null,
  }
}

async function fetchMetricsHistoryFromDB(
  supabase: SupabaseClient<Database>,
  period: MetricsPeriod,
): Promise<MetricsHistoryEntry[]> {
  const config = PERIOD_CONFIGS[period]
  const since = new Date(Date.now() - config.hours * 60 * 60 * 1000).toISOString()
  const until = new Date().toISOString()
  const bucketInterval = msToPgInterval(config.bucketMs)

  const { data, error } = await supabase.rpc('get_metrics_bucketed', {
    p_since: since,
    p_until: until,
    p_bucket_interval: bucketInterval,
  })

  if (error !== null || data === null)
    return []

  return (data as unknown as Record<string, unknown>[]).map(normalizeRpcRow)
}

// Shared module-level state so all callers react to the same fetches.
const metricsHistory = ref<MetricsHistoryEntry[]>([])
const loadingHistory = ref(false)
export const metricsWindow = ref<{ start: Date, end: Date } | null>(null)
let refreshTimer: ReturnType<typeof setTimeout> | null = null

// Separate 90d overview dataset exclusively for the brush - never overwritten
// by period fetches so the brush always shows the full context.
const metricsOverview = ref<MetricsHistoryEntry[]>([])
const loadingOverview = ref(false)

// Shared snapshot state - hoisted so all callers share the same reactive ref.
const metrics = shallowRef<MetricsSnapshot | null>(null)
const loading = shallowRef(false)
const error = shallowRef<string | null>(null)
const latestMetrics = shallowRef<MetricsSnapshot | null>(null)
const loadingLatest = shallowRef(false)

export function useDataMetrics() {
  const supabase = useSupabaseClient<Database>()
  const metricsCache = useCache(CACHE_NAMESPACES.community)

  // Pre-populate synchronously so first render has data on warm cache.
  if (metrics.value === null) {
    const _initialCached = metricsCache.get<MetricsSnapshot>(METRICS_CACHE_KEY)
    if (_initialCached !== null)
      metrics.value = _initialCached
  }

  const fetchMetrics = async () => {
    // Serve from cache until next 15-min collection boundary
    const cached = metricsCache.get<MetricsSnapshot>(METRICS_CACHE_KEY)
    if (cached !== null) {
      metrics.value = cached
      return cached
    }

    loading.value = true
    error.value = null

    try {
      const snapshot = await fetchMetricsFromStorage(supabase)
      metrics.value = snapshot
      if (snapshot !== null) {
        // TTL = time remaining until the *next* collection after this snapshot.
        // Use collectedAt so we don't cache stale data for up to 15 extra minutes
        // if fetchMetrics is called right after a fresh collection.
        const collectedAt = new Date(snapshot.collectedAt).getTime()
        const ttl = Math.max(0, collectedAt + METRICS_COLLECTION_INTERVAL - Date.now())
        metricsCache.set(METRICS_CACHE_KEY, snapshot, ttl)
      }
      return snapshot
    }
    catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch metrics'
      error.value = message
      throw new Error(message)
    }
    finally {
      loading.value = false
    }
  }

  const fetchMetricsWindow = async (start: Date, end: Date): Promise<MetricsHistoryEntry[]> => {
    const cacheKey = `metrics:history:window:${start.getTime()}:${end.getTime()}`
    const cached = metricsCache.get<MetricsHistoryEntry[]>(cacheKey)
    if (cached !== null) {
      metricsHistory.value = cached
      return cached
    }

    loadingHistory.value = true
    error.value = null

    try {
      const durationMs = end.getTime() - start.getTime()
      let bucketMs: number
      if (durationMs <= 24 * 60 * 60 * 1000)
        bucketMs = 15 * 60 * 1000
      else if (durationMs <= 7 * 24 * 60 * 60 * 1000)
        bucketMs = 60 * 60 * 1000
      else if (durationMs <= 30 * 24 * 60 * 60 * 1000)
        bucketMs = 3 * 60 * 60 * 1000
      else
        bucketMs = 24 * 60 * 60 * 1000

      const { data, error: dbError } = await supabase.rpc('get_metrics_bucketed', {
        p_since: start.toISOString(),
        p_until: end.toISOString(),
        p_bucket_interval: msToPgInterval(bucketMs),
      })

      if (dbError !== null || data === null) {
        metricsHistory.value = []
        return []
      }

      const result = (data as unknown as Record<string, unknown>[]).map(normalizeRpcRow)
      metricsHistory.value = result
      metricsCache.set(cacheKey, result, msUntilNextCollection())
      return result
    }
    catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch metrics window'
      error.value = message
      throw new Error(message)
    }
    finally {
      loadingHistory.value = false
    }
  }

  const fetchMetricsHistory = async (period: MetricsPeriod = '24h') => {
    const cacheKey = `metrics:history:${period}`
    const cached = metricsCache.get<MetricsHistoryEntry[]>(cacheKey)
    if (cached !== null) {
      metricsHistory.value = cached
      return cached
    }

    loadingHistory.value = true
    error.value = null

    try {
      const entries = await fetchMetricsHistoryFromDB(supabase, period)
      metricsHistory.value = entries
      metricsCache.set(cacheKey, entries, msUntilNextCollection())
      return entries
    }
    catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch metrics history'
      error.value = message
      throw new Error(message)
    }
    finally {
      loadingHistory.value = false
    }
  }

  // Auto-refresh: after each 15-min boundary + 1 min buffer, fetch latest.json
  // and append the new data point to the history without hitting the DB.
  const REFRESH_BUFFER_MS = 60 * 1000

  const scheduleRefresh = (period: MetricsPeriod) => {
    if (refreshTimer !== null)
      clearTimeout(refreshTimer)

    const delay = msUntilNextCollection() + REFRESH_BUFFER_MS
    const doRefresh = async () => {
      const snapshot = await fetchMetricsFromStorage(supabase)
      if (snapshot === null) {
        // Fetch failed - append a null entry for this bucket so the gap shows
        const bucketMs = PERIOD_CONFIGS[period].bucketMs
        const bucketKey = Math.floor(Date.now() / bucketMs) * bucketMs
        metricsHistory.value = [
          ...metricsHistory.value,
          {
            capturedAt: new Date(bucketKey).toISOString(),
            membersOnline: null,
            membersTotal: null,
            teamspeakOnline: null,
            gameserversPlayers: null,
            teamspeakByServer: null,
            gameserversByServer: null,
            discussionsTotal: null,
            discussionsReplies: null,
            discussionsNewTotal: null,
            discussionsNewReplies: null,
          },
        ]
      }
      else {
        metrics.value = snapshot
        const collectedAt = new Date(snapshot.collectedAt).getTime()
        const ttl = Math.max(0, collectedAt + METRICS_COLLECTION_INTERVAL - Date.now())
        metricsCache.set(METRICS_CACHE_KEY, snapshot, ttl)

        const bucketMs = PERIOD_CONFIGS[period].bucketMs
        const bucketKey = Math.floor(Date.now() / bucketMs) * bucketMs
        const newEntry: MetricsHistoryEntry = {
          capturedAt: new Date(bucketKey).toISOString(),
          membersOnline: snapshot.members.online,
          membersTotal: snapshot.members.total,
          teamspeakOnline: snapshot.teamspeak.online,
          gameserversPlayers: snapshot.gameservers.players,
          teamspeakByServer: snapshot.teamspeak.byServer,
          gameserversByServer: Object.fromEntries(
            Object.entries(snapshot.gameservers.byServer).map(([k, v]) => [k, v.protocol === 'minecraft' ? (v.data?.numPlayers ?? 0) : (v.data?.players ?? 0)]),
          ),
          discussionsTotal: snapshot.discussions.total,
          discussionsReplies: snapshot.discussions.replies,
          discussionsNewTotal: snapshot.discussions.newTotal,
          discussionsNewReplies: snapshot.discussions.newReplies,
        }

        // Replace the last bucket if it matches (null placeholder), otherwise append
        const last = metricsHistory.value.at(-1)
        const lastBucket = last ? Math.floor(new Date(last.capturedAt).getTime() / bucketMs) * bucketMs : null
        if (lastBucket === bucketKey) {
          metricsHistory.value = [...metricsHistory.value.slice(0, -1), newEntry]
        }
        else {
          metricsHistory.value = [...metricsHistory.value, newEntry]
        }

        // Evict the history cache so next full load re-fetches from DB
        const cacheKey = `metrics:history:${period}`
        metricsCache.delete(cacheKey)
      }

      scheduleRefresh(period)
    }
    refreshTimer = setTimeout(() => {
      void doRefresh()
    }, delay)
  }

  onUnmounted(() => {
    if (refreshTimer !== null)
      clearTimeout(refreshTimer)
  })

  const fetchLatestMetrics = async () => {
    loadingLatest.value = true
    try {
      const { data, error: dbError } = await supabase
        .from('metrics')
        .select('*')
        .order('captured_at', { ascending: false })
        .limit(1)
        .single()

      if (dbError !== null || data === null)
        return null

      const snapshot = normalizeMetricsSnapshot((data as unknown as Tables<'metrics'>).data)
      latestMetrics.value = snapshot
      return snapshot
    }
    finally {
      loadingLatest.value = false
    }
  }

  const fetchMetricsOverview = async () => {
    const cacheKey = 'metrics:history:90d'
    const cached = metricsCache.get<MetricsHistoryEntry[]>(cacheKey)
    if (cached !== null) {
      metricsOverview.value = cached
      return cached
    }

    loadingOverview.value = true
    try {
      const entries = await fetchMetricsHistoryFromDB(supabase, '90d')
      metricsOverview.value = entries
      metricsCache.set(cacheKey, entries, msUntilNextCollection())
      return entries
    }
    finally {
      loadingOverview.value = false
    }
  }

  const fetchMetricsForServer = async (
    serverId: number,
    days: number = 14,
  ): Promise<{ capturedAt: string, players: number | null }[]> => {
    const cacheKey = `metrics:server:${serverId}:${days}d`
    const cached = metricsCache.get<{ capturedAt: string, players: number | null }[]>(cacheKey)
    if (cached !== null)
      return cached

    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
    const until = new Date().toISOString()

    const { data, error: dbError } = await supabase.rpc('get_metrics_bucketed', {
      p_since: since,
      p_until: until,
      p_bucket_interval: '24 hours',
    })

    if (dbError !== null || data === null)
      return []

    const serverKey = String(serverId)
    const result = (data as unknown as Record<string, unknown>[]).map(row => ({
      capturedAt: row.captured_at as string,
      players: (row.gameservers_by_server as Record<string, number> | null)?.[serverKey] ?? null,
    }))

    metricsCache.set(cacheKey, result, msUntilNextCollection())
    return result
  }

  return {
    metrics,
    loading,
    error,
    fetchMetrics,
    latestMetrics,
    loadingLatest,
    fetchLatestMetrics,
    metricsHistory,
    loadingHistory,
    fetchMetricsHistory,
    fetchMetricsWindow,
    metricsWindow,
    metricsOverview,
    loadingOverview,
    fetchMetricsOverview,
    scheduleRefresh,
    fetchMetricsForServer,
  }
}
