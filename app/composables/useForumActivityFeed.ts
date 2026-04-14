import type { ComputedRef, Ref } from 'vue'
import type { Tables } from '@/types/database.overrides'
import type { Database } from '@/types/database.types'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import { computed, ref, watchEffect } from 'vue'
import { useCache } from '@/composables/useCache'
import { useUserId } from '@/composables/useUserId'
import { extractMentionIds } from '@/lib/markdownProcessors'

dayjs.extend(relativeTime)

const FORUM_REPLIES_CACHE_KEY = 'forum:latest-replies:v2'
const FORUM_REPLIES_TTL = 2 * 60 * 1000 // 2 minutes

export interface ActivityItem {
  id: string
  type: 'Topic' | 'Discussion' | 'Reply'
  typeLabel?: string
  typeContext?: string
  title: string
  description?: string
  timestamp: string
  timestampRaw: string
  user: string
  discussionId?: string
  href?: string
  onClick?: () => void
  isArchived?: boolean
  isNsfw?: boolean
  isOfftopic?: boolean
  icon: string
}

export type TopicWithDiscussions = Tables<'discussion_topics'> & {
  discussions: Tables<'discussions'>[]
}

export interface UseForumActivityFeedOptions {
  topics: Ref<TopicWithDiscussions[]>
  settings: Ref<{
    show_nsfw_content: boolean
    show_forum_archived: boolean
    show_forum_updates: boolean
  }>
  discussionLookup: ComputedRef<Map<string, Tables<'discussions'>>>
  visibleDiscussionIds: ComputedRef<Set<string>>
  hiddenTopicIds: ComputedRef<Set<string>>
  /** Called when a topic item is clicked in the latest-posts list */
  onTopicClick: (id: string) => void
}

