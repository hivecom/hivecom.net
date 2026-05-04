import type { SupabaseClient } from '@supabase/supabase-js'
import type { Tables } from '@/types/database.overrides'
import type { Database } from '@/types/database.types'
import type { MetricsSnapshot } from '@/types/metrics'
import { onUnmounted, ref } from 'vue'
import { useCache } from '@/composables/useCache'
import { CACHE_NAMESPACES } from '@/lib/cache/namespaces'

export type MetricsPeriod = '24h' | '7d' | '30d' | '90d'

interface PeriodConfig {
  label: string
  hours: number
  bucketMs: number
}

export const PERIOD_CONFIGS: Record<MetricsPeriod, PeriodConfig> = {
  '24h': { label: 'Last 24 Hours', hours: 24, bucketMs: 15 * 60 * 1000 },
  '7d': { label: 'Last 7 Days', hours: 168, bucketMs: 60 * 60 * 1000 },
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
    },
    community: {
      projects: typeof community?.projects === 'number' ? community.projects : 0,
    },
    discussions: {
      total: typeof (record.discussions as Record<string, unknown>)?.total === 'number' ? (record.discussions as Record<string, unknown>).total as number : 0,
      replies: typeof (record.discussions as Record<string, unknown>)?.replies === 'number' ? (record.discussions as Record<string, unknown>).replies as number : 0,
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
  }
}

async function fetchMetricsFromStorage(supabase: SupabaseClient<Database>) {
  const { data, error } = await supabase.storage.from(METRICS_BUCKET).download(METRICS_LATEST_PATH)

  if (error !== null || data === null)
    return null

  try {
    const json = await data.text()
    const parsed = JSON.parse(json) as unknown
    return normalizeMetricsSnapshot(parsed)
  }
  catch {
    return null
  }
}

