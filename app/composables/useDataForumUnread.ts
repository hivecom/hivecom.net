import { useStorage } from '@vueuse/core'
import dayjs from 'dayjs'

interface TopicSeenState {
  lastVisitedAt: string
}

interface DiscussionSeenState {
  seenReplyCount: number
}

interface ForumUnreadStorage {
  topics: Record<string, TopicSeenState>
  discussions: Record<string, DiscussionSeenState>
  feedVisitedAt: string | null
}

const STORAGE_KEY = 'forum-unread-v2'

/**
 * Composable for tracking "new posts" state on the forum index.
 *
 * Topics use a last-visited timestamp (activity is harder to count at topic level).
 * Discussions use a seen reply count - a dot only appears when reply_count exceeds
 * the count stored at last visit/reply, which cleanly handles the case where the
 * current user posted the latest reply.
 */
export function useDataForumUnread() {
  const storage = useStorage<ForumUnreadStorage>(
    STORAGE_KEY,
    { topics: {}, discussions: {}, feedVisitedAt: null },
    typeof window !== 'undefined' ? window.localStorage : undefined,
    {
      mergeDefaults: true,
      serializer: {
        read: (v) => {
          try {
            return v ? (JSON.parse(v) as ForumUnreadStorage) : { topics: {}, discussions: {}, feedVisitedAt: null }
          }
          catch {
            return { topics: {}, discussions: {}, feedVisitedAt: null }
          }
        },
        write: v => JSON.stringify(v),
      },
    },
  )

  /**
   * Returns true when a topic has activity after the user last visited it.
   * Always returns false for topics not yet stored.
   */
  function isTopicNew(topicId: string, lastActivityAt: string | null): boolean {
    const seen = storage.value.topics[topicId]
    if (!seen)
      return false
    if (lastActivityAt == null || lastActivityAt === '')
      return false
    return dayjs(lastActivityAt).isAfter(dayjs(seen.lastVisitedAt))
  }

  /**
   * Returns true when a discussion has more replies than when the user last saw it.
   * Always returns false for discussions not yet stored.
   */
  function isDiscussionNew(discussionId: string, replyCount: number | null): boolean {
    const seen = storage.value.discussions[discussionId]
    if (!seen)
      return false
    if (replyCount == null)
      return false
    return replyCount > seen.seenReplyCount
  }

  /** Record the current time for a topic as "seen". */
  function markTopicSeen(topicId: string) {
    storage.value = {
      ...storage.value,
      topics: {
        ...storage.value.topics,
        [topicId]: {
          lastVisitedAt: new Date().toISOString(),
        },
      },
    }
  }

  /** Record the current reply count for a discussion as "seen". */
  function markDiscussionSeen(discussionId: string, replyCount: number) {
    storage.value = {
      ...storage.value,
      discussions: {
        ...storage.value.discussions,
        [discussionId]: {
          seenReplyCount: replyCount,
        },
      },
    }
  }

  /**
   * Called once after topics (with discussions) are fetched. Any topic or
   * discussion not yet in storage is seeded with its current state so we don't
   * flood the UI with dots on first visit.
   */
  function initializeTopics(
    topics: Array<{
      id: string
      last_activity_at?: string | null
      discussions: Array<{ id: string, reply_count?: number | null }>
    }>,
  ) {
    const updatedTopics = { ...storage.value.topics }
    const updatedDiscussions = { ...storage.value.discussions }
    let changed = false

    for (const topic of topics) {
      if (!(topic.id in updatedTopics)) {
        updatedTopics[topic.id] = {
          lastVisitedAt: topic.last_activity_at ?? new Date().toISOString(),
        }
        changed = true
      }

      for (const discussion of topic.discussions) {
        if (!(discussion.id in updatedDiscussions)) {
          updatedDiscussions[discussion.id] = {
            seenReplyCount: discussion.reply_count ?? 0,
          }
          changed = true
        }
      }
    }

    if (changed) {
      storage.value = { ...storage.value, topics: updatedTopics, discussions: updatedDiscussions }
    }
  }

  /**
   * Like `initializeTopics` but only seeds topic-level state. Used when only
   * topics (without full discussion lists) are loaded on mount.
   */
  function initializeTopicsOnly(
    topics: Array<{ id: string, last_activity_at?: string | null }>,
  ) {
    const updatedTopics = { ...storage.value.topics }
    let changed = false

    for (const topic of topics) {
      if (!(topic.id in updatedTopics)) {
        updatedTopics[topic.id] = {
          lastVisitedAt: topic.last_activity_at ?? new Date().toISOString(),
        }
        changed = true
      }
    }

    if (changed) {
      storage.value = { ...storage.value, topics: updatedTopics }
    }
  }

  /**
   * Records the current time as the feed visit timestamp and returns the
   * previous value. Call this once on mount (client-side only) so the
   * "last visited" divider in the activity feed reflects the prior session.
   */
  function recordFeedVisit(): string | null {
    const previous = storage.value.feedVisitedAt
    storage.value = { ...storage.value, feedVisitedAt: new Date().toISOString() }
    return previous
  }

  return {
    isTopicNew,
    isDiscussionNew,
    markTopicSeen,
    markDiscussionSeen,
    initializeTopics,
    initializeTopicsOnly,
    recordFeedVisit,
  }
}
