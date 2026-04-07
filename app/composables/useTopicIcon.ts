import type { Database } from '@/types/database.types'
import { computed, ref, unref, watch } from 'vue'
import { useCache } from '@/composables/useCache'
import { getTopicIconUrl } from '@/lib/storage'

// ── Global dedup & cache ──────────────────────────────────────────────────────

const _inflightIcons = new Map<string, Promise<string | null>>()

const ICON_TTL = 60 * 60 * 1000 // 1 hour — matches getTopicIconUrl's own TTL

// Module-level localStorage cache shared across all composable instances.
// Key: topic ID (stored under 'hivecom:cache:kv:topic-icon:<id>' in localStorage).
const _topicIconCache = useCache({ ttl: ICON_TTL })

function iconCacheKey(topicId: string): string {
  return `topic-icon:${topicId}`
}

/**
 * Invalidate the cached icon for a specific topic.
 * Clears both the localStorage cache entry and any in-flight request.
 * Call this after uploading or deleting a topic icon.
 */
export function invalidateTopicIconCache(topicId: string): void {
  _topicIconCache.delete(iconCacheKey(topicId))
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
 * caches results in localStorage (via useCache) and deduplicates concurrent
 * fetches across all component instances.
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

    // Check localStorage cache first (has() correctly handles cached null results)
    const cacheKey = iconCacheKey(id)
    if (_topicIconCache.has(cacheKey)) {
      iconUrl.value = _topicIconCache.get<string | null>(cacheKey)
      return
    }

    loading.value = true

    // Coalesce concurrent fetches for the same topic
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
        _topicIconCache.set(iconCacheKey(id), url)
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
    if (id != null)
      invalidateTopicIconCache(id)
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
        // Check localStorage cache first
        if (_topicIconCache.has(iconCacheKey(id))) {
          result.set(id, _topicIconCache.get<string | null>(iconCacheKey(id)))
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
            _topicIconCache.set(iconCacheKey(id), url)
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
    invalidateTopicIconCache(id)

    let url: string | null = null
    try {
      url = await getTopicIconUrl(supabase, id)
    }
    catch {
      url = null
    }
    _topicIconCache.set(iconCacheKey(id), url)
    icons.value = new Map(icons.value).set(id, url)
  }

  return {
    icons,
    loading,
    refresh,
  }
}