async function fetchMetricsHistoryFromDB(
  supabase: SupabaseClient<Database>,
  period: MetricsPeriod,
): Promise<MetricsHistoryEntry[]> {
  const config = PERIOD_CONFIGS[period]
  const since = new Date(Date.now() - config.hours * 60 * 60 * 1000).toISOString()

  const { data, error } = await supabase
    .from('metrics')
    .select('*')
    .gte('captured_at', since)
    .order('captured_at', { ascending: true })

  if (error !== null || data === null)
    return []

  interface BucketEntry {
    onlineSum: number
    totalSum: number
    tsOnlineSum: number
    gsPlayersSum: number
    discussionsTotalSum: number
    discussionsRepliesSum: number
    count: number
    tsServerSums: Record<string, number>
    gsServerSums: Record<string, number>
  }
  const bucketMap = new Map<number, BucketEntry>()

  for (const row of data as unknown as Tables<'metrics'>[]) {
    const snapshot = normalizeMetricsSnapshot(row.data)
    if (snapshot === null)
      continue

    const ts = new Date(row.captured_at).getTime()
    const bucketKey = Math.floor(ts / config.bucketMs) * config.bucketMs
    const existing = bucketMap.get(bucketKey)

    if (existing) {
      existing.onlineSum += snapshot.members.online
      existing.totalSum += snapshot.members.total
      existing.tsOnlineSum += snapshot.teamspeak.online
      existing.gsPlayersSum += snapshot.gameservers.players
      existing.discussionsTotalSum += snapshot.discussions.total
      existing.discussionsRepliesSum += snapshot.discussions.replies
      existing.count += 1
      for (const [name, count] of Object.entries(snapshot.teamspeak.byServer)) {
        existing.tsServerSums[name] = (existing.tsServerSums[name] ?? 0) + count
      }
      for (const [name, detail] of Object.entries(snapshot.gameservers.byServer)) {
        existing.gsServerSums[name] = (existing.gsServerSums[name] ?? 0) + (detail.data?.players ?? 0)
      }
    }
    else {
      const tsServerSums: Record<string, number> = {}
      for (const [name, count] of Object.entries(snapshot.teamspeak.byServer)) {
        tsServerSums[name] = count
      }
      const gsServerSums: Record<string, number> = {}
      for (const [name, detail] of Object.entries(snapshot.gameservers.byServer)) {
        gsServerSums[name] = detail.data?.players ?? 0
      }
      bucketMap.set(bucketKey, {
        onlineSum: snapshot.members.online,
        totalSum: snapshot.members.total,
        tsOnlineSum: snapshot.teamspeak.online,
        gsPlayersSum: snapshot.gameservers.players,
        discussionsTotalSum: snapshot.discussions.total,
        discussionsRepliesSum: snapshot.discussions.replies,
        count: 1,
        tsServerSums,
        gsServerSums,
      })
    }
  }

  // Generate all expected buckets for the period and null-fill missing ones
  // so spanGaps: false renders visible breaks in the chart
  const now = Date.now()
  const periodStart = now - config.hours * 60 * 60 * 1000
  const firstBucket = Math.ceil(periodStart / config.bucketMs) * config.bucketMs
  const lastBucket = Math.floor(now / config.bucketMs) * config.bucketMs

  const result: MetricsHistoryEntry[] = []
  for (let bucket = firstBucket; bucket <= lastBucket; bucket += config.bucketMs) {
    const entry = bucketMap.get(bucket)
    if (entry) {
      result.push({
        capturedAt: new Date(bucket).toISOString(),
        membersOnline: Math.round(entry.onlineSum / entry.count),
        membersTotal: Math.round(entry.totalSum / entry.count),
        teamspeakOnline: Math.round(entry.tsOnlineSum / entry.count),
        gameserversPlayers: Math.round(entry.gsPlayersSum / entry.count),
        teamspeakByServer: Object.fromEntries(
          Object.entries(entry.tsServerSums).map(([k, v]) => [k, Math.round(v / entry.count)]),
        ),
        gameserversByServer: Object.fromEntries(
          Object.entries(entry.gsServerSums).map(([k, v]) => [k, Math.round(v / entry.count)]),
        ),
        discussionsTotal: Math.round(entry.discussionsTotalSum / entry.count),
        discussionsReplies: Math.round(entry.discussionsRepliesSum / entry.count),
      })
    }
    else {
      result.push({
        capturedAt: new Date(bucket).toISOString(),
        membersOnline: null,
        membersTotal: null,
        teamspeakOnline: null,
        gameserversPlayers: null,
        teamspeakByServer: null,
        gameserversByServer: null,
        discussionsTotal: null,
        discussionsReplies: null,
      })
    }
  }

  return result
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

export function useDataMetrics() {
  const supabase = useSupabaseClient<Database>()
  const metricsCache = useCache(CACHE_NAMESPACES.community)

  // Pre-populate synchronously so first render has data on warm cache.
  const _initialCached = metricsCache.get<MetricsSnapshot>(METRICS_CACHE_KEY)
  const metrics = ref<MetricsSnapshot | null>(_initialCached)
  const loading = ref(false)
  const error = ref<string | null>(null)

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
      if (snapshot !== null)
        metricsCache.set(METRICS_CACHE_KEY, snapshot, msUntilNextCollection())
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
      const { data, error: dbError } = await supabase
        .from('metrics')
        .select('*')
        .gte('captured_at', start.toISOString())
        .lte('captured_at', end.toISOString())
        .order('captured_at', { ascending: true })

      if (dbError !== null || data === null) {
        metricsHistory.value = []
        return []
      }

      const durationMs = end.getTime() - start.getTime()
      let bucketMs: number
      if (durationMs <= 24 * 60 * 60 * 1000) {
        bucketMs = 15 * 60 * 1000
      }
      else if (durationMs <= 7 * 24 * 60 * 60 * 1000) {
        bucketMs = 60 * 60 * 1000
      }
      else if (durationMs <= 30 * 24 * 60 * 60 * 1000) {
        bucketMs = 3 * 60 * 60 * 1000
      }
      else {
        bucketMs = 24 * 60 * 60 * 1000
      }

      interface WindowBucketEntry {
        onlineSum: number
        totalSum: number
        tsOnlineSum: number
        gsPlayersSum: number
        discussionsTotalSum: number
        discussionsRepliesSum: number
        count: number
        tsServerSums: Record<string, number>
        gsServerSums: Record<string, number>
      }
      const bucketMap = new Map<number, WindowBucketEntry>()

      for (const row of data as unknown as Tables<'metrics'>[]) {
        const snapshot = normalizeMetricsSnapshot(row.data)
        if (snapshot === null)
          continue

        const ts = new Date(row.captured_at).getTime()
        const bucketKey = Math.floor(ts / bucketMs) * bucketMs
        const existing = bucketMap.get(bucketKey)

        if (existing) {
          existing.onlineSum += snapshot.members.online
          existing.totalSum += snapshot.members.total
          existing.tsOnlineSum += snapshot.teamspeak.online
          existing.gsPlayersSum += snapshot.gameservers.players
          existing.discussionsTotalSum += snapshot.discussions.total
          existing.discussionsRepliesSum += snapshot.discussions.replies
          existing.count += 1
          for (const [name, count] of Object.entries(snapshot.teamspeak.byServer)) {
            existing.tsServerSums[name] = (existing.tsServerSums[name] ?? 0) + count
          }
          for (const [name, detail] of Object.entries(snapshot.gameservers.byServer)) {
            existing.gsServerSums[name] = (existing.gsServerSums[name] ?? 0) + (detail.data?.players ?? 0)
          }
        }
        else {
          const tsServerSums: Record<string, number> = {}
          for (const [name, count] of Object.entries(snapshot.teamspeak.byServer)) {
            tsServerSums[name] = count
          }
          const gsServerSums: Record<string, number> = {}
          for (const [name, detail] of Object.entries(snapshot.gameservers.byServer)) {
            gsServerSums[name] = detail.data?.players ?? 0
          }
          bucketMap.set(bucketKey, {
            onlineSum: snapshot.members.online,
            totalSum: snapshot.members.total,
            tsOnlineSum: snapshot.teamspeak.online,
            gsPlayersSum: snapshot.gameservers.players,
            discussionsTotalSum: snapshot.discussions.total,
            discussionsRepliesSum: snapshot.discussions.replies,
            count: 1,
            tsServerSums,
            gsServerSums,
          })
        }
      }

      const firstBucket = Math.ceil(start.getTime() / bucketMs) * bucketMs
      const lastBucket = Math.floor(end.getTime() / bucketMs) * bucketMs

      const result: MetricsHistoryEntry[] = []
      for (let bucket = firstBucket; bucket <= lastBucket; bucket += bucketMs) {
        const entry = bucketMap.get(bucket)
        if (entry) {
          result.push({
            capturedAt: new Date(bucket).toISOString(),
            membersOnline: Math.round(entry.onlineSum / entry.count),
            membersTotal: Math.round(entry.totalSum / entry.count),
            teamspeakOnline: Math.round(entry.tsOnlineSum / entry.count),
            gameserversPlayers: Math.round(entry.gsPlayersSum / entry.count),
            teamspeakByServer: Object.fromEntries(
              Object.entries(entry.tsServerSums).map(([k, v]) => [k, Math.round(v / entry.count)]),
            ),
            gameserversByServer: Object.fromEntries(
              Object.entries(entry.gsServerSums).map(([k, v]) => [k, Math.round(v / entry.count)]),
            ),
            discussionsTotal: Math.round(entry.discussionsTotalSum / entry.count),
            discussionsReplies: Math.round(entry.discussionsRepliesSum / entry.count),
          })
        }
        else {
          result.push({
            capturedAt: new Date(bucket).toISOString(),
            membersOnline: null,
            membersTotal: null,
            teamspeakOnline: null,
            gameserversPlayers: null,
            teamspeakByServer: null,
            gameserversByServer: null,
            discussionsTotal: null,
            discussionsReplies: null,
          })
        }
      }

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
          },
        ]
      }
      else {
        metrics.value = snapshot
        metricsCache.set(METRICS_CACHE_KEY, snapshot, msUntilNextCollection())

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
            Object.entries(snapshot.gameservers.byServer).map(([k, v]) => [k, v.data?.players ?? 0]),
          ),
          discussionsTotal: snapshot.discussions.total,
          discussionsReplies: snapshot.discussions.replies,
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

  const latestMetrics = ref<MetricsSnapshot | null>(null)
  const loadingLatest = ref(false)

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
  }
}
