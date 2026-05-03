import type { SupabaseClient } from '@supabase/supabase-js'
import type { Tables } from '@/types/database.overrides'
import type { Database } from '@/types/database.types'
import type { MetricsSnapshot } from '@/types/metrics'
import { useCache } from '@/composables/useCache'
import { CACHE_NAMESPACES } from '@/lib/cache/namespaces'

export type MetricsPeriod = '24h' | '7d' | '30d' | '90d'

interface PeriodConfig {
  label: string
  hours: number
  bucketMs: number
}

const PERIOD_CONFIGS: Record<MetricsPeriod, PeriodConfig> = {
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
  membersOnline: number
  membersTotal: number
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
      forumPosts: typeof community?.forumPosts === 'number' ? community.forumPosts : 0,
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

  const bucketMap = new Map<number, { onlineSum: number, totalSum: number, count: number }>()

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
      existing.count += 1
    }
    else {
      bucketMap.set(bucketKey, {
        onlineSum: snapshot.members.online,
        totalSum: snapshot.members.total,
        count: 1,
      })
    }
  }

  return Array.from(bucketMap.entries())
    .sort(([a], [b]) => a - b)
    .map(([bucketKey, { onlineSum, totalSum, count }]) => ({
      capturedAt: new Date(bucketKey).toISOString(),
      membersOnline: Math.round(onlineSum / count),
      membersTotal: Math.round(totalSum / count),
    }))
}

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

  const metricsHistory = ref<MetricsHistoryEntry[]>([])
  const loadingHistory = ref(false)

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

  return {
    metrics,
    loading,
    error,
    fetchMetrics,
    metricsHistory,
    loadingHistory,
    fetchMetricsHistory,
  }
}
