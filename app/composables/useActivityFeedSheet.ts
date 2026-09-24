import type { Ref } from 'vue'
import type { ActivityItem } from '@/composables/useForumActivityFeed'
import { useBulkDataUser } from '@/composables/useDataUser'
import { extractMentionIds } from '@/lib/markdownProcessors'

export interface UseActivityFeedSheetOptions {
  /** Loads the first page and must reset the source's own state. An empty result marks the feed exhausted. */
  load: () => Promise<ActivityItem[]>
  /** Gets the current item count as its offset. An empty result marks the feed exhausted. */
  loadMore: (offset: number) => Promise<ActivityItem[]>
  /** A page shorter than this marks the source exhausted. */
  pageSize: number
}

export function useActivityFeedSheet(options: UseActivityFeedSheetOptions) {
  const { load, loadMore: loadMoreFn, pageSize } = options

  // ── State ──────────────────────────────────────────────────────────────

  const sheetOpen = ref(false)
  const sheetItems = ref<ActivityItem[]>([])
  const sheetLoading = ref(false)
  const sheetLoadingMore = ref(false)
  const sheetExhausted = ref(false)

  const sentinel = ref<HTMLElement | null>(null)

  // ── Pagination ─────────────────────────────────────────────────────────

  async function openLoad() {
    if (sheetLoading.value)
      return

    sheetLoading.value = true
    sheetExhausted.value = false
    sheetItems.value = []

    const rows = await load()

    if (rows.length === 0) {
      sheetExhausted.value = true
      sheetLoading.value = false
      return
    }

    if (rows.length < pageSize)
      sheetExhausted.value = true

    sheetItems.value = rows
    sheetLoading.value = false
  }

  async function appendMore() {
    if (sheetLoadingMore.value || sheetExhausted.value)
      return

    sheetLoadingMore.value = true

    const rows = await loadMoreFn(sheetItems.value.length)

    if (rows.length === 0) {
      sheetExhausted.value = true
      sheetLoadingMore.value = false
      return
    }

    if (rows.length < pageSize)
      sheetExhausted.value = true

    sheetItems.value = [...sheetItems.value, ...rows]
    sheetLoadingMore.value = false
  }

  // ── IntersectionObserver ───────────────────────────────────────────────

  let observer: IntersectionObserver | null = null

  watch(sheetOpen, async (open) => {
    if (!open) {
      observer?.disconnect()
      observer = null
      return
    }

    if (sheetItems.value.length === 0)
      await openLoad()

    await nextTick()
    if (sentinel.value == null)
      return

    observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !sheetLoadingMore.value && !sheetExhausted.value)
          void appendMore()
      },
      { threshold: 0.1 },
    )
    observer.observe(sentinel.value)
  })

  onUnmounted(() => {
    observer?.disconnect()
  })

  // ── Mention pre-warming ────────────────────────────────────────────────
  // Stable ref with a sorted-key guard so useBulkDataUser's watcher only
  // fires when the actual set of mention IDs changes, not on every append.

  const sheetMentionIds = ref<string[]>([])
  let _lastMentionKey = ''

  watchEffect(() => {
    const ids = [
      ...new Set(
        sheetItems.value
          .filter(item => item.type === 'Reply' && item.title != null)
          .flatMap(item => extractMentionIds(item.title)),
      ),
    ]
    const key = ids.toSorted().join(',')
    if (key !== _lastMentionKey) {
      _lastMentionKey = key
      sheetMentionIds.value = ids
    }
  })

  const { users: sheetMentionUsers } = useBulkDataUser(sheetMentionIds, {
    includeAvatar: false,
    includeRole: false,
  })

  const sheetMentionLookup = computed<Record<string, string>>(() => {
    const lookup: Record<string, string> = {}
    for (const [id, u] of sheetMentionUsers.value.entries()) {
      if (u?.username)
        lookup[id] = u.username
    }
    return lookup
  })

  // ── Author avatar pre-warming ──────────────────────────────────────────

  const sheetAuthorIds = ref<string[]>([])
  let _lastAuthorKey = ''

  watchEffect(() => {
    const ids = [
      ...new Set(
        sheetItems.value
          .map(item => item.user)
          .filter((id): id is string => id != null && id !== ''),
      ),
    ]
    const key = ids.toSorted().join(',')
    if (key !== _lastAuthorKey) {
      _lastAuthorKey = key
      sheetAuthorIds.value = ids
    }
  })

  useBulkDataUser(sheetAuthorIds, {
    includeAvatar: true,
    includeRole: true,
  })

  // ── Reset helper ───────────────────────────────────────────────────────
  // Call when the data source changes so the next open fetches fresh data.

  function reset() {
    sheetItems.value = []
    sheetExhausted.value = false
    _lastMentionKey = ''
    _lastAuthorKey = ''
  }

  return {
    sheetOpen,
    sheetItems: sheetItems as Ref<ActivityItem[]>,
    sheetLoading,
    sheetLoadingMore,
    sheetExhausted,

    // Bind with `ref="sentinel"` on the scroll anchor element.
    sentinel,

    sheetMentionLookup,

    reset,
  }
}
