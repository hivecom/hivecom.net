import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database.types'
import type { MetricsSnapshot } from '@/types/metrics'
import { useCache } from '@/composables/useCache'
import { CACHE_NAMESPACES } from '@/lib/cache/namespaces'

const METRICS_CACHE_KEY = 'metrics:latest'
const METRICS_TTL = 30 * 60 * 1000 // 30 minutes - aligns with collection interval

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

export function useDataMetrics() {
  const supabase = useSupabaseClient<Database>()
  const metricsCache = useCache(CACHE_NAMESPACES.community)

  // Pre-populate synchronously so first render has data on warm cache.
  const _initialCached = metricsCache.get<MetricsSnapshot>(METRICS_CACHE_KEY)
  const metrics = ref<MetricsSnapshot | null>(_initialCached)
  const loading = ref(false)
  const error = ref<string | null>(null)

  const fetchMetrics = async () => {
    // Serve from cache - metrics are daily, 1hr TTL is conservative
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
        metricsCache.set(METRICS_CACHE_KEY, snapshot, METRICS_TTL)
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

  return {
    metrics,
    loading,
    error,
    fetchMetrics,
  }
}
