import type { Database } from '@/types/database.types'
import type { TeamSpeakSnapshot } from '@/types/teamspeak'
import { computed, onScopeDispose } from 'vue'

const SNAPSHOT_BUCKET = 'hivecom-content-static'
const SNAPSHOT_PATH = 'teamspeak/state.json'

export interface UseTeamSpeakSnapshotOptions {
  /** Optional key override for useAsyncData */
  key?: string
  /** Optional refresh interval passed to useAsyncData */
  refreshInterval?: number
}

export function useTeamSpeakSnapshot(options: UseTeamSpeakSnapshotOptions = {}) {
  const supabase = useSupabaseClient<Database>()
  const key = options.key ?? 'teamspeak-snapshot'

  const shouldAutoRefresh = typeof options.refreshInterval === 'number'
    && Number.isFinite(options.refreshInterval)
    && options.refreshInterval > 0

  const asyncResult = useAsyncData<TeamSpeakSnapshot | null, Error | null>(
    key,
    async () => {
      const { data: publicUrlData } = supabase.storage
        .from(SNAPSHOT_BUCKET)
        .getPublicUrl(SNAPSHOT_PATH)

      const publicUrl = publicUrlData?.publicUrl
      if (!publicUrl)
        throw new Error('TeamSpeak snapshot URL is not available.')

      // Add a cache-buster so CDN edges don't serve stale snapshots
      const cacheToken = shouldAutoRefresh
        ? Math.floor(Date.now() / (options.refreshInterval as number))
        : Date.now()
      const url = new URL(publicUrl)
      url.searchParams.set('t', String(cacheToken))

      const snapshot = await $fetch<TeamSpeakSnapshot>(url.toString(), {
        cache: 'no-store',
      })

      return snapshot ?? null
    },
    {
      server: true,
      lazy: true,
      default: () => null,
    },
  )

  const { data, pending, error, refresh, status, execute, clear } = asyncResult

  if (shouldAutoRefresh && process.client) {
    const timer = window.setInterval(() => {
      void refresh()
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
