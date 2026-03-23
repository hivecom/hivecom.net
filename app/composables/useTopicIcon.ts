import type { Database } from '@/types/database.types'
import { computed, ref, unref, watch } from 'vue'
import { getTopicIconUrl } from '@/lib/storage'

// ── Global dedup & cache ──────────────────────────────────────────────────────

const _inflightIcons = new Map<string, Promise<string | null>>()
const _iconCache = new Map<string, { url: string | null, expires: number }>()

const ICON_TTL = 30 * 60 * 1000 // 30 minutes in-memory

function getCached(topicId: string): string | null | undefined {
  const entry = _iconCache.get(topicId)
  if (entry == null)
    return undefined
  if (Date.now() > entry.expires) {
    _iconCache.delete(topicId)
    return undefined
  }
  return entry.url
}

function setCache(topicId: string, url: string | null): void {
  _iconCache.set(topicId, { url, expires: Date.now() + ICON_TTL })
}

/**
 * Invalidate the in-memory icon cache for a specific topic.
 * Also exported so callers (e.g. the edit modal) can bust the cache after upload.
 */
export function invalidateTopicIconMemoryCache(topicId: string): void {
  _iconCache.delete(topicId)
  _inflightIcons.delete(topicId)
}

// ── Composable ────────────────────────────────────────────────────────────────

export interface UseTopicIconOptions {
  /** Skip fetching entirely. Useful when the caller knows the topic has no icon. */
  enabled?: boolean
}

/**
 * Reactive composable that resolves a topic's icon URL from Supabase Storage.
 *
 * Mirrors the avatar pattern: tries multiple extensions via `getTopicIconUrl`,
 * caches results in localStorage (via the storage helper) and in-memory, and
 * deduplicates concurrent fetches across all component instances.
 *
 * ```ts
 * const { iconUrl, loading } = useTopicIcon(topicId)
 * ```
 */
export function useTopicIcon(
  topicId: Ref<string | null> | string | null,
  options: UseTopicIconOptions = {},
) {
  const { enabled = true } = options

  const supabase = useSupabaseClient<Database>()
  const iconUrl = ref<string | null>(null)
  const loading = ref(false)

  async function fetchIcon(id: string | null): Promise<void> {
    if (!enabled || id == null) {
      iconUrl.value = null
      return
    }

    // Check in-memory cache first
    const cached = getCached(id)
    if (cached !== undefined) {
      iconUrl.value = cached
      return
    }

    loading.value = true

    // Coalesce concurrent fetches
    let inflight = _inflightIcons.get(id)
    if (inflight == null) {
      inflight = (async () => {
        let url: string | null = null
        try {
          url = await getTopicIconUrl(supabase, id)
        }
        catch (err) {
          console.warn('Failed to fetch topic icon URL:', err)
          url = null
        }
        setCache(id, url)
        return url
      })().finally(() => {
        _inflightIcons.delete(id)
      })

      _inflightIcons.set(id, inflight)
    }

    iconUrl.value = await inflight
    loading.value = false
  }

  const resolvedId = computed(() => unref(topicId))

  watch(resolvedId, id => void fetchIcon(id), { immediate: true })

  /**
   * Force-refresh the icon for the current topic, bypassing all caches.
   */
  async function refresh(): Promise<void> {
    const id = resolvedId.value
    if (id != null) {
      invalidateTopicIconMemoryCache(id)
      // Also bust localStorage via the storage helper
      const { invalidateTopicIconCache } = await import('@/lib/storage')
      invalidateTopicIconCache(id)
    }
    await fetchIcon(resolvedId.value)
  }

  return {
    iconUrl,
    loading,
    refresh,
  }
}

// ── Bulk helper ───────────────────────────────────────────────────────────────

/**
 * Fetch icons for multiple topics at once.
 * Returns a reactive Map<topicId, url | null>.
 */
export function useBulkTopicIcons(
  topicIds: Ref<string[]> | ComputedRef<string[]>,
) {
  const supabase = useSupabaseClient<Database>()
  const icons = ref(new Map<string, string | null>())
  const loading = ref(false)

  async function fetchAll(ids: string[]): Promise<void> {
    if (ids.length === 0) {
      icons.value = new Map()
      return
    }

    loading.value = true
    const result = new Map<string, string | null>()

    await Promise.all(
      ids.map(async (id) => {
        const cached = getCached(id)
        if (cached !== undefined) {
          result.set(id, cached)
          return
        }

        let inflight = _inflightIcons.get(id)
        if (inflight == null) {
          inflight = (async () => {
            let url: string | null = null
            try {
              url = await getTopicIconUrl(supabase, id)
            }
            catch {
              url = null
            }
            setCache(id, url)
            return url
          })().finally(() => {
            _inflightIcons.delete(id)
          })

          _inflightIcons.set(id, inflight)
        }

        const url = await inflight
        result.set(id, url)
      }),
    )

    icons.value = result
    loading.value = false
  }

  watch(topicIds, ids => void fetchAll(ids), { immediate: true, deep: true })

  /**
   * Force-refresh the icon for a single topic, bypassing all caches.
   * Updates the icons map in place so consumers react immediately.
   */
  async function refresh(id: string): Promise<void> {
    invalidateTopicIconMemoryCache(id)
    const { invalidateTopicIconCache } = await import('@/lib/storage')
    invalidateTopicIconCache(id)

    let url: string | null = null
    try {
      url = await getTopicIconUrl(supabase, id)
    }
    catch {
      url = null
    }
    setCache(id, url)
    icons.value = new Map(icons.value).set(id, url)
  }

  return {
    icons,
    loading,
    refresh,
  }
}
