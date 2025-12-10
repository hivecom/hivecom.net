import type { Database } from '@/types/database.types'
import type { TeamSpeakSnapshot } from '@/types/teamspeak'
import { computed, onScopeDispose, ref } from 'vue'

const SNAPSHOT_BUCKET = 'hivecom-content-static'
const SNAPSHOT_PATH = 'teamspeak/state.json'
const CACHE_MAX_AGE_MS = 60_000

export interface UseTeamSpeakSnapshotOptions {
  /** Optional key override for useAsyncData */
  key?: string
  /** Optional refresh interval passed to useAsyncData */
  refreshInterval?: number
}

function isSnapshotFresh(snapshot: TeamSpeakSnapshot | null, maxAgeMs: number): boolean {
  const collectedAtRaw = snapshot?.collectedAt
  if (collectedAtRaw === null || collectedAtRaw === undefined || collectedAtRaw === '')
    return false

  const collectedAt = Date.parse(collectedAtRaw)
  if (Number.isNaN(collectedAt))
    return false

  return Date.now() - collectedAt < maxAgeMs
}

export function useTeamSpeakSnapshot(options: UseTeamSpeakSnapshotOptions = {}) {
  const supabase = useSupabaseClient<Database>()
  const key = options.key ?? 'teamspeak-snapshot'
  const forceEndpointRefresh = ref(false)

  const shouldAutoRefresh = typeof options.refreshInterval === 'number'
    && Number.isFinite(options.refreshInterval)
    && options.refreshInterval > 0

  const fetchSnapshotFromStorage = async (): Promise<TeamSpeakSnapshot | null> => {
    const { data: publicUrlData } = supabase.storage
      .from(SNAPSHOT_BUCKET)
      .getPublicUrl(SNAPSHOT_PATH)

    const publicUrl = publicUrlData?.publicUrl
    if (publicUrl === null || publicUrl === undefined || publicUrl === '')
      throw new Error('TeamSpeak snapshot URL is not available.')

    const cacheToken = shouldAutoRefresh
      ? Math.floor(Date.now() / (options.refreshInterval as number))
      : Date.now()

    const url = new URL(publicUrl)
    url.searchParams.set('t', String(cacheToken))

    try {
      const snapshot = await $fetch<TeamSpeakSnapshot>(url.toString(), {
        cache: 'no-store',
      })

      return snapshot ?? null
    }
    catch {
      return null
    }
  }

  const fetchSnapshotFromEndpoint = async (): Promise<TeamSpeakSnapshot | null> => {
    const invokeResult = await supabase.functions.invoke<TeamSpeakSnapshot>('teamspeak-viewer-refresh')

    if (invokeResult.error !== null && invokeResult.error !== undefined) {
      const message = invokeResult.error instanceof Error
        ? invokeResult.error.message
        : String(invokeResult.error)
      throw new Error(message)
    }

    return invokeResult.data ?? null
  }

  const asyncResult = useAsyncData<TeamSpeakSnapshot | null, Error | null>(
    key,
    async () => {
      const skipStorage = forceEndpointRefresh.value
      let cachedSnapshot: TeamSpeakSnapshot | null = null

      try {
        cachedSnapshot = skipStorage ? null : await fetchSnapshotFromStorage()
      }
      catch (storageError) {
        // Propagate storage failures on initial load; manual refresh falls back to endpoint
        if (!skipStorage)
          throw (storageError instanceof Error ? storageError : new Error(String(storageError)))
      }

      const hasFreshCache = isSnapshotFresh(cachedSnapshot, CACHE_MAX_AGE_MS)
      if (hasFreshCache && !skipStorage)
        return cachedSnapshot

      // Only attempt the endpoint on the client since it requires user auth
      if (!process.client) {
        forceEndpointRefresh.value = false
        return cachedSnapshot
      }

      try {
        const refreshed = await fetchSnapshotFromEndpoint()
        if (refreshed)
          return refreshed
      }
      catch (endpointError) {
        if (skipStorage)
          throw (endpointError instanceof Error ? endpointError : new Error(String(endpointError)))
      }
      finally {
        forceEndpointRefresh.value = false
      }

      return cachedSnapshot
    },
    {
      server: true,
      lazy: true,
      default: () => null,
    },
  )

  const { data, pending, error, refresh: nuxtRefresh, status, execute, clear } = asyncResult

  const refresh = async () => {
    forceEndpointRefresh.value = true
    return nuxtRefresh()
  }

  if (shouldAutoRefresh && process.client) {
    const timer = window.setInterval(() => {
      void nuxtRefresh()
    }, options.refreshInterval)
    onScopeDispose(() => window.clearInterval(timer))
  }

  const lastUpdated = computed(() => (data.value)?.collectedAt ?? null)

  return {
    data,
    pending,
    error,
    refresh,
    status,
    execute,
    clear,
    lastUpdated,
  }
}
