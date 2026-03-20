import type { Database } from '@/types/database.types'
import { ref } from 'vue'
import { useCache } from '@/composables/useCache'

const FORUM_STATS_CACHE_KEY = 'forum:stats'
const FORUM_STATS_TTL = 10 * 60 * 1000 // 10 minutes

export interface ForumUserStat {
  user_id: string
  count: number
}

export interface ForumUserRank {
  rank: number
  count: number
}

export interface ForumActivityPoint {
  date: string
  discussions: number
  replies: number
}

export interface ForumTopicStat {
  topic_id: string
  topic_name: string
  discussion_count: number
  reply_count: number
}

export interface ForumStats {
  topCombined: ForumUserStat[]
  topRepliers: ForumUserStat[]
  topStarters: ForumUserStat[]
  // Full sorted lists (not sliced) - used for out-of-top-10 rank lookups
  allCombined: ForumUserStat[]
  allRepliers: ForumUserStat[]
  allStarters: ForumUserStat[]
  activityOverTime: ForumActivityPoint[]
  topicBreakdown: ForumTopicStat[]
  totalDiscussions: number
  totalReplies: number
  totalTopics: number
  avgRepliesPerDiscussion: number
  avgPostsPerDay: number
}

export function useForumStats() {
  const supabase = useSupabaseClient<Database>()
  const cache = useCache()

  const stats = ref<ForumStats | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function fetchStats(force = false): Promise<void> {
    if (!force) {
      const cached = cache.get<ForumStats>(FORUM_STATS_CACHE_KEY)
      if (cached !== null) {
        stats.value = cached
        return
      }
    }

    loading.value = true
    error.value = null

    try {
      // Fetch all data in parallel
      const [
        repliesResult,
        discussionsResult,
        topicsResult,
      ] = await Promise.all([
        // All forum replies (not deleted) - use the forum_discussion_replies view
        supabase
          .from('forum_discussion_replies')
          .select('id, created_by, created_at, discussion_id, is_deleted')
          .eq('is_deleted', false)
          .order('created_at', { ascending: true }),

        // All forum discussions (with topic_id set = forum discussions)
        supabase
          .from('discussions')
          .select('id, created_by, created_at, discussion_topic_id, reply_count, is_draft')
          .not('discussion_topic_id', 'is', null)
          .eq('is_draft', false)
          .order('created_at', { ascending: true }),

        // All topics
        supabase
          .from('discussion_topics')
          .select('id, name, total_reply_count'),
      ])

      if (repliesResult.error)
        throw new Error(`Replies fetch failed: ${repliesResult.error.message}`)
      if (discussionsResult.error)
        throw new Error(`Discussions fetch failed: ${discussionsResult.error.message}`)
      if (topicsResult.error)
        throw new Error(`Topics fetch failed: ${topicsResult.error.message}`)

      const replies = repliesResult.data ?? []
      const discussions = discussionsResult.data ?? []
      const topics = topicsResult.data ?? []

      // ── Top repliers ──────────────────────────────────────────────────────
      const replierCounts = new Map<string, number>()
      for (const reply of replies) {
        if (reply.created_by != null) {
          replierCounts.set(reply.created_by, (replierCounts.get(reply.created_by) ?? 0) + 1)
        }
      }

      const allRepliers: ForumUserStat[] = Array.from(replierCounts.entries(), ([user_id, count]) => ({ user_id, count }))
        .toSorted((a, b) => b.count - a.count)
      const topRepliers = allRepliers.slice(0, 10)

      // ── Top discussion starters ───────────────────────────────────────────
      const starterCounts = new Map<string, number>()
      for (const discussion of discussions) {
        if (discussion.created_by != null) {
          starterCounts.set(discussion.created_by, (starterCounts.get(discussion.created_by) ?? 0) + 1)
        }
      }

      const allStarters: ForumUserStat[] = Array.from(starterCounts.entries(), ([user_id, count]) => ({ user_id, count }))
        .toSorted((a, b) => b.count - a.count)
      const topStarters = allStarters.slice(0, 10)

      // ── Combined (discussions + replies) ──────────────────────────────────
      const combinedCounts = new Map<string, number>()
      for (const [id, count] of replierCounts) {
        combinedCounts.set(id, (combinedCounts.get(id) ?? 0) + count)
      }
      for (const [id, count] of starterCounts) {
        combinedCounts.set(id, (combinedCounts.get(id) ?? 0) + count)
      }

      const allCombined: ForumUserStat[] = Array.from(combinedCounts.entries(), ([user_id, count]) => ({ user_id, count }))
        .toSorted((a, b) => b.count - a.count)
      const topCombined = allCombined.slice(0, 10)

      // ── Activity over time (weekly buckets) ───────────────────────────────
      const weeklyActivity = new Map<string, { discussions: number, replies: number }>()

      // Helper to get the Monday of a given week
      function getWeekKey(dateStr: string | null): string {
        if (dateStr == null)
          return ''
        const d = new Date(dateStr)
        const day = d.getUTCDay()
        const diff = d.getUTCDate() - day + (day === 0 ? -6 : 1) // Monday
        const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), diff))
        return monday.toISOString().slice(0, 10)
      }

      for (const discussion of discussions) {
        const key = getWeekKey(discussion.created_at)
        if (key === '')
          continue
        const bucket = weeklyActivity.get(key) ?? { discussions: 0, replies: 0 }
        bucket.discussions++
        weeklyActivity.set(key, bucket)
      }

      for (const reply of replies) {
        const key = getWeekKey(reply.created_at)
        if (key === '')
          continue
        const bucket = weeklyActivity.get(key) ?? { discussions: 0, replies: 0 }
        bucket.replies++
        weeklyActivity.set(key, bucket)
      }

      const activityOverTime: ForumActivityPoint[] = [...weeklyActivity.entries()]
        .toSorted(([a], [b]) => a.localeCompare(b))
        .map(([date, counts]) => ({
          date,
          discussions: counts.discussions,
          replies: counts.replies,
        }))

      // ── Topic breakdown ───────────────────────────────────────────────────
      const topicDiscussionCounts = new Map<string, number>()
      for (const discussion of discussions) {
        if (discussion.discussion_topic_id != null) {
          topicDiscussionCounts.set(
            discussion.discussion_topic_id,
            (topicDiscussionCounts.get(discussion.discussion_topic_id) ?? 0) + 1,
          )
        }
      }

      const topicBreakdown: ForumTopicStat[] = topics
        .map(topic => ({
          topic_id: topic.id,
          topic_name: topic.name,
          discussion_count: topicDiscussionCounts.get(topic.id) ?? 0,
          reply_count: topic.total_reply_count,
        }))
        .filter(t => t.discussion_count > 0 || t.reply_count > 0)
        .toSorted((a, b) => (b.discussion_count + b.reply_count) - (a.discussion_count + a.reply_count))

      // ── Summary stats ─────────────────────────────────────────────────────
      const totalDiscussions = discussions.length
      const totalReplies = replies.length
      const totalTopics = topics.length
      const avgRepliesPerDiscussion = totalDiscussions > 0
        ? Math.round((totalReplies / totalDiscussions) * 10) / 10
        : 0

      // Avg posts (discussions + replies) per day across the full date range
      const allDates = [
        ...discussions.map(d => d.created_at),
        ...replies.map(r => r.created_at),
      ].filter((d): d is string => d != null)

      let avgPostsPerDay = 0
      if (allDates.length > 0) {
        const timestamps = allDates.map(d => new Date(d).getTime())
        const earliest = Math.min(...timestamps)
        const latest = Math.max(...timestamps)
        const daySpan = Math.max(1, Math.ceil((latest - earliest) / (1000 * 60 * 60 * 24)))
        avgPostsPerDay = Math.round(((totalDiscussions + totalReplies) / daySpan) * 10) / 10
      }

      const result: ForumStats = {
        topCombined,
        topRepliers,
        topStarters,
        allCombined,
        allRepliers,
        allStarters,
        activityOverTime,
        topicBreakdown,
        totalDiscussions,
        totalReplies,
        totalTopics,
        avgRepliesPerDiscussion,
        avgPostsPerDay,
      }

      stats.value = result
      cache.set(FORUM_STATS_CACHE_KEY, result, FORUM_STATS_TTL)
    }
    catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch forum statistics'
      error.value = message
    }
    finally {
      loading.value = false
    }
  }

  return {
    stats,
    loading,
    error,
    fetchStats,
  }
}
