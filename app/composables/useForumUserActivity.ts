import type { ComputedRef, Ref } from 'vue'
import type { Tables } from '@/types/database.overrides'
import type { Database } from '@/types/database.types'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import { computed, ref, watch } from 'vue'
import { useCache } from '@/composables/useCache'
import { CACHE_NAMESPACES } from '@/lib/cache/namespaces'
import { unwrapJoin } from '@/lib/utils/common'

interface ReplyJoinedDiscussion {
  id: string | null
  title: string | null
  slug: string | null
  discussion_topic_id: string | null
  is_archived: boolean | null
}

dayjs.extend(relativeTime)

const FORUM_USER_ACTIVITY_TTL = 2 * 60 * 1000 // short enough to feel live

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
  isArchived: boolean
}

export interface UseForumUserActivityOptions {
  userId: Ref<string | null | undefined>
  settings: Ref<{ show_nsfw_content: boolean, show_forum_archived: boolean }>
  /** Discussion id to row, for NSFW filtering. */
  discussionLookup: ComputedRef<Map<string, Tables<'discussions'>>>
}

export function useForumUserActivity({ userId, settings, discussionLookup }: UseForumUserActivityOptions) {
  const supabase = useSupabaseClient<Database>()
  const forumCache = useCache(CACHE_NAMESPACES.forum)

  const userActivity = ref<UserActivityItem[]>([])
  const userActivityLoading = ref(false)

  async function fetchUserActivity(uid: string | null | undefined) {
    if (uid == null) {
      userActivity.value = []
      return
    }

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
      // The forum_discussion_replies view is already scoped to forum threads,
      // avoiding the unreliable embedded-filter workaround on the raw table.
      supabase
        .from('forum_discussion_replies')
        .select('id, created_at, discussion_id, discussions!discussion_replies_discussion_id_fkey(id, title, slug, discussion_topic_id, is_archived)')
        .eq('created_by', uid)
        .eq('is_deleted', false)
        .limit(20)
        .order('created_at', { ascending: false }),
      supabase
        .from('discussions')
        .select('id, title, slug, created_at, discussion_topic_id, is_archived')
        .eq('created_by', uid)
        .eq('is_draft', false)
        .not('discussion_topic_id', 'is', null)
        .limit(20)
        .order('created_at', { ascending: false }),
    ])

    // The timestamp is when the user posted the reply.
    const replyItems: UserActivityItem[] = (repliesRes.data ?? []).map((item) => {
      const discussion = unwrapJoin<ReplyJoinedDiscussion>(item.discussions)
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
        isArchived: !!discussion?.is_archived,
      }
    })

    // Collect discussion IDs the user has already replied in so we don't
    // double-count them below with a stale created_at timestamp.
    const repliedDiscussionIds = new Set(replyItems.map(r => r.discussionId))

    const discussionItems: UserActivityItem[] = (discussionsRes.data ?? [])
      .filter(item => !repliedDiscussionIds.has(item.id))
      .map(item => ({
        id: item.id,
        type: 'Discussion' as const,
        discussionId: item.id,
        discussionTopicId: item.discussion_topic_id ?? null,
        discussionTitle: item.title ?? 'Discussion',
        discussionHref: `/forum/${item.slug ?? item.id}`,
        // Not last_activity_at: that reflects other people's replies and would
        // float old threads above ones the user recently posted in.
        timestampRaw: item.created_at,
        timestamp: dayjs(item.created_at).fromNow(),
        isArchived: !!item.is_archived,
      }))

    const seenDiscussionIds = new Set<string>()
    userActivity.value = [...replyItems, ...discussionItems]
      .sort((a, b) => b.timestampRaw.localeCompare(a.timestampRaw))
      .filter((item) => {
        if (seenDiscussionIds.has(item.discussionId))
          return false

        seenDiscussionIds.add(item.discussionId)
        return true
      })
      .slice(0, 20)

    forumCache.set(cacheKey, userActivity.value, FORUM_USER_ACTIVITY_TTL)
    userActivityLoading.value = false
  }

  // Filters the raw userActivity list reactively so toggling show_nsfw_content
  // immediately hides NSFW discussions from the "Recently visited" section.
  // Archived discussions only show with show_forum_archived on.
  const visibleUserActivity = computed(() => {
    return userActivity.value.filter((item) => {
      const discussion = discussionLookup.value.get(item.discussionId)

      if (!settings.value.show_forum_archived) {
        if (item.isArchived)
          return false

        // Also cross-check the live lookup in case the topic-level data has updated
        if (discussion?.is_archived)
          return false
      }

      if (!settings.value.show_nsfw_content) {
        if (discussion?.is_nsfw)
          return false
      }

      return true
    })
  })

  watch(userId, uid => void fetchUserActivity(uid), { immediate: true })

  return {
    userActivity,
    userActivityLoading,
    visibleUserActivity,
    fetchUserActivity,
  }
}
