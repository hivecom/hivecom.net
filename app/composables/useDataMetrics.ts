import type { SupabaseClient } from '@supabase/supabase-js'
import type { Tables } from '@/types/database.overrides'
import type { Database } from '@/types/database.types'
import type { MetricsSnapshot } from '@/types/metrics'
import { ref } from 'vue'
import { useCache } from '@/composables/useCache'
import { CACHE_NAMESPACES } from '@/lib/cache/namespaces'

export type MetricsPeriod = '6h' | '24h' | '7d' | '14d' | '30d' | '90d' | '1y' | '3y' | 'all'

interface PeriodConfig {
  label: string
  hours: number
  bucketMs: number
  /**
   * Spans everything ever collected rather than a fixed lookback. `hours` is
   * only the fallback ceiling for when the earliest timestamp isn't known yet.
   */
  allTime?: boolean
}

export const PERIOD_CONFIGS: Record<MetricsPeriod, PeriodConfig> = {
  '6h': { label: 'Last 6 Hours', hours: 6, bucketMs: 5 * 60 * 1000 },
  '24h': { label: 'Last 24 Hours', hours: 24, bucketMs: 15 * 60 * 1000 },
  '7d': { label: 'Last 7 Days', hours: 168, bucketMs: 60 * 60 * 1000 },
  '14d': { label: 'Last 14 Days', hours: 336, bucketMs: 2 * 60 * 60 * 1000 },
  '30d': { label: 'Last 30 Days', hours: 720, bucketMs: 3 * 60 * 60 * 1000 },
  '90d': { label: 'Last 90 Days', hours: 2160, bucketMs: 24 * 60 * 60 * 1000 },
  '1y': { label: 'Last Year', hours: 8760, bucketMs: 24 * 60 * 60 * 1000 },
  '3y': { label: 'Last 3 Years', hours: 26280, bucketMs: 7 * 24 * 60 * 60 * 1000 },
  'all': { label: 'All Time', hours: 87600, bucketMs: 7 * 24 * 60 * 60 * 1000, allTime: true },
}

export const METRICS_PERIOD_OPTIONS = (Object.entries(PERIOD_CONFIGS) as [MetricsPeriod, PeriodConfig][]).map(
  ([value, cfg]) => ({ value, label: cfg.label }),
)

export interface MetricsHistoryEntry {
  capturedAt: string
  usersOnline: number | null
  usersTotal: number | null
  teamspeakOnline: number | null
  gameserversPlayers: number | null
  teamspeakByServer: Record<string, number> | null
  gameserversByServer: Record<string, number> | null
  usersByGame: Record<string, number> | null
  usersBySteamGame: Record<string, number> | null
  usersGameActivity: number | null
  usersSteamGameActivity: number | null
  discussionsTotal: number | null
  discussionsReplies: number | null
  discussionsNewTotal: number | null
  discussionsNewReplies: number | null
  ircOnline: number | null
  ircChannels: number | null
  ircMessages: number | null
  ircByChannel: Record<string, number> | null
  ircMessagesByChannel: Record<string, number> | null
}

// Shown next to the IRC badge wherever message counts appear, so readers know
// what the number covers before comparing it against their own experience.
export const IRC_MESSAGES_INFO = 'Message counts cover registered public channels with history enabled, plus secret channels. Direct messages aren\'t included.'

export function formatMessageCount(total: number): string {
  return `${total} ${total === 1 ? 'message' : 'messages'}`
}

const METRICS_CACHE_KEY = 'metrics:latest'
export const METRICS_COLLECTION_INTERVAL = 5 * 60 * 1000 // 5 minutes
export const METRICS_REFRESH_BUFFER_MS = 30 * 1000 // buffer after collection boundary

/**
 * Returns ms until the next 5-min collection boundary.
 * e.g. at 12:07 -> 3 min; at 12:00 -> 5 min (fresh boundary).
 */
