import type { Database } from '@/types/database.types'
import type { TeamSpeakSnapshot } from '@/types/teamspeak'
import { computed, onMounted, onScopeDispose, ref, watch } from 'vue'

const SNAPSHOT_BUCKET = 'hivecom-content-static'
const SNAPSHOT_PATH = 'teamspeak/state.json'
const STALE_AUTO_REFRESH_MS = 300_000

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
  const refreshingEndpoint = ref(false)

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
      let cachedSnapshot: TeamSpeakSnapshot | null = null

      try {
        cachedSnapshot = await fetchSnapshotFromStorage()
      }
      catch (storageError) {
        if (!process.client)
          throw (storageError instanceof Error ? storageError : new Error(String(storageError)))
      }

      if (cachedSnapshot !== null)
        return cachedSnapshot

      // Storage is unavailable; fall back to endpoint on client only
      if (!process.client)
        return null

      const refreshed = await fetchSnapshotFromEndpoint()
      return refreshed
    },
    {
      server: false,
      lazy: false,
      default: () => null,
    },
  )

  const { data, pending, error, refresh: nuxtRefresh, status, execute, clear } = asyncResult

  const fetchFromEndpointAndSet = async () => {
    if (refreshingEndpoint.value)
      return data.value

    refreshingEndpoint.value = true
    try {
      const refreshed = await fetchSnapshotFromEndpoint()
      if (refreshed !== null)
        data.value = refreshed
      return refreshed
    }
    finally {
      refreshingEndpoint.value = false
    }
  }

  const refresh = async () => {
    const fromEndpoint = await fetchFromEndpointAndSet()
    if (fromEndpoint === null)
      await nuxtRefresh()
    return fromEndpoint
  }

  if (process.client) {
    onMounted(() => {
      if (status.value === 'idle')
        void execute()
    })

    const maybeRefreshIfStale = async () => {
      const snapshot = data.value
      const hasSnapshot = snapshot !== null
      const isStaleBeyondThreshold = hasSnapshot
        ? !isSnapshotFresh(snapshot, STALE_AUTO_REFRESH_MS)
        : false

      if (isStaleBeyondThreshold)
        await fetchFromEndpointAndSet()
    }

    watch(data, () => {
      void maybeRefreshIfStale()
    }, { immediate: true })

    if (shouldAutoRefresh) {
      const timer = window.setInterval(() => {
        void maybeRefreshIfStale()
      }, options.refreshInterval)
      onScopeDispose(() => window.clearInterval(timer))
    }
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
