import { useStorage } from '@vueuse/core'
import dayjs from 'dayjs'

interface TopicSeenState {
  lastVisitedAt: string
}

interface DiscussionSeenState {
  lastVisitedAt: string
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
 * Uses localStorage to record the last-visited timestamp per topic and per
 * discussion. On first encounter the current activity timestamp is stored as
 * "seen" so we don't flood the UI with dots on first visit. Subsequent visits
 * compare the live last_activity_at to the stored timestamp and surface a dot
 * indicator whenever activity has occurred since the last visit.
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
   * Returns true when a discussion has activity after the user last visited it.
   * Always returns false for discussions not yet stored.
   */
  function isDiscussionNew(discussionId: string, lastActivityAt: string | null): boolean {
    const seen = storage.value.discussions[discussionId]
    if (!seen)
      return false
    if (lastActivityAt == null || lastActivityAt === '')
      return false
    return dayjs(lastActivityAt).isAfter(dayjs(seen.lastVisitedAt))
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

  /** Record the current time for a discussion as "seen". */
  function markDiscussionSeen(discussionId: string) {
    storage.value = {
      ...storage.value,
      discussions: {
        ...storage.value.discussions,
        [discussionId]: {
          lastVisitedAt: new Date().toISOString(),
        },
      },
    }
  }

  /**
   * Called once after topics (with discussions) are fetched. Any topic or
   * discussion not yet in storage is seeded with its current last_activity_at
   * so only activity occurring after first encounter triggers a dot.
   */
  function initializeTopics(
    topics: Array<{
      id: string
      last_activity_at?: string | null
      discussions: Array<{ id: string, last_activity_at?: string | null }>
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
            lastVisitedAt: discussion.last_activity_at ?? new Date().toISOString(),
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