function msUntilNextCollection(): number {
  const now = Date.now()
  const elapsed = now % METRICS_COLLECTION_INTERVAL
  return METRICS_COLLECTION_INTERVAL - elapsed
}

/**
 * Bucket width for an arbitrary window duration, so the point count stays in a
 * range the charts can actually draw. Anything past a year steps up to weekly
 * buckets - daily over three years is ~1100 bars in a few hundred pixels.
 */
function bucketMsForDuration(durationMs: number): number {
  const hour = 60 * 60 * 1000
  const day = 24 * hour
  if (durationMs <= 6 * hour)
    return 5 * 60 * 1000
  if (durationMs <= day)
    return 15 * 60 * 1000
  if (durationMs <= 7 * day)
    return hour
  if (durationMs <= 30 * day)
    return 3 * hour
  if (durationMs <= 365 * day)
    return day
  return 7 * day
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
  const users = record.users as Record<string, unknown> | undefined
  const community = record.community as Record<string, unknown> | undefined
  const teamspeak = record.teamspeak as Record<string, unknown> | undefined
  const irc = record.irc as Record<string, unknown> | undefined
  const gameservers = record.gameservers as Record<string, unknown> | undefined

  if (typeof collectedAt !== 'string' || users === undefined)
    return null

  return {
    collectedAt,
    users: {
      total: typeof users.total === 'number' ? users.total : 0,
      online: typeof users.online === 'number' ? users.online : 0,
      byCountry: (typeof users.byCountry === 'object' && users.byCountry !== null)
        ? (users.byCountry as Record<string, number>)
        : {},
      byGame: (typeof users.byGame === 'object' && users.byGame !== null)
        ? (users.byGame as Record<string, number>)
        : {},
      bySteamGame: (typeof users.bySteamGame === 'object' && users.bySteamGame !== null)
        ? (users.bySteamGame as Record<string, number>)
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
    irc: {
      online: typeof irc?.online === 'number' ? irc.online : 0,
      channels: typeof irc?.channels === 'number' ? irc.channels : 0,
      messages: typeof irc?.messages === 'number' ? irc.messages : 0,
      byChannel: (typeof irc?.byChannel === 'object' && irc.byChannel !== null)
        ? (irc.byChannel as Record<string, number>)
        : {},
      messagesByChannel: (typeof irc?.messagesByChannel === 'object' && irc.messagesByChannel !== null)
        ? (irc.messagesByChannel as Record<string, number>)
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
    usersOnline: row.users_online as number | null,
    usersTotal: row.users_total as number | null,
    teamspeakOnline: row.teamspeak_online as number | null,
    gameserversPlayers: row.gameservers_players as number | null,
    teamspeakByServer: row.teamspeak_by_server as Record<string, number> | null,
    gameserversByServer: row.gameservers_by_server as Record<string, number> | null,
    usersByGame: row.users_by_game as Record<string, number> | null,
    usersBySteamGame: row.users_by_steam_game as Record<string, number> | null,
    usersGameActivity: row.users_by_game !== null && row.users_by_game !== undefined
      ? Object.values(row.users_by_game as Record<string, number>).reduce((a, b) => a + b, 0)
      : null,
    usersSteamGameActivity: row.users_by_steam_game !== null && row.users_by_steam_game !== undefined
      ? Object.values(row.users_by_steam_game as Record<string, number>).reduce((a, b) => a + b, 0)
      : null,
    discussionsTotal: row.discussions_total as number | null,
    discussionsReplies: row.discussions_replies as number | null,
    discussionsNewTotal: row.discussions_new_total as number | null,
    discussionsNewReplies: row.discussions_new_replies as number | null,
    ircOnline: row.irc_online as number | null,
    ircChannels: row.irc_channels as number | null,
    ircMessages: row.irc_messages as number | null,
    ircByChannel: row.irc_by_channel as Record<string, number> | null,
    ircMessagesByChannel: row.irc_messages_by_channel as Record<string, number> | null,
  }
}

// Returns null when the query fails, so callers can tell a broken fetch apart
// from a period that genuinely has no data.
async function fetchMetricsHistoryFromDB(
  supabase: SupabaseClient<Database>,
  period: MetricsPeriod,
): Promise<MetricsHistoryEntry[] | null> {
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
    return null

  return (data as unknown as Record<string, unknown>[]).map(normalizeRpcRow)
}

// In-flight history fetches keyed by cache key. The metrics page mounts five
// charts plus the brush, and a period switch makes all of them request the
// same range at once - before any response has landed in the cache. Sharing
// the pending promise collapses those into a single RPC call. Six concurrent
// copies of get_metrics_bucketed were enough to push each past the 8s
// statement timeout on long ranges.
// Null propagates a failed fetch through the coalescing layer so callers can
// tell it apart from a range that legitimately holds no rows.
const inflightHistory = new Map<string, Promise<MetricsHistoryEntry[] | null>>()

async function coalesceHistory(
  key: string,
  fetcher: () => Promise<MetricsHistoryEntry[] | null>,
): Promise<MetricsHistoryEntry[] | null> {
  const existing = inflightHistory.get(key)
  if (existing !== undefined)
    return existing
  const promise = fetcher().finally(() => inflightHistory.delete(key))
  inflightHistory.set(key, promise)
  return promise
}

// Shared module-level state so all callers react to the same fetches.
const metricsHistory = ref<MetricsHistoryEntry[]>([])
const loadingHistory = ref(false)
export const metricsWindow = ref<{ start: Date, end: Date } | null>(null)

// Separate 90d overview dataset exclusively for the brush - never overwritten
// by period fetches so the brush always shows the full context.
const metricsOverview = ref<MetricsHistoryEntry[]>([])
const loadingOverview = ref(false)
// How far back the overview currently reaches. Null until the first fetch.
let overviewSinceMs: number | null = null

// Shared snapshot state - hoisted so all callers share the same reactive ref.
const metrics = shallowRef<MetricsSnapshot | null>(null)
const loading = shallowRef(false)
const error = shallowRef<string | null>(null)
const latestMetrics = shallowRef<MetricsSnapshot | null>(null)
const loadingLatest = shallowRef(false)
const lastFetchedAt = shallowRef<Date | null>(null)

// The refresh machinery outlives any single component, so it holds its own
// cache and client rather than borrowing them from whichever consumer happened
// to arm a timer first.
const metricsCache = useCache(CACHE_NAMESPACES.community)
let metricsClient: SupabaseClient<Database> | null = null

/**
 * Which period last wrote the shared `metricsHistory` ref, or null while a
 * window fetch owns it. A period only writes the shared ref on refresh while it
 * still owns it, so a background period can't overwrite the visible chart.
 */
let sharedHistoryPeriod: MetricsPeriod | null = null

function cacheSnapshot(snapshot: MetricsSnapshot): void {
  // TTL runs to the *next* collection after this snapshot, so one fetched just
  // after a fresh collection isn't held for five extra minutes.
  const collectedAt = new Date(snapshot.collectedAt).getTime()
  metricsCache.set(METRICS_CACHE_KEY, snapshot, Math.max(0, collectedAt + METRICS_COLLECTION_INTERVAL - Date.now()))
  lastFetchedAt.value = new Date()
}

// ── Snapshot auto-refresh ─────────────────────────────────────────────────────
// Ref-counted: runs as long as at least one live consumer holds the composable.

let snapshotRefreshTimer: ReturnType<typeof setTimeout> | null = null
let activeConsumers = 0

async function refreshSnapshot(): Promise<void> {
  if (metricsClient === null)
    return
  const snapshot = await fetchMetricsFromStorage(metricsClient)
  if (snapshot === null)
    return
  metrics.value = snapshot
  cacheSnapshot(snapshot)
}

function scheduleSnapshotRefresh(): void {
  if (snapshotRefreshTimer !== null)
    clearTimeout(snapshotRefreshTimer)

  snapshotRefreshTimer = setTimeout(() => {
    void refreshSnapshot().finally(() => {
      if (activeConsumers > 0)
        scheduleSnapshotRefresh()
    })
  }, msUntilNextCollection() + METRICS_REFRESH_BUFFER_MS)
}

// ── History auto-refresh ──────────────────────────────────────────────────────
//
// Consumers subscribe to a period and get an unsubscribe back. Subscriptions
// are ref-counted per period, so one component unmounting can't cancel a timer
// another still depends on, and each period owns its own timer, so two charts
// on different periods both stay current instead of whichever mounted last
// silently winning.

export type MetricsRefreshListener = (entries: MetricsHistoryEntry[]) => void

interface PeriodSubscription {
  consumers: number
  listeners: Set<MetricsRefreshListener>
  timer: ReturnType<typeof setTimeout> | null
  lastRefreshedAt: number
}

const periodSubscriptions = new Map<MetricsPeriod, PeriodSubscription>()

async function refreshPeriod(period: MetricsPeriod): Promise<void> {
  if (metricsClient === null)
    return

  const cacheKey = `metrics:history:${period}`
  const client = metricsClient
  const entries = await coalesceHistory(cacheKey, async () => fetchMetricsHistoryFromDB(client, period))

  // A failed fetch leaves the last good data in place. Writing the empty array
  // through would blank every chart on this period over a transient error.
  if (entries === null)
    return

  const subscription = periodSubscriptions.get(period)
  if (subscription !== undefined)
    subscription.lastRefreshedAt = Date.now()

  metricsCache.set(cacheKey, entries, msUntilNextCollection())
  if (sharedHistoryPeriod === period)
    metricsHistory.value = entries
  // Isolated consumers keep their own refs and never observe the shared one,
  // so hand them the entries directly.
  subscription?.listeners.forEach(listener => listener(entries))
}

function schedulePeriodRefresh(period: MetricsPeriod): void {
  const subscription = periodSubscriptions.get(period)
  if (subscription === undefined)
    return
  if (subscription.timer !== null)
    clearTimeout(subscription.timer)

  subscription.timer = setTimeout(() => {
    void refreshPeriod(period).finally(() => {
      // Re-arm only while someone is still listening.
      if (periodSubscriptions.has(period))
        schedulePeriodRefresh(period)
    })
  }, msUntilNextCollection() + METRICS_REFRESH_BUFFER_MS)
}

function subscribePeriod(period: MetricsPeriod, listener?: MetricsRefreshListener): () => void {
  let subscription = periodSubscriptions.get(period)
  if (subscription === undefined) {
    // Subscribing follows a load, so treat now as the last refresh.
    subscription = { consumers: 0, listeners: new Set(), timer: null, lastRefreshedAt: Date.now() }
    periodSubscriptions.set(period, subscription)
  }

  subscription.consumers++
  if (listener !== undefined)
    subscription.listeners.add(listener)
  if (subscription.timer === null)
    schedulePeriodRefresh(period)

  let released = false
  return () => {
    if (released)
      return
    released = true

    const current = periodSubscriptions.get(period)
    if (current === undefined)
      return
    if (listener !== undefined)
      current.listeners.delete(listener)
    current.consumers--
    if (current.consumers > 0)
      return

    if (current.timer !== null)
      clearTimeout(current.timer)
    periodSubscriptions.delete(period)
  }
}

// A backgrounded tab throttles timers and a sleeping machine stops them
// outright, so by the time the tab is visible again a scheduled refresh can be
// arbitrarily overdue. Catch up on anything past its collection interval and
// re-arm every timer from the current time.
if (import.meta.client) {
  const { isHidden } = usePageVisibility()

  watch(isHidden, (hidden) => {
    if (hidden || metricsClient === null)
      return

    const isStale = (since: number) => Date.now() - since >= METRICS_COLLECTION_INTERVAL

    if (activeConsumers > 0) {
      if (lastFetchedAt.value === null || isStale(lastFetchedAt.value.getTime()))
        void refreshSnapshot()
      scheduleSnapshotRefresh()
    }

    for (const [period, subscription] of periodSubscriptions) {
      if (isStale(subscription.lastRefreshedAt))
        void refreshPeriod(period)
      schedulePeriodRefresh(period)
    }
  })
}

export function useDataMetrics() {
  const supabase = useSupabaseClient<Database>()
  metricsClient = supabase

  // Pre-populate synchronously so first render has data on warm cache.
  const _initialCached = metricsCache.get<MetricsSnapshot>(METRICS_CACHE_KEY)
  if (_initialCached !== null) {
    metrics.value ??= _initialCached
  }
  // Set lastFetchedAt from whatever snapshot is available - cache or already-loaded module ref.
  if (lastFetchedAt.value === null) {
    const source = _initialCached ?? metrics.value
    if (source !== null)
      lastFetchedAt.value = new Date(source.collectedAt)
  }

  // Refresh subscriptions owned by this instance, released together on
  // teardown. Tracked per instance so unmounting one consumer can never cancel
  // another's refresh.
  const ownedSubscriptions = new Set<() => void>()

  /**
   * Keep `period` refreshing for as long as this consumer is alive. Pass
   * `onRefresh` when reading history through the isolated fetchers, which never
   * observe the shared `metricsHistory` ref. Returns an unsubscribe; calling it
   * is optional since teardown releases anything left over.
   */
  const scheduleRefresh = (period: MetricsPeriod, onRefresh?: MetricsRefreshListener): (() => void) => {
    const release = subscribePeriod(period, onRefresh)
    const stop = () => {
      ownedSubscriptions.delete(stop)
      release()
    }
    ownedSubscriptions.add(stop)
    return stop
  }

  // Only take a ref-count when there's a scope to release it in. A scopeless
  // call is a one-shot fetch, not a live consumer, and counting it would pin
  // the snapshot timer open forever.
  if (getCurrentScope() !== undefined) {
    activeConsumers++
    if (activeConsumers === 1)
      scheduleSnapshotRefresh()

    onScopeDispose(() => {
      for (const stop of [...ownedSubscriptions])
        stop()

      activeConsumers--
      if (activeConsumers === 0 && snapshotRefreshTimer !== null) {
        clearTimeout(snapshotRefreshTimer)
        snapshotRefreshTimer = null
      }
    })
  }

  const fetchMetrics = async () => {
    // Serve from cache until next collection boundary
    const cached = metricsCache.get<MetricsSnapshot>(METRICS_CACHE_KEY)
    if (cached !== null) {
      metrics.value = cached
      lastFetchedAt.value ??= new Date(cached.collectedAt)
      return cached
    }

    loading.value = true
    error.value = null

    try {
      const snapshot = await fetchMetricsFromStorage(supabase)
      metrics.value = snapshot
      if (snapshot !== null) {
        // TTL = time remaining until the *next* collection after this snapshot.
        // Use collectedAt so we don't cache stale data for up to 5 extra minutes
        // if fetchMetrics is called right after a fresh collection.
        const collectedAt = new Date(snapshot.collectedAt).getTime()
        const ttl = Math.max(0, collectedAt + METRICS_COLLECTION_INTERVAL - Date.now())
        metricsCache.set(METRICS_CACHE_KEY, snapshot, ttl)
        lastFetchedAt.value = new Date()
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

  // Shared fetch for a window range - concurrent callers with the same range
  // share one RPC call via coalesceHistory.
  const fetchWindowEntries = async (start: Date, end: Date): Promise<MetricsHistoryEntry[] | null> => {
    const cacheKey = `metrics:history:window:${start.getTime()}:${end.getTime()}`
    return coalesceHistory(cacheKey, async () => {
      const bucketMs = bucketMsForDuration(end.getTime() - start.getTime())

      const { data, error: dbError } = await supabase.rpc('get_metrics_bucketed', {
        p_since: start.toISOString(),
        p_until: end.toISOString(),
        p_bucket_interval: msToPgInterval(bucketMs),
      })

      if (dbError !== null || data === null)
        return null

      const result = (data as unknown as Record<string, unknown>[]).map(normalizeRpcRow)
      metricsCache.set(cacheKey, result, msUntilNextCollection())
      return result
    })
  }

  const fetchMetricsWindow = async (start: Date, end: Date): Promise<MetricsHistoryEntry[]> => {
    const cacheKey = `metrics:history:window:${start.getTime()}:${end.getTime()}`
    const cached = metricsCache.get<MetricsHistoryEntry[]>(cacheKey)
    if (cached !== null) {
      sharedHistoryPeriod = null
      metricsHistory.value = cached
      return cached
    }

    loadingHistory.value = true
    error.value = null

    try {
      const result = await fetchWindowEntries(start, end) ?? []
      sharedHistoryPeriod = null
      metricsHistory.value = result
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

  // Like fetchMetricsWindow but does not write to shared refs.
  const fetchMetricsWindowIsolated = async (start: Date, end: Date): Promise<MetricsHistoryEntry[]> => {
    const cacheKey = `metrics:history:window:${start.getTime()}:${end.getTime()}`
    const cached = metricsCache.get<MetricsHistoryEntry[]>(cacheKey)
    if (cached !== null)
      return cached
    try {
      return await fetchWindowEntries(start, end) ?? []
    }
    catch {
      return []
    }
  }

  // Shared fetch for a period - concurrent callers with the same period share
  // one RPC call via coalesceHistory.
  const fetchHistoryEntries = async (period: MetricsPeriod): Promise<MetricsHistoryEntry[]> => {
    const cacheKey = `metrics:history:${period}`
    const entries = await coalesceHistory(cacheKey, async () => {
      const rows = await fetchMetricsHistoryFromDB(supabase, period)
      // Caching a failed fetch would pin an empty chart for the whole interval.
      if (rows !== null)
        metricsCache.set(cacheKey, rows, msUntilNextCollection())
      return rows
    })
    return entries ?? []
  }

  const fetchMetricsHistory = async (period: MetricsPeriod = '24h') => {
    const cacheKey = `metrics:history:${period}`
    const cached = metricsCache.get<MetricsHistoryEntry[]>(cacheKey)
    if (cached !== null) {
      sharedHistoryPeriod = period
      metricsHistory.value = cached
      return cached
    }

    loadingHistory.value = true
    error.value = null

    try {
      const entries = await fetchHistoryEntries(period)
      sharedHistoryPeriod = period
      metricsHistory.value = entries
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

  // Like fetchMetricsHistory but returns data without writing to the shared ref.
  // Use this when you need history data in an isolated context (e.g. a modal)
  // that should not affect other consumers of metricsHistory.
  const fetchMetricsHistoryIsolated = async (period: MetricsPeriod = '24h'): Promise<MetricsHistoryEntry[]> => {
    const cacheKey = `metrics:history:${period}`
    const cached = metricsCache.get<MetricsHistoryEntry[]>(cacheKey)
    if (cached !== null)
      return cached
    try {
      return await fetchHistoryEntries(period)
    }
    catch {
      return []
    }
  }

  // Fetch 14-day history with 24h buckets - used by admin table mini-histograms.
  // Intentionally separate from fetchMetricsHistory so it always uses daily granularity
  // regardless of what PERIOD_CONFIGS['14d'].bucketMs is set to.
  const fetchDailyHistory = async (): Promise<MetricsHistoryEntry[]> => {
    const cacheKey = 'metrics:history:14d-daily'
    const cached = metricsCache.get<MetricsHistoryEntry[]>(cacheKey)
    if (cached !== null)
      return cached

    const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()
    const until = new Date().toISOString()
    const { data, error: dbError } = await supabase.rpc('get_metrics_bucketed', {
      p_since: since,
      p_until: until,
      p_bucket_interval: '24 hours',
    })
    if (dbError !== null || data === null)
      return []
    const entries = (data as unknown as Record<string, unknown>[]).map(normalizeRpcRow)
    metricsCache.set(cacheKey, entries, msUntilNextCollection())
    return entries
  }

  const fetchLatestMetrics = async () => {
    if (latestMetrics.value != null)
      return latestMetrics.value
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

  /**
   * Earliest snapshot we ever collected, used to size the All Time period.
   * Cached for the session - it only moves when the rollup trims the tail, and
   * a stale value there is off by a day at worst.
   */
  const fetchMetricsEarliest = async (): Promise<Date | null> => {
    const cacheKey = 'metrics:earliest'
    const cached = metricsCache.get<string>(cacheKey)
    if (cached !== null)
      return new Date(cached)

    const { data, error: dbError } = await supabase
      .from('metrics')
      .select('captured_at')
      .order('captured_at', { ascending: true })
      .limit(1)
      .maybeSingle()

    if (dbError !== null || data === null)
      return null

    const capturedAt = data.captured_at
    metricsCache.set(cacheKey, capturedAt, 60 * 60 * 1000)
    return new Date(capturedAt)
  }

  /**
   * Dataset backing the brush. Defaults to 90 days, and takes a `since` so the
   * brush can widen itself when a selection reaches further back than that -
   * otherwise it renders a window it holds no data for, stretching 90 days
   * across the full width while the charts below show a different range.
   *
   * Within a session it only ever widens, so a narrower request is a no-op
   * rather than a refetch and a narrower response that lands late can't clobber
   * a wider one.
   *
   * Calling it with no argument is a reset, not a widening request - that's a
   * freshly mounted brush asking for its default view. Without that, the state
   * here outlives the component and the brush comes back still stretched to
   * whatever the last visit expanded it to.
   */
  const fetchMetricsOverview = async (since?: Date) => {
    const defaultStartMs = Date.now() - PERIOD_CONFIGS['90d'].hours * 60 * 60 * 1000
    const isReset = since === undefined
    const startMs = isReset ? defaultStartMs : Math.min(since.getTime(), defaultStartMs)
    if (!isReset && overviewSinceMs !== null && startMs >= overviewSinceMs)
      return metricsOverview.value
    overviewSinceMs = startMs

    const start = new Date(startMs)
    const end = new Date()
    const cacheKey = `metrics:overview:${start.toISOString().slice(0, 13)}`
    const cached = metricsCache.get<MetricsHistoryEntry[]>(cacheKey)
    if (cached !== null) {
      metricsOverview.value = cached
      return cached
    }

    loadingOverview.value = true
    try {
      const entries = await coalesceHistory(cacheKey, async () => {
        const { data, error: dbError } = await supabase.rpc('get_metrics_bucketed', {
          p_since: start.toISOString(),
          p_until: end.toISOString(),
          p_bucket_interval: msToPgInterval(bucketMsForDuration(end.getTime() - startMs)),
        })

        // Don't cache a failure - an empty brush would stick for the whole
        // interval and every chart under it would render the wrong range.
        if (dbError !== null || data === null)
          return null

        const result = (data as unknown as Record<string, unknown>[]).map(normalizeRpcRow)
        metricsCache.set(cacheKey, result, msUntilNextCollection())
        return result
      }) ?? []

      // Still the widest request? Two expansions can overlap, and the loser
      // must not overwrite the winner's wider dataset.
      if (overviewSinceMs === startMs)
        metricsOverview.value = entries
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
    fetchMetricsHistoryIsolated,
    fetchMetricsWindow,
    fetchMetricsWindowIsolated,
    metricsWindow,
    metricsOverview,
    loadingOverview,
    fetchMetricsOverview,
    fetchMetricsEarliest,
    scheduleRefresh,
    fetchMetricsForServer,
    fetchDailyHistory,
    lastFetchedAt,
  }
}
