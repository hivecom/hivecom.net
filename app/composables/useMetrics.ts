import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database.types'
import type { MetricsSnapshot } from '@/types/metrics'

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

async function fetchMetricsFromDatabase(supabase: SupabaseClient<Database>): Promise<MetricsSnapshot> {
  const [usersResponse, gameserversResponse, projectsResponse, forumResponse] = await Promise.all([
    supabase.from('profiles').select('id', { count: 'exact', head: true }),
    supabase.from('gameservers').select('id', { count: 'exact', head: true }),
    supabase.from('projects').select('id', { count: 'exact', head: true }),
    supabase.from('discussions').select('id', { count: 'exact', head: true }).not('discussion_topic_id', 'is', null),
  ])

  if (usersResponse.error)
    throw new Error(`Unable to get user count: ${usersResponse.error.message}`)

  if (gameserversResponse.error)
    throw new Error(`Unable to get gameserver count: ${gameserversResponse.error.message}`)

  if (projectsResponse.error)
    throw new Error(`Unable to get project count: ${projectsResponse.error.message}`)

  if (forumResponse.error)
    throw new Error(`Unable to get forum discussion count: ${forumResponse.error.message}`)

  return {
    collectedAt: new Date().toISOString(),
    totals: {
      users: usersResponse.count ?? 0,
      gameservers: gameserversResponse.count ?? 0,
      projects: projectsResponse.count ?? 0,
      forumPosts: forumResponse.count ?? 0,
    },
    breakdowns: {
      usersByCountry: {},
    },
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

  return fetchMetricsFromDatabase(supabase)
}

export function useMetrics() {
  const supabase = useSupabaseClient<Database>()
  const metrics = ref<MetricsSnapshot | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

  const fetchMetrics = async () => {
    loading.value = true
    error.value = null

    try {
      const snapshot = await fetchMetricsWithFallback(supabase)
      metrics.value = snapshot
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
