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

// Payload of the get_forum_stats RPC. Aggregation happens in Postgres so the
// response scales with weeks, users, and topics rather than posts, and the
// function applies the visibility rules (drafts, deleted replies, replies on
// discussions the caller can't see) on top of RLS.
interface ForumStatsPayload {
  totals: {
    topics: number
    discussions: number
    replies: number
    first_activity_at: string | null
    last_activity_at: string | null
  }
  activity: { week: string, discussions: number, replies: number }[]
  starters: ForumUserStat[]
  repliers: ForumUserStat[]
  combined: ForumUserStat[]
  topics: ForumTopicStat[]
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
      const { data, error: rpcError } = await supabase.rpc('get_forum_stats')

      if (rpcError)
        throw new Error(`Forum stats fetch failed: ${rpcError.message}`)

      const payload = data as unknown as ForumStatsPayload
      const { totals } = payload

      const activityOverTime: ForumActivityPoint[] = payload.activity.map(point => ({
        date: point.week,
        discussions: point.discussions,
        replies: point.replies,
      }))

      const avgRepliesPerDiscussion = totals.discussions > 0
        ? Math.round((totals.replies / totals.discussions) * 10) / 10
        : 0

      // Posts per day across the full span between the first and last visible
      // discussion or reply
      let avgPostsPerDay = 0
      if (totals.first_activity_at != null && totals.last_activity_at != null) {
        const earliest = new Date(totals.first_activity_at).getTime()
        const latest = new Date(totals.last_activity_at).getTime()
        const daySpan = Math.max(1, Math.ceil((latest - earliest) / (1000 * 60 * 60 * 24)))
        avgPostsPerDay = Math.round(((totals.discussions + totals.replies) / daySpan) * 10) / 10
      }

      const result: ForumStats = {
        topCombined: payload.combined.slice(0, 10),
        topRepliers: payload.repliers.slice(0, 10),
        topStarters: payload.starters.slice(0, 10),
        allCombined: payload.combined,
        allRepliers: payload.repliers,
        allStarters: payload.starters,
        activityOverTime,
        topicBreakdown: payload.topics,
        totalDiscussions: totals.discussions,
        totalReplies: totals.replies,
        totalTopics: totals.topics,
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
