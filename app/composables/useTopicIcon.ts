import type { Database } from '@/types/database.types'
import { computed, ref, unref, watch } from 'vue'
import { useCache } from '@/composables/useCache'
import { getTopicIconUrl } from '@/lib/storage'

// ── Global dedup & cache ──────────────────────────────────────────────────────

const _inflightIcons = new Map<string, Promise<string | null>>()

const ICON_TTL = 60 * 60 * 1000 // matches getTopicIconUrl's own TTL

const _topicIconCache = useCache({ ttl: ICON_TTL })

function iconCacheKey(topicId: string): string {
  return `topic-icon:${topicId}`
}

// Call after uploading or deleting a topic icon.
export function invalidateTopicIconCache(topicId: string): void {
  _topicIconCache.delete(iconCacheKey(topicId))
  _inflightIcons.delete(topicId)
}

// ── Composable ────────────────────────────────────────────────────────────────

export interface UseTopicIconOptions {
  /** For when the caller knows the topic has no icon. */
  enabled?: boolean
}

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

    // has(), not get(), so a cached null counts as a hit.
    const cacheKey = iconCacheKey(id)
    if (_topicIconCache.has(cacheKey)) {
      iconUrl.value = _topicIconCache.get<string | null>(cacheKey)
      return
    }

    loading.value = true

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
