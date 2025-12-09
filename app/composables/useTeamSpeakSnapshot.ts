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

  const asyncResult = useAsyncData<TeamSpeakSnapshot | null, Error | null>(
    key,
    async () => {
      const { data: publicUrlData } = supabase.storage
        .from(SNAPSHOT_BUCKET)
        .getPublicUrl(SNAPSHOT_PATH)

      const publicUrl = publicUrlData?.publicUrl
      if (!publicUrl)
        throw new Error('TeamSpeak snapshot URL is not available.')

      const snapshot = await $fetch<TeamSpeakSnapshot>(publicUrl, {
        cache: 'no-cache',
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

  const shouldAutoRefresh = typeof options.refreshInterval === 'number'
    && Number.isFinite(options.refreshInterval)
    && options.refreshInterval > 0

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
