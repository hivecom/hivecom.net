import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database.types'
import type { MetricsSnapshot } from '@/types/metrics'
import { useCache } from '@/composables/useCache'
import { CACHE_NAMESPACES } from '@/lib/cache/namespaces'

const METRICS_CACHE_KEY = 'metrics:daily'
const METRICS_TTL = 60 * 60 * 1000 // 1 hour - metrics are daily snapshots

const METRICS_BUCKET = 'hivecom-content-static'

function buildPathFromDate(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')

  return `metrics/${year}/${month}/${day}.json`
}

function normalizeMetricsSnapshot(snapshot: unknown): MetricsSnapshot | null {
  if (snapshot === null || snapshot === undefined || typeof snapshot !== 'object')
    return null

  const record = snapshot as Record<string, unknown>
  const collectedAt = record.collectedAt
  const totals = record.totals as Record<string, unknown> | undefined
  const breakdowns = record.breakdowns as Record<string, unknown> | undefined

  if (typeof collectedAt !== 'string' || totals === undefined)
    return null

  const users = totals.users
  const gameservers = totals.gameservers
  const projects = totals.projects
  const forumPosts = totals.forumPosts

  if (
    typeof users !== 'number'
    || typeof gameservers !== 'number'
    || typeof projects !== 'number'
    || typeof forumPosts !== 'number'
  ) {
    return null
  }

  const usersByCountry
    = typeof breakdowns?.usersByCountry === 'object' && breakdowns.usersByCountry !== null
      ? (breakdowns.usersByCountry as Record<string, number>)
      : {}

  return {
    collectedAt,
    totals: {
      users,
      gameservers,
      projects,
      forumPosts,
    },
    breakdowns: {
      usersByCountry,
    },
  }
}

async function fetchMetricsFromStorage(supabase: SupabaseClient<Database>, path: string) {
  const { data, error } = await supabase.storage.from(METRICS_BUCKET).download(path)

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

async function fetchMetricsWithFallback(supabase: SupabaseClient<Database>) {
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)

  for (const date of [today, yesterday]) {
    const path = buildPathFromDate(date)
    const snapshot = await fetchMetricsFromStorage(supabase, path)

    if (snapshot)
      return snapshot
  }

  return null
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
      const snapshot = await fetchMetricsWithFallback(supabase)
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
