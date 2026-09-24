import type { ComputedRef, Ref } from 'vue'
import type { TopicWithDiscussions } from '@/composables/useForumTopics'
import type { Tables } from '@/types/database.overrides'
import type { Database } from '@/types/database.types'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import { computed, ref, watchEffect } from 'vue'
import { useCache } from '@/composables/useCache'
import { useUserId } from '@/composables/useUserId'
import { CACHE_NAMESPACES } from '@/lib/cache/namespaces'
import { extractMentionIds } from '@/lib/markdownProcessors'

dayjs.extend(relativeTime)

const FORUM_REPLIES_CACHE_KEY = 'latest-replies:v2'
const FORUM_TODAY_COUNT_CACHE_KEY = 'today-count'
const FORUM_REPLIES_TTL = 2 * 60 * 1000
const FORUM_TODAY_COUNT_TTL = 5 * 60 * 1000 // changes slowly

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

export interface UseForumActivityFeedOptions {
  topics: Ref<TopicWithDiscussions[]>
  allDiscussions: Ref<Tables<'discussions'>[]>
  settings: Ref<{
    show_nsfw_content: boolean
    show_forum_archived: boolean
    show_forum_updates: boolean
  }>
  discussionLookup: ComputedRef<Map<string, Tables<'discussions'>>>
  visibleDiscussionIds: ComputedRef<Set<string>>
  hiddenTopicIds: ComputedRef<Set<string>>
  onTopicClick: (id: string) => void
}

export function useForumActivityFeed({
  topics,
  allDiscussions,
  settings,
  discussionLookup,
  visibleDiscussionIds,
  hiddenTopicIds,
  onTopicClick,
}: UseForumActivityFeedOptions) {
  const supabase = useSupabaseClient<Database>()
  const forumCache = useCache(CACHE_NAMESPACES.forum)
  const userId = useUserId()

  const latestReplies = ref<ActivityItem[]>([])

  // New discussions from realtime INSERTs. They're already in display format, so
  // they skip the latestReplies pipeline and merge straight into latestPosts.
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

  // Respects the NSFW setting and parent topic visibility.
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
    const flattenedTopicItems: ActivityItem[] = topics.value
      .filter(topic => settings.value.show_forum_archived || !topic.is_archived)
      .map((topic) => {
        return {
          id: topic.id,
          type: 'Topic' as const,
          typeLabel: 'Created Topic',
          title: topic.name,
          description: topic.description ?? undefined,
          timestamp: `${dayjs(topic.created_at).fromNow()}`,
          timestampRaw: topic.created_at,
          user: topic.created_by,
          icon: 'ph:folder-open',
          isArchived: topic.is_archived,
          onClick: () => onTopicClick(topic.id),
        } as ActivityItem
      })

    const flattenedDiscussions: ActivityItem[] = allDiscussions.value
      .filter((d) => {
        if (!settings.value.show_nsfw_content && d.is_nsfw)
          return false

        if (!settings.value.show_forum_archived) {
          if (d.is_archived)
            return false
          if (d.discussion_topic_id != null && hiddenTopicIds.value.has(d.discussion_topic_id))
            return false
        }
        return true
      })
      .map(d => ({
        id: d.id,
        type: 'Discussion' as const,
        typeLabel: 'Created Discussion',
        title: d.title ?? 'Discussion',
        description: d.description ?? undefined,
        timestamp: `${dayjs(d.created_at).fromNow()}`,
        timestampRaw: d.created_at,
        user: d.created_by,
        icon: 'ph:scroll',
        isArchived: d.is_archived,
        href: `/forum/${d.slug ?? d.id}`,
      } as ActivityItem))

    const flattenedTopics = [...flattenedTopicItems, ...flattenedDiscussions]

    return [...realtimeDiscussions.value, ...flattenedTopics, ...visibleReplies.value]
      .toSorted((a, b) => {
        const ta = new Date(a.timestampRaw).getTime()
        const tb = new Date(b.timestampRaw).getTime()
        return ta > tb ? -1 : ta < tb ? 1 : 0
      })
      // .slice(0, 20)
  })

  const latestPostMentionIds = computed(() => {
    const ids = new Set<string>()
    latestPosts.value.forEach((post) => {
      const text = post.description ?? post.title
      extractMentionIds(text ?? '').forEach(id => ids.add(id))
    })
    return [...ids]
  })

  // Stable ref so useBulkDataUser doesn't refetch spuriously.
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
  const postsSinceLastVisit = ref(0)

  async function fetchTodayCount() {
    const cacheKey = userId.value != null
      ? `${FORUM_TODAY_COUNT_CACHE_KEY}:${userId.value}`
      : FORUM_TODAY_COUNT_CACHE_KEY

    const cached = forumCache.get<number>(cacheKey)
    if (cached !== null) {
      postSinceYesterday.value = cached
      return
    }

    const { data, error } = await supabase.rpc('get_forum_activity_feed_today_count', {
      ...(userId.value != null ? { p_exclude: userId.value } : {}),
    })
    if (error != null) {
      console.error('[useForumActivityFeed] today count error:', error.message)
      return
    }
    const count = data ?? 0
    postSinceYesterday.value = count
    forumCache.set<number>(cacheKey, count, FORUM_TODAY_COUNT_TTL)
  }

  /**
   * Counted server-side so the "since last visit" badge isn't capped by the
   * carousel slice or the 30-row replies fetch. Uncached on purpose: the
   * watermark changes per visit, so a cached value would mislead the badge.
   */
  async function fetchSinceLastVisitCount(since: string | null) {
    if (since == null) {
      postsSinceLastVisit.value = 0
      return
    }

    const { data, error } = await supabase.rpc('get_forum_activity_feed_count_since', {
      p_since: since,
      ...(userId.value != null ? { p_exclude: userId.value } : {}),
    })
    if (error != null) {
      console.error('[useForumActivityFeed] since-last-visit count error:', error.message)
      return
    }
    postsSinceLastVisit.value = data ?? 0
  }

  /** Locally increment the badge when realtime delivers a new item. */
  function bumpSinceLastVisitCount(delta = 1) {
    postsSinceLastVisit.value = Math.max(0, postsSinceLastVisit.value + delta)
  }

  // Invalidates the cache too, so the next cold load gets fresh server data.
  function prependReplyItem(item: ActivityItem) {
    latestReplies.value = [item, ...latestReplies.value]
    forumCache.delete(FORUM_REPLIES_CACHE_KEY)

    // Also bust today count so the badge updates on next fetch
    const countKey = userId.value != null
      ? `${FORUM_TODAY_COUNT_CACHE_KEY}:${userId.value}`
      : FORUM_TODAY_COUNT_CACHE_KEY
    forumCache.delete(countKey)
  }

  function prependDiscussionItem(item: ActivityItem) {
    realtimeDiscussions.value = [item, ...realtimeDiscussions.value]
  }

  return {
    latestReplies,
    latestPosts,
    latestPostMentionIds,
    latestPostAuthorIds,
    postSinceYesterday,
    postsSinceLastVisit,
    visibleReplies,
    fetchLatestReplies,
    fetchTodayCount,
    fetchSinceLastVisitCount,
    bumpSinceLastVisitCount,
    prependReplyItem,
    prependDiscussionItem,
  }
}
