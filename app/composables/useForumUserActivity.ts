import type { ComputedRef, Ref } from 'vue'
import type { Tables } from '@/types/database.overrides'
import type { Database } from '@/types/database.types'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import { computed, ref, watch } from 'vue'
import { useCache } from '@/composables/useCache'

interface ReplyJoinedDiscussion {
  id: string | null
  title: string | null
  slug: string | null
  discussion_topic_id: string | null
}

dayjs.extend(relativeTime)

const FORUM_USER_ACTIVITY_TTL = 2 * 60 * 1000 // 2 minutes - short enough to feel live

function forumUserActivityCacheKey(uid: string): string {
  return `forum:user-activity:${uid}`
}

export interface UserActivityItem {
  id: string
  type: 'Reply' | 'Discussion'
  discussionId: string
  discussionTopicId: string | null
  discussionTitle: string
  discussionHref: string
  timestampRaw: string
  timestamp: string
}

export interface UseForumUserActivityOptions {
  /** Reactive ref of the logged-in user's ID */
  userId: Ref<string | null | undefined>
  /** Reactive settings object - used to filter NSFW content */
  settings: Ref<{ show_nsfw_content: boolean }>
  /** Lookup map from discussion id → discussion row, used for NSFW filtering */
  discussionLookup: ComputedRef<Map<string, Tables<'discussions'>>>
}

export function useForumUserActivity({ userId, settings, discussionLookup }: UseForumUserActivityOptions) {
  const supabase = useSupabaseClient<Database>()
  const forumCache = useCache()

  const userActivity = ref<UserActivityItem[]>([])
  const userActivityLoading = ref(false)

  async function fetchUserActivity(uid: string | null | undefined) {
    if (uid == null) {
      userActivity.value = []
      return
    }

    // Check cache first - avoids a round-trip on back-navigation within TTL
    const cacheKey = forumUserActivityCacheKey(uid)
    const cached = forumCache.get<UserActivityItem[]>(cacheKey)
    if (cached !== null) {
      userActivity.value = cached
      return
    }

    // Only show loading state on first load
    if (userActivity.value.length === 0) {
      userActivityLoading.value = true
    }

    const [repliesRes, discussionsRes] = await Promise.all([
      // Use the forum_discussion_replies view which is already scoped to
      // discussions that have a discussion_topic_id (i.e. forum threads only),
      // avoiding the unreliable embedded-filter workaround on the raw table.
      supabase
        .from('forum_discussion_replies')
        .select('id, created_at, discussion_id, discussions!discussion_replies_discussion_id_fkey(id, title, slug, discussion_topic_id)')
        .eq('created_by', uid)
        .eq('is_deleted', false)
        .limit(20)
        .order('created_at', { ascending: false }),
      // Discussions the user created on the forum - we'll only surface ones
      // where the user has no reply yet (brand-new threads with 0 replies from them).
      supabase
        .from('discussions')
        .select('id, title, slug, last_activity_at, discussion_topic_id')
        .eq('created_by', uid)
        .eq('is_draft', false)
        .not('discussion_topic_id', 'is', null)
        .limit(20)
        .order('last_activity_at', { ascending: false }),
    ])

    // Build reply items - timestamp is when the user actually posted the reply
    const replyItems: UserActivityItem[] = (repliesRes.data ?? []).map((item) => {
      // eslint-disable-next-line ts/no-unsafe-assignment
      const rawDiscussion = Array.isArray(item.discussions) ? item.discussions[0] : item.discussions
      const discussion = rawDiscussion as ReplyJoinedDiscussion | null | undefined
      const slug = discussion?.slug ?? item.discussion_id
      return {
        id: (item.id ?? item.discussion_id)!,
        type: 'Reply',
        discussionId: item.discussion_id!,
        discussionTopicId: discussion?.discussion_topic_id ?? null,
        discussionTitle: discussion?.title ?? 'Discussion',
        discussionHref: `/forum/${slug}?comment=${item.id}`,
        timestampRaw: item.created_at!,
        timestamp: dayjs(item.created_at).fromNow(),
      }
    })

    // Collect discussion IDs the user has already replied in so we don't
    // double-count them below with a stale created_at timestamp.
    const repliedDiscussionIds = new Set(replyItems.map(r => r.discussionId))

    // Only include created discussions that the user hasn't replied in yet -
    // those are already represented (with correct timestamps) via replyItems.
    const discussionItems: UserActivityItem[] = (discussionsRes.data ?? [])
      .filter(item => !repliedDiscussionIds.has(item.id))
      .map(item => ({
        id: item.id,
        type: 'Discussion' as const,
        discussionId: item.id,
        discussionTopicId: item.discussion_topic_id ?? null,
        discussionTitle: item.title ?? 'Discussion',
        discussionHref: `/forum/${item.slug ?? item.id}`,
        timestampRaw: item.last_activity_at,
        timestamp: dayjs(item.last_activity_at).fromNow(),
      }))

    // Merge, sort by most recent user action, deduplicate by discussion, take top 6
    const seenDiscussionIds = new Set<string>()
    userActivity.value = [...replyItems, ...discussionItems]
      .sort((a, b) => (a.timestampRaw > b.timestampRaw ? -1 : 1))
      .filter((item) => {
        if (seenDiscussionIds.has(item.discussionId))
          return false
        seenDiscussionIds.add(item.discussionId)
        return true
      })
      .slice(0, 6)

    forumCache.set(cacheKey, userActivity.value, FORUM_USER_ACTIVITY_TTL)
    userActivityLoading.value = false
  }

  // Filters the raw userActivity list reactively so toggling show_nsfw_content
  // immediately hides NSFW discussions from the "Recently visited" section.
  // discussionLookup already contains is_nsfw from the topics fetch.
  const visibleUserActivity = computed(() => {
    if (settings.value.show_nsfw_content)
      return userActivity.value

    return userActivity.value.filter((item) => {
      const discussion = discussionLookup.value.get(item.discussionId)
      return !discussion?.is_nsfw
    })
  })

  // Re-fetch when the logged-in user changes.
  watch(userId, uid => void fetchUserActivity(uid), { immediate: true })

  return {
    userActivity,
    userActivityLoading,
    visibleUserActivity,
    fetchUserActivity,
  }
}
