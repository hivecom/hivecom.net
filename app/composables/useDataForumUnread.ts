import { useStorage } from '@vueuse/core'
import dayjs from 'dayjs'

interface TopicSeenState {
  /**
   * Latest activity the user has acknowledged. Uses the server's timestamp where
   * available so it doesn't overshoot and hide concurrent activity from others.
   */
  seenActivityAt: string
}

interface DiscussionSeenState {
  /** -1 means it's in a known topic but was never seen, so it gets a dot. */
  seenReplyCount: number
}

interface ForumUnreadStorage {
  topics: Record<string, TopicSeenState>
  discussions: Record<string, DiscussionSeenState>
  feedVisitedAt: string | null
}

const STORAGE_KEY = 'forum-unread-v3'

// New-post dots on the forum index. Topics compare activity timestamps,
// discussions compare reply counts.
export function useDataForumUnread() {
  const currentUserId = useUserId()

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

  // Always false for topics not stored yet (first visit).
  function isTopicNew(topicId: string, lastActivityAt: string | null): boolean {
    const seen = storage.value.topics[topicId]
    if (!seen)
      return false
    if (lastActivityAt == null || lastActivityAt === '')
      return false

    return dayjs(lastActivityAt).isAfter(dayjs(seen.seenActivityAt))
  }

  // Authoritative once discussions are loaded, since own activity and direct
  // visits already updated seenReplyCount. Falls back to isTopicNew before that.
  function isTopicNewWithDiscussions(
    topicId: string,
    lastActivityAt: string | null,
    discussions: Array<{ id: string, reply_count?: number | null, last_activity_by?: string | null }>,
    discussionsLoaded: boolean,
    lastActivityBy?: string | null,
  ): boolean {
    if (lastActivityBy != null && lastActivityBy === currentUserId.value)
      return false

    if (discussionsLoaded) {
      return discussions.some(d => isDiscussionNew(d.id, d.reply_count ?? null, d.last_activity_by))
    }
    return isTopicNew(topicId, lastActivityAt)
  }

  // Always false for discussions not stored yet.
  function isDiscussionNew(discussionId: string, replyCount: number | null, lastActivityBy?: string | null): boolean {
    if (lastActivityBy != null && lastActivityBy === currentUserId.value)
      return false

    const seen = storage.value.discussions[discussionId]
    if (!seen)
      return false
    if (replyCount == null)
      return false

    return replyCount > seen.seenReplyCount
  }

  /**
   * Only ever moves forward. Pass the server activity timestamp when there is
   * one: now can mask activity from others that landed after what you saw.
   */
  function markTopicSeen(topicId: string, activityAt?: string) {
    const incoming = activityAt ?? new Date().toISOString()
    const current = storage.value.topics[topicId]?.seenActivityAt

    if (current != null && !dayjs(incoming).isAfter(dayjs(current)))
      return

    storage.value = {
      ...storage.value,
      topics: {
        ...storage.value.topics,
        [topicId]: { seenActivityAt: incoming },
      },
    }
  }

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
   * Unstored topics seed as fully seen so a first visit isn't a flood of dots.
   * In stored topics, new discussions get -1 so they show a dot.
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
      const isNewTopic = !(topic.id in updatedTopics)

      if (isNewTopic) {
        updatedTopics[topic.id] = {
          seenActivityAt: topic.last_activity_at ?? new Date().toISOString(),
        }
        changed = true
      }

      // Seeding stores last_activity_at as seenActivityAt, so an exact match means
      // the topic was seeded this session and hasn't really been visited. Its
      // discussions seed as seen. Only visited topics seed new discussions at -1.
      const isFreshlySeeded = isNewTopic
        || updatedTopics[topic.id]?.seenActivityAt === (topic.last_activity_at ?? null)

      for (const discussion of topic.discussions) {
        if (!(discussion.id in updatedDiscussions)) {
          updatedDiscussions[discussion.id] = {
            seenReplyCount: isFreshlySeeded ? (discussion.reply_count ?? 0) : -1,
          }
          changed = true
        }
      }
    }

    if (changed) {
      storage.value = { ...storage.value, topics: updatedTopics, discussions: updatedDiscussions }
    }
  }

  // For topics loaded without their discussions.
  function initializeTopicsOnly(
    topics: Array<{ id: string, last_activity_at?: string | null }>,
  ) {
    const updatedTopics = { ...storage.value.topics }
    let changed = false

    for (const topic of topics) {
      if (!(topic.id in updatedTopics)) {
        updatedTopics[topic.id] = {
          seenActivityAt: topic.last_activity_at ?? new Date().toISOString(),
        }
        changed = true
      }
    }

    if (changed) {
      storage.value = { ...storage.value, topics: updatedTopics }
    }
  }

  // The watermark only advances after SESSION_GAP_MS. Otherwise navigating
  // around within one session shrinks "since last visit" down to seconds.
  const SESSION_GAP_MS = 30 * 60 * 1000

  function recordFeedVisit(): string | null {
    const previous = storage.value.feedVisitedAt
    const now = Date.now()
    const previousMs = previous != null ? new Date(previous).getTime() : null

    if (previousMs == null || now - previousMs >= SESSION_GAP_MS) {
      storage.value = { ...storage.value, feedVisitedAt: new Date(now).toISOString() }
      return previous
    }

    return previous
  }

  return {
    isTopicNew,
    isTopicNewWithDiscussions,
    isDiscussionNew,
    markTopicSeen,
    markDiscussionSeen,
    initializeTopics,
    initializeTopicsOnly,
    recordFeedVisit,
  }
}
