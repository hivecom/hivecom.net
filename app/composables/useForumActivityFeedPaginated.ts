import type { ComputedRef, Ref } from 'vue'
import type { ActivityItem } from '@/composables/useForumActivityFeed'
import type { Tables } from '@/types/database.overrides'
import type { Database } from '@/types/database.types'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import { computed, ref } from 'vue'
import { useCache } from '@/composables/useCache'
import { CACHE_NAMESPACES } from '@/lib/cache/namespaces'
import { extractMentionIds } from '@/lib/markdownProcessors'

// The generated return type for get_forum_activity_feed marks all columns
// as non-nullable, but nullable columns from the UNION (title, body,
// discussion_id, created_by) can legitimately be null at runtime.
interface FeedRow {
  id: string
  item_type: string
  discussion_id: string | null
  title: string | null
  body: string | null
  is_nsfw: boolean
  is_offtopic: boolean
  created_at: string
  created_by: string | null
}

dayjs.extend(relativeTime)

const PAGE_SIZE = 30

export interface UseForumActivityFeedPaginatedOptions {
  settings: Ref<{
    show_nsfw_content: boolean
    show_forum_archived: boolean
  }>
  discussionLookup: ComputedRef<Map<string, Tables<'discussions'>>>
  visibleDiscussionIds: ComputedRef<Set<string>>
  hiddenTopicIds: ComputedRef<Set<string>>
  /** Called when a topic item is clicked */
  onTopicClick: (id: string) => void
  /** When set, only return items created by the current signed-in user (maps to p_created_by RPC param) */
  createdByCurrentUser?: boolean
  /** When set, exclude items created by the current signed-in user (maps to p_exclude RPC param) */
  excludeCurrentUser?: boolean
}

