/**
 * Fetches all profile_badges rows for a given profile ID.
 * Cached via CACHE_NAMESPACES.badges (10 min TTL).
 */

import type { Ref } from 'vue'
import type { Database } from '@/types/database.types'
import { ref, unref, watch } from 'vue'
import { useCache } from '@/composables/useCache'
import { CACHE_NAMESPACES } from '@/lib/cache/namespaces'

// Raw row type with `metadata` typed as a plain object to avoid TS2589.
// The generated Json type is recursive and causes 'excessively deep' errors
// when wrapped in Ref<> - same pattern documented in database.overrides.ts.
interface ProfileBadgeRow {
  earned_at: string
  metadata: Record<string, unknown> | null
  profile_id: string
  progress: number | null
  slug: string
  source: Database['public']['Enums']['badge_source']
  tier: Database['public']['Enums']['badge_tier']
  updated_at: string
}

export interface DataProfileBadgesResult {
  badges: Ref<ProfileBadgeRow[]>
  loading: Ref<boolean>
  error: Ref<string | null>
  refresh: () => Promise<void>
  invalidate: (profileId: string | null | undefined) => void
}

function getCacheKey(profileId: string): string {
  return `badges:profile:${profileId}`
}

function hasValidId(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.trim() !== ''
}

export function useDataProfileBadges(
  profileId: Ref<string | null | undefined> | string | null | undefined,
): DataProfileBadgesResult {
  const supabase = useSupabaseClient<Database>()
  const cache = useCache(CACHE_NAMESPACES.badges)

  const badges = ref<ProfileBadgeRow[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function load(id: string, force = false): Promise<void> {
    const normalizedId = id.trim()
    if (normalizedId === '') {
      badges.value = []
      return
    }

    const key = getCacheKey(normalizedId)

    if (!force) {
      const cached = cache.get<ProfileBadgeRow[]>(key)
      if (cached !== null) {
        badges.value = cached
        return
      }
    }

    loading.value = true
    error.value = null

    try {
      const { data, error: fetchError } = await supabase
        .from('profile_badges')
        .select('*')
        .eq('profile_id', normalizedId)

      if (fetchError)
        throw fetchError

      const rows = (data ?? []) as ProfileBadgeRow[]
      cache.set(key, rows)
      badges.value = rows
    }
    catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to fetch profile badges'
      badges.value = []
    }
    finally {
      loading.value = false
    }
  }

  function invalidate(id: string | null | undefined): void {
    if (!hasValidId(id))
      return
    cache.delete(getCacheKey(id.trim()))
  }

  async function refresh(): Promise<void> {
    const id = unref(profileId)
    if (!hasValidId(id))
      return
    invalidate(id)
    await load(id.trim(), true)
  }

  watch(
    () => unref(profileId),
    (id) => {
      if (!hasValidId(id)) {
        badges.value = []
        return
      }
      void load(id.trim())
    },
    { immediate: true },
  )

  return {
    badges,
    loading,
    error,
    refresh,
    invalidate,
  }
}
