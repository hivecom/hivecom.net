import type { ActivityItem } from '@/composables/useForumActivityFeed'
import type { Tables } from '@/types/database.overrides'
import type { Database } from '@/types/database.types'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import { computed, onMounted, ref } from 'vue'
import { useCache } from '@/composables/useCache'
import { useBulkDataUser } from '@/composables/useDataUser'
import { useDataUserSettings } from '@/composables/useDataUserSettings'
import { useDiscussionCache } from '@/composables/useDiscussionCache'
import { CACHE_NAMESPACES } from '@/lib/cache/namespaces'
import { extractMentionIds } from '@/lib/markdownProcessors'

dayjs.extend(relativeTime)

// The generated return type for get_forum_activity_feed marks every column as
// non-nullable, but the UNION can produce NULLs for title/body/discussion_id
// depending on item_type.
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

const DEFAULT_TTL = 3 * 60 * 1000 // 3 minutes

export interface UseForumFeedPreviewOptions {
  /** How many items to surface after filtering. */
  limit: number
  /** Cache key for the fetched rows. Unique per caller. */
  cacheKey: string
  /** Row cache TTL in ms. */
  ttl?: number
}

/**
 * Short, read-only slice of the forum activity feed for preview surfaces
 * (dashboard cards, sidebars) that don't want the full forum page wiring.
 *
 * Unlike `useForumActivityFeedPaginated` this doesn't need the topic tree or
 * the discussion index up front. It fetches the feed, warms the discussion
 * cache for the rows it got back, and maps them into `ActivityItem`s that
 * `ForumLatestItem` can render directly.
 */
export function useForumFeedPreview(options: UseForumFeedPreviewOptions) {
  const { limit, cacheKey, ttl = DEFAULT_TTL } = options

  const supabase = useSupabaseClient<Database>()
  const discussionCache = useDiscussionCache()
  const cache = useCache(CACHE_NAMESPACES.forum)
  const { settings } = useDataUserSettings()

  // Overfetch so NSFW and unresolvable rows can drop out without leaving the
  // preview short.
  const FETCH_LIMIT = limit * 3

  const rows = ref<FeedRow[]>([])
  const loading = ref(true)

  // The RPC doesn't join discussion titles or slugs, so pull the referenced
  // discussions in one go. Also warms the cache for the page we link to.
  async function warmDiscussions(source: FeedRow[]) {
    const ids = [
      ...new Set(
        source
          .map(row => (row.item_type === 'reply' ? row.discussion_id : row.item_type === 'discussion' ? row.id : null))
          .filter((id): id is string => id != null && discussionCache.getById(id) == null),
      ),
    ]
    if (ids.length === 0)
      return

    const { data } = await supabase.from('discussions').select('*').in('id', ids)
    for (const discussion of data ?? [])
      discussionCache.set(discussion as Tables<'discussions'>)
  }

  function mapRow(row: FeedRow): ActivityItem | null {
    if (row.item_type === 'reply') {
      if (row.discussion_id == null || row.body === '#empty' || (row.body ?? '').trim() === '')
        return null

      const discussion = discussionCache.getById(row.discussion_id)

      if (!settings.value.show_nsfw_content && (row.is_nsfw || discussion?.is_nsfw))
        return null

      return {
        id: row.id,
        type: 'Reply',
        typeLabel: 'Reply in',
        typeContext: discussion?.title ?? 'Discussion',
        title: row.body ?? 'Reply',
        timestamp: dayjs(row.created_at).fromNow(),
        timestampRaw: row.created_at,
        user: row.created_by ?? '',
        icon: 'ph:chats-circle',
        isNsfw: row.is_nsfw,
        isOfftopic: row.is_offtopic,
        href: `/forum/${discussion?.slug ?? row.discussion_id}?comment=${row.id}`,
      }
    }

    if (row.item_type === 'discussion') {
      if (!settings.value.show_nsfw_content && row.is_nsfw)
        return null

      const discussion = discussionCache.getById(row.id)

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
        isNsfw: row.is_nsfw,
        isOfftopic: false,
        href: `/forum/${discussion?.slug ?? row.id}`,
      }
    }

    if (row.item_type === 'topic') {
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
        // Topics have no page of their own, so deep-link the forum sidebar to it.
        href: `/forum?activeTopicId=${row.id}`,
      }
    }

    return null
  }

  const items = computed<ActivityItem[]>(() => {
    const mapped: ActivityItem[] = []
    for (const row of rows.value) {
      const item = mapRow(row)
      if (item != null)
        mapped.push(item)
    }
    return mapped.slice(0, limit)
  })

  // ── Author and mention pre-warming ─────────────────────────────────────────

  const authorIds = computed(() =>
    [...new Set(rows.value.map(row => row.created_by).filter((id): id is string => id != null && id !== ''))],
  )
  useBulkDataUser(authorIds, { includeAvatar: true, includeRole: true })

  const mentionIds = computed(() =>
    [...new Set(
      rows.value
        .filter(row => row.item_type === 'reply' && row.body != null)
        .flatMap(row => extractMentionIds(row.body!)),
    )],
  )
  const { users: mentionUsers } = useBulkDataUser(mentionIds, { includeAvatar: false })

  const mentionLookup = computed<Record<string, string>>(() => {
    const lookup: Record<string, string> = {}
    for (const [id, user] of mentionUsers.value.entries()) {
      if (user?.username)
        lookup[id] = user.username
    }
    return lookup
  })

  // ── Fetching ───────────────────────────────────────────────────────────────

  async function load(force = false) {
    const cached = force ? null : cache.get<FeedRow[]>(cacheKey)
    if (cached !== null) {
      await warmDiscussions(cached)
      rows.value = cached
      loading.value = false
      return
    }

    loading.value = true

    const { data, error } = await supabase.rpc('get_forum_activity_feed', {
      p_limit: FETCH_LIMIT,
      p_offset: 0,
    })

    if (error != null) {
      console.error('[useForumFeedPreview] fetch error:', error.message)
      loading.value = false
      return
    }

    const fetched = (data ?? []) as FeedRow[]
    await warmDiscussions(fetched)
    rows.value = fetched
    cache.set(cacheKey, fetched, ttl)
    loading.value = false
  }

  onMounted(() => {
    void load()
  })

  return {
    items,
    loading,
    mentionLookup,
    refresh: async () => load(true),
  }
}
