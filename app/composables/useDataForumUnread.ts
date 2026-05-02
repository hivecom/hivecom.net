import { useStorage } from '@vueuse/core'
import dayjs from 'dayjs'

interface TopicSeenState {
  /**
   * The most recent activity timestamp the user has acknowledged in this topic.
   * Set when: explicitly navigating to a topic, visiting a discussion directly,
   * or posting a reply. Uses the server's activity timestamp where available so
   * we don't overshoot and shadow concurrent activity from others.
   */
  seenActivityAt: string
}

interface DiscussionSeenState {
  /**
   * The reply count at the time the user last saw this discussion.
   * -1 is a sentinel meaning "this discussion exists in a known topic but the
   * user has never seen it" - used to correctly dot genuinely new discussions
   * in topics the user has previously visited.
   */
  seenReplyCount: number
}

interface ForumUnreadStorage {
  topics: Record<string, TopicSeenState>
  discussions: Record<string, DiscussionSeenState>
  feedVisitedAt: string | null
}

const STORAGE_KEY = 'forum-unread-v3'

/**
 * Composable for tracking "new posts" state on the forum index.
 *
 * Topics use seenActivityAt - the latest activity timestamp the user has
 * acknowledged. This advances when you navigate to a topic, visit a discussion
 * inside it, or post a reply - preventing false dots for your own activity
 * without shadowing concurrent activity from others.
 *
 * Discussions use seenReplyCount. A dot appears when reply_count > seenReplyCount.
 * New discussions in already-visited topics are seeded at -1 (never seen) so
 * they correctly show a dot. New discussions on first topic visit are seeded at
 * their current count to prevent a first-visit flood.
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
   * Returns true when a topic has activity after the user last acknowledged it.
   * Always returns false for topics not yet stored (first visit).
   */
  function isTopicNew(topicId: string, lastActivityAt: string | null): boolean {
    const seen = storage.value.topics[topicId]
    if (!seen)
      return false
    if (lastActivityAt == null || lastActivityAt === '')
      return false
    return dayjs(lastActivityAt).isAfter(dayjs(seen.seenActivityAt))
  }

  /**
   * When discussions for a topic are loaded, derive the topic dot from whether
   * any discussion is new. Falls back to the timestamp-based isTopicNew when
   * discussions haven't loaded yet (pre-load hint).
   *
   * This is the authoritative check once discussions are in hand - own activity
   * and direct visits correctly show no dot because the relevant discussion's
   * seenReplyCount is already up to date.
   */
  function isTopicNewWithDiscussions(
    topicId: string,
    lastActivityAt: string | null,
    discussions: Array<{ id: string, reply_count?: number | null }>,
    discussionsLoaded: boolean,
  ): boolean {
    if (discussionsLoaded) {
      return discussions.some(d => isDiscussionNew(d.id, d.reply_count ?? null))
    }
    return isTopicNew(topicId, lastActivityAt)
  }

  /**
   * Returns true when a discussion has more replies than when the user last saw it.
   * seenReplyCount of -1 means the discussion was never seen (new in a known topic).
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

  /**
   * Advance a topic's seenActivityAt to the given timestamp (or now if omitted).
   * Always takes the max of the current value and the new one so we never
   * accidentally roll back the watermark.
   *
   * Pass the server activity timestamp where available (e.g. discussion.last_activity_at)
   * rather than always using now - this avoids overshooting and masking concurrent
   * activity from other users that happened after the timestamp you actually saw.
   */
  function markTopicSeen(topicId: string, activityAt?: string) {
    const incoming = activityAt ?? new Date().toISOString()
    const current = storage.value.topics[topicId]?.seenActivityAt
    // Only write if the incoming value is newer than what we already have
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
   * Called after topics (with discussions) are fetched.
   *
   * - Topics not yet in storage: seeded as fully seen (first-visit flood prevention).
   * - Topics already in storage: new discussions get seenReplyCount = -1 (unseen)
   *   so they correctly show a dot. Existing discussions are left untouched.
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

      // A topic is "freshly seeded" if it was either just initialized above, or
      // was seeded by initializeTopicsOnly in the same session - detectable by
      // seenActivityAt matching last_activity_at exactly (our seeding convention).
      // In both cases, discussions should be seeded as seen (flood prevention).
      // Only topics genuinely visited before (seenActivityAt < last_activity_at)
      // should have new discussions seeded as -1 (unseen).
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
          seenActivityAt: topic.last_activity_at ?? new Date().toISOString(),
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
    isTopicNewWithDiscussions,
    isDiscussionNew,
    markTopicSeen,
    markDiscussionSeen,
    initializeTopics,
    initializeTopicsOnly,
    recordFeedVisit,
  }
}