export function useForumActivityFeed({
  topics,
  settings,
  discussionLookup,
  visibleDiscussionIds,
  hiddenTopicIds,
  onTopicClick,
}: UseForumActivityFeedOptions) {
  const supabase = useSupabaseClient<Database>()
  const forumCache = useCache()
  const userId = useUserId()

  const latestReplies = ref<ActivityItem[]>([])

  // Realtime-only items (new discussions arriving via INSERT) that bypass the
  // latestReplies pipeline. These are already in display format and get merged
  // directly into latestPosts alongside flattenedTopics.
  const realtimeDiscussions = ref<ActivityItem[]>([])

  async function fetchLatestReplies() {
    const cached = forumCache.get<ActivityItem[]>(FORUM_REPLIES_CACHE_KEY)
    if (cached !== null) {
      latestReplies.value = cached
      return
    }

    await supabase
      .from('forum_discussion_replies')
      .select('*')
      .eq('is_offtopic', false)
      .eq('is_deleted', false)
      .limit(30)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        if (data) {
          const mapped = data.map(item => ({
            id: item.id,
            type: 'Reply' as const,
            icon: 'ph:chats-circle',
            title: 'Reply',
            description: item.markdown,
            timestamp: `${dayjs(item.created_at).fromNow()}`,
            timestampRaw: item.created_at,
            user: item.created_by!,
            discussionId: item.discussion_id,
            href: `/forum/${item.discussion_id}?comment=${item.id}`,
            isNsfw: !!item.is_nsfw,
            isOfftopic: !!item.is_offtopic,
          } as ActivityItem))

          latestReplies.value = mapped
          forumCache.set(FORUM_REPLIES_CACHE_KEY, mapped, FORUM_REPLIES_TTL)
        }
      })
  }

  // Replies filtered for visibility - respects NSFW setting and parent topic visibility
  const visibleReplies = computed<ActivityItem[]>(() => {
    return latestReplies.value
      .filter((reply) => {
        if (reply.discussionId == null)
          return false

        if (reply.isOfftopic)
          return false

        if ((reply.description ?? '').trim().length === 0)
          return false

        if (!settings.value.show_nsfw_content) {
          if (reply.isNsfw)
            return false
          const discussion = discussionLookup.value.get(reply.discussionId)
          if (discussion?.is_nsfw)
            return false
        }

        return visibleDiscussionIds.value.has(reply.discussionId)
      })
      .map((reply) => {
        const discussion = reply.discussionId != null ? discussionLookup.value.get(reply.discussionId) : null

        return {
          ...reply,
          type: 'Reply' as const,
          typeLabel: 'Reply in',
          typeContext: discussion?.title ?? 'Discussion',
          title: reply.description ?? 'Reply',
          description: undefined,
          href: `/forum/${discussion?.slug ?? reply.discussionId}?comment=${reply.id}`,
        }
      })
  })

  // Flat list of all topics+discussions+replies sorted by most recent activity
  const latestPosts = computed<ActivityItem[]>(() => {
    const flattenedTopics = topics.value
      .flatMap(topic => [topic, ...topic.discussions])
      .filter((item) => {
        if (!settings.value.show_nsfw_content && 'is_nsfw' in item && item.is_nsfw)
          return false
        if (settings.value.show_forum_archived)
          return true
        if ('discussion_topic_id' in item && item.discussion_topic_id != null && hiddenTopicIds.value.has(item.discussion_topic_id))
          return false
        return !item.is_archived
      })
      .map((item) => {
        const isTopic = !('discussion_topic_id' in item)
        const id = item.id

        const title = (isTopic ? (item).name : (item).title) ?? (isTopic ? 'Topic' : 'Discussion')

        return {
          id,
          type: isTopic ? 'Topic' : 'Discussion',
          typeLabel: isTopic ? 'Created Topic' : 'Created Discussion',
          title,
          description: item.description ?? undefined,
          timestamp: `${dayjs(item.created_at).fromNow()}`,
          timestampRaw: item.created_at,
          user: item.created_by,
          icon: isTopic ? 'ph:folder-open' : 'ph:scroll',
          isArchived: item.is_archived,
          ...(isTopic
            ? { onClick: () => onTopicClick(id) }

            : { href: `/forum/${(item).slug ?? id}` }),
        } as ActivityItem
      })

    return [...realtimeDiscussions.value, ...flattenedTopics, ...visibleReplies.value]
      .toSorted((a, b) => {
        const ta = new Date(a.timestampRaw).getTime()
        const tb = new Date(b.timestampRaw).getTime()
        return ta > tb ? -1 : ta < tb ? 1 : 0
      })
      // .slice(0, 20)
  })

  // IDs of all users mentioned in latest post descriptions/titles
  const latestPostMentionIds = computed(() => {
    const ids = new Set<string>()
    latestPosts.value.forEach((post) => {
      const text = post.description ?? post.title
      extractMentionIds(text ?? '').forEach(id => ids.add(id))
    })
    return [...ids]
  })

  // Stable ref for author IDs - avoids spurious useBulkDataUser re-fetches
  const latestPostAuthorIds = ref<string[]>([])
  let _lastAuthorKey = ''

  watchEffect(() => {
    const ids = [...new Set(latestPosts.value.map(p => p.user).filter((id): id is string => id != null))]
    const key = ids.toSorted().join(',')
    if (key !== _lastAuthorKey) {
      _lastAuthorKey = key
      latestPostAuthorIds.value = ids
    }
  })

  const postSinceYesterday = ref(0)

  async function fetchTodayCount() {
    const { data, error } = await supabase.rpc('get_forum_activity_feed_today_count', {
      ...(userId.value != null ? { p_exclude: userId.value } : {}),
    })
    if (error != null) {
      console.error('[useForumActivityFeed] today count error:', error.message)
      return
    }
    postSinceYesterday.value = data ?? 0
  }

  /**
   * Prepend a single reply ActivityItem to the live feed without waiting for
   * a cache-busting refetch. The cache is invalidated so the next cold load
   * picks up the fresh data from the server.
   */
  function prependReplyItem(item: ActivityItem) {
    latestReplies.value = [item, ...latestReplies.value]
    forumCache.delete(FORUM_REPLIES_CACHE_KEY)
  }

  /**
   * Prepend a new discussion that arrived via realtime INSERT. These don't go
   * through latestReplies - they're merged directly into latestPosts.
   */
  function prependDiscussionItem(item: ActivityItem) {
    realtimeDiscussions.value = [item, ...realtimeDiscussions.value]
  }

  return {
    latestReplies,
    latestPosts,
    latestPostMentionIds,
    latestPostAuthorIds,
    postSinceYesterday,
    visibleReplies,
    fetchLatestReplies,
    fetchTodayCount,
    prependReplyItem,
    prependDiscussionItem,
  }
}