export function useForumActivityFeedPaginated({
  settings,
  discussionLookup,
  visibleDiscussionIds,
  hiddenTopicIds,
  onTopicClick,
  createdByCurrentUser,
  excludeCurrentUser,
}: UseForumActivityFeedPaginatedOptions) {
  const supabase = useSupabaseClient<Database>()
  const userId = useUserId()
  const feedCache = useCache(CACHE_NAMESPACES.forum)

  const rawItems = ref<FeedRow[]>([])
  const loading = ref(false)
  const loadingMore = ref(false)
  const exhausted = ref(false)
  const offset = ref(0)

  // Cache key is stable per user context - different for community vs mine tabs
  function feedCacheKey(): string {
    const uid = userId.value ?? 'anon'
    if (createdByCurrentUser)
      return `feed:mine:${uid}`
    if (excludeCurrentUser)
      return `feed:community:${uid}`
    return `feed:all:${uid}`
  }

  function mapRow(row: FeedRow): ActivityItem | null {
    if (row.item_type === 'reply') {
      if (row.discussion_id == null)
        return null

      if (!settings.value.show_nsfw_content && row.is_nsfw)
        return null

      if (!visibleDiscussionIds.value.has(row.discussion_id))
        return null

      const discussion = discussionLookup.value.get(row.discussion_id)

      if (!settings.value.show_nsfw_content && discussion?.is_nsfw)
        return null

      return {
        id: row.id,
        type: 'Reply',
        typeLabel: 'Reply in',
        typeContext: discussion?.title ?? 'Discussion',
        title: row.body ?? 'Reply',
        description: undefined,
        timestamp: dayjs(row.created_at).fromNow(),
        timestampRaw: row.created_at,
        user: row.created_by ?? '',
        icon: 'ph:chats-circle',
        isNsfw: row.is_nsfw ?? false,
        isOfftopic: row.is_offtopic ?? false,
        href: `/forum/${discussion?.slug ?? row.discussion_id}?comment=${row.id}`,
      }
    }

    if (row.item_type === 'discussion') {
      if (!settings.value.show_nsfw_content && row.is_nsfw)
        return null

      if (row.discussion_id != null && hiddenTopicIds.value.has(row.discussion_id))
        return null

      const discussion = discussionLookup.value.get(row.id)

      return {
        id: row.id,
        type: 'Discussion',
        typeLabel: 'Created Discussion',
        title: row.title ?? 'Discussion',
        description: row.body ?? undefined,
        timestamp: dayjs(row.created_at).fromNow(),
        timestampRaw: row.created_at,
        user: row.created_by ?? '',
        icon: 'ph:scroll',
        isNsfw: row.is_nsfw ?? false,
        isOfftopic: false,
        href: `/forum/${discussion?.slug ?? row.id}`,
      }
    }

    if (row.item_type === 'topic') {
      if (!settings.value.show_forum_archived)
        return null

      return {
        id: row.id,
        type: 'Topic',
        typeLabel: 'Created Topic',
        title: row.title ?? 'Topic',
        description: row.body ?? undefined,
        timestamp: dayjs(row.created_at).fromNow(),
        timestampRaw: row.created_at,
        user: row.created_by ?? '',
        icon: 'ph:folder-open',
        isNsfw: false,
        isOfftopic: false,
        onClick: () => onTopicClick(row.id),
      }
    }

    return null
  }

  const items = computed<ActivityItem[]>(() => {
    const result: ActivityItem[] = []
    for (const row of rawItems.value) {
      const mapped = mapRow(row)
      if (mapped != null)
        result.push(mapped)
    }
    return result
  })

  // IDs of all users mentioned in reply bodies for mention lookup
  const mentionIds = computed<string[]>(() => {
    const ids = new Set<string>()
    for (const item of rawItems.value) {
      if (item.item_type === 'reply' && item.body != null) {
        extractMentionIds(item.body).forEach(id => ids.add(id))
      }
    }
    return [...ids]
  })

  // Stable author ID list for bulk pre-warming
  const authorIds = ref<string[]>([])
  let _lastAuthorKey = ''

  watchEffect(() => {
    const ids = [...new Set(
      rawItems.value
        .map(r => r.created_by)
        .filter((id): id is string => id != null),
    )]
    const key = ids.toSorted().join(',')
    if (key !== _lastAuthorKey) {
      _lastAuthorKey = key
      authorIds.value = ids
    }
  })

  async function fetchPage(pageOffset: number, append: boolean) {
    const currentUserId = userId.value
    const { data, error } = await supabase.rpc('get_forum_activity_feed', {
      p_limit: PAGE_SIZE,
      p_offset: pageOffset,
      ...(createdByCurrentUser === true && currentUserId != null ? { p_created_by: currentUserId } : {}),
      ...(excludeCurrentUser === true && currentUserId != null ? { p_exclude: currentUserId } : {}),
    })

    if (error != null) {
      console.error('[useForumActivityFeedPaginated] fetch error:', error.message)
      return
    }

    if (data == null || data.length === 0) {
      exhausted.value = true
      return
    }

    if (data.length < PAGE_SIZE)
      exhausted.value = true

    if (append) {
      rawItems.value = [...rawItems.value, ...data]
    }
    else {
      rawItems.value = data
    }

    offset.value = pageOffset + data.length
  }

  async function load() {
    if (loading.value)
      return

    // Serve first page from cache when available
    const cacheKey = feedCacheKey()
    const cached = feedCache.get<{ rows: FeedRow[], exhausted: boolean }>(cacheKey)
    if (cached !== null) {
      rawItems.value = cached.rows
      exhausted.value = cached.exhausted
      offset.value = cached.rows.length
      return
    }

    loading.value = true
    exhausted.value = false
    offset.value = 0
    rawItems.value = []
    await fetchPage(0, false)

    // Cache the loaded first page
    if (rawItems.value.length > 0) {
      feedCache.set(cacheKey, { rows: rawItems.value, exhausted: exhausted.value })
    }

    loading.value = false
  }

  async function reload() {
    feedCache.delete(feedCacheKey())
    loading.value = true
    exhausted.value = false
    offset.value = 0
    rawItems.value = []
    await fetchPage(0, false)

    if (rawItems.value.length > 0) {
      feedCache.set(feedCacheKey(), { rows: rawItems.value, exhausted: exhausted.value })
    }

    loading.value = false
  }

  async function loadMore() {
    if (loadingMore.value || exhausted.value)
      return
    loadingMore.value = true
    await fetchPage(offset.value, true)
    loadingMore.value = false
  }

  return {
    items,
    mentionIds,
    authorIds,
    loading,
    loadingMore,
    exhausted,
    load,
    reload,
    loadMore,
  }
}
