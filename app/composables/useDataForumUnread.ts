import { useStorage } from '@vueuse/core'

interface TopicSeenState {
  discussionCount: number
  replyCount: number
}

interface DiscussionSeenState {
  replyCount: number
}

interface ForumUnreadStorage {
  topics: Record<string, TopicSeenState>
  discussions: Record<string, DiscussionSeenState>
  feedVisitedAt: string | null
}

const STORAGE_KEY = 'forum-unread'

/**
 * Composable for tracking "new posts" state on the forum index.
 *
 * Uses localStorage to record the last-seen discussion and reply counts per
 * topic and per discussion. On first encounter of a topic/discussion the
 * current counts are stored as "seen" (so we don't flood the UI with dots on
 * first visit). Subsequent visits compare the live counts to those stored
 * values and surface a dot indicator whenever counts have grown.
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
   * Returns true when a topic has accrued new discussions or replies since the
   * user last "saw" it. Always returns false for topics not yet stored (they
   * will be initialised as seen by `initializeTopics`).
   *
   * Cross-checks the per-discussion seen state: if every discussion in the
   * topic has already been individually marked seen at its current reply count
   * (e.g. the user navigated to each discussion via the activity feed without
   * ever clicking the topic row), the dot is suppressed even though the
   * topic-level aggregate counters were never explicitly updated.
   */
  function isTopicNew(
    topicId: string,
    currentDiscussionCount: number,
    currentReplyCount: number,
    discussions?: Array<{ id: string, reply_count?: number | null }>,
  ): boolean {
    const seen = storage.value.topics[topicId]
    if (!seen)
      return false

    const hasNewAtTopicLevel = currentDiscussionCount > seen.discussionCount || currentReplyCount > seen.replyCount
    if (!hasNewAtTopicLevel)
      return false

    // If the caller provides the discussions list we can check whether every
    // discussion is already individually caught up. If so, the aggregate
    // counters are stale (topic was never clicked directly) but nothing is
    // actually unread - suppress the dot.
    if (discussions != null && discussions.length > 0) {
      const allDiscussionsSeen = discussions.every((d) => {
        const dSeen = storage.value.discussions[d.id]
        if (!dSeen)
          return false
        return (d.reply_count ?? 0) <= dSeen.replyCount
      })
      if (allDiscussionsSeen)
        return false
    }

    return true
  }

  /**
   * Returns true when a discussion has more replies than when the user last
   * visited it. Always returns false for discussions not yet stored.
   */
  function isDiscussionNew(discussionId: string, currentReplyCount: number): boolean {
    const seen = storage.value.discussions[discussionId]
    if (!seen)
      return false
    return currentReplyCount > seen.replyCount
  }

  /** Record the current counts for a topic as "seen". */
  function markTopicSeen(topicId: string, currentDiscussionCount: number, currentReplyCount: number) {
    storage.value = {
      ...storage.value,
      topics: {
        ...storage.value.topics,
        [topicId]: {
          discussionCount: currentDiscussionCount,
          replyCount: currentReplyCount,
        },
      },
    }
  }

  /**
   * Bump the stored reply count for a topic by 1. Call this after the current
   * user posts a reply so the topic-level unread dot doesn't fire for their
   * own activity when they return to the forum index.
   */
  function bumpTopicReplySeen(topicId: string) {
    const seen = storage.value.topics[topicId]
    if (!seen)
      return
    storage.value = {
      ...storage.value,
      topics: {
        ...storage.value.topics,
        [topicId]: {
          ...seen,
          replyCount: seen.replyCount + 1,
        },
      },
    }
  }

  /** Record the current reply count for a discussion as "seen". */
  function markDiscussionSeen(discussionId: string, currentReplyCount: number) {
    storage.value = {
      ...storage.value,
      discussions: {
        ...storage.value.discussions,
        [discussionId]: {
          replyCount: currentReplyCount,
        },
      },
    }
  }

  /**
   * Called once after topics are fetched. Any topic or discussion that has
   * never been stored before is initialised with its current counts so that
   * only activity that occurs *after* first encounter triggers a dot.
   */
  function initializeTopics(
    topics: Array<{
      id: string
      total_reply_count?: number | null
      discussions: Array<{ id: string, reply_count?: number | null }>
    }>,
  ) {
    const updatedTopics = { ...storage.value.topics }
    const updatedDiscussions = { ...storage.value.discussions }
    let changed = false

    for (const topic of topics) {
      if (!(topic.id in updatedTopics)) {
        updatedTopics[topic.id] = {
          discussionCount: topic.discussions.length,
          replyCount: topic.total_reply_count ?? 0,
        }
        changed = true
      }

      for (const discussion of topic.discussions) {
        if (!(discussion.id in updatedDiscussions)) {
          updatedDiscussions[discussion.id] = {
            replyCount: discussion.reply_count ?? 0,
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
    bumpTopicReplySeen,
    initializeTopics,
    recordFeedVisit,
  }
}
