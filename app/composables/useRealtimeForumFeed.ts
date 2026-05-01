import type { RealtimeChannel, RealtimePostgresInsertPayload, RealtimePostgresUpdatePayload, SupabaseClient } from '@supabase/supabase-js'
import type { ActivityItem } from '@/composables/useForumActivityFeed'
import type { Tables } from '@/types/database.overrides'
import type { Database } from '@/types/database.types'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'

dayjs.extend(relativeTime)

// eslint-disable-next-line ts/no-explicit-any
type AnySupabase = SupabaseClient<any, any, any>

type ReplyRow = Tables<'discussion_replies'>
type DiscussionRow = Tables<'discussions'>
type TopicRow = Tables<'discussion_topics'>

export interface UseRealtimeForumFeedOptions {
  /** Called when a new reply arrives - prepend it to the carousel feed */
  onReply: (item: ActivityItem) => void
  /** Called when a new discussion arrives - prepend it to the carousel feed */
  onDiscussion: (item: ActivityItem) => void
  /** Emits count of incoming items not yet reflected in the sheet feed */
  onPendingSheet: (delta: number) => void
  /** Called when a topic's last_activity_at changes - used for unread dot updates */
  onTopicActivity?: (topicId: string, lastActivityAt: string) => void
  /** Current discussion lookup for resolving reply context labels */
  discussionLookup: Ref<Map<string, Tables<'discussions'>>>
  settings: Ref<{
    show_nsfw_content: boolean
    show_forum_archived: boolean
  }>
  visibleDiscussionIds: Ref<Set<string>>
  hiddenTopicIds: Ref<Set<string>>
}

/**
 * Subscribes to INSERT events on `discussion_replies` and `discussions` tables
 * and maps them into ActivityItems for the forum index feed.
 *
 * Channels are shared at module level and ref-counted. Only one instance of
 * the forum page exists at a time, but on fast back-navigation the previous
 * scope may not have finished tearing down when the new scope calls subscribe().
 * Using module-level singletons prevents the "cannot add postgres_changes
 * callbacks after subscribe()" error that occurs when supabase.channel()
 * returns an already-subscribed instance by name.
 */

// ---------------------------------------------------------------------------
// Module-level channel registry
// ---------------------------------------------------------------------------

interface SharedChannel<TPayload> {
  channel: RealtimeChannel
  refCount: number
  handlers: Set<(p: TPayload) => void>
}

type ReplyInsertPayload = RealtimePostgresInsertPayload<ReplyRow>
type DiscussionInsertPayload = RealtimePostgresInsertPayload<DiscussionRow>
type TopicUpdatePayload = RealtimePostgresUpdatePayload<TopicRow>

let replyChannel: SharedChannel<ReplyInsertPayload> | null = null
let discussionChannel: SharedChannel<DiscussionInsertPayload> | null = null
let topicActivityChannel: SharedChannel<TopicUpdatePayload> | null = null

function acquireReplyChannel(supabase: AnySupabase): SharedChannel<ReplyInsertPayload> {
  if (replyChannel) {
    replyChannel.refCount++
    return replyChannel
  }
  const handlers = new Set<(p: ReplyInsertPayload) => void>()
  const channel = supabase
    .channel('forum-feed:replies')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'discussion_replies' },
      (payload: ReplyInsertPayload) => handlers.forEach(h => h(payload)),
    )
    .subscribe()
  replyChannel = { channel, refCount: 1, handlers }
  return replyChannel
}

function releaseReplyChannel(supabase: AnySupabase) {
  if (!replyChannel)
    return
  replyChannel.refCount--
  if (replyChannel.refCount <= 0) {
    void supabase.removeChannel(replyChannel.channel)
    replyChannel = null
  }
}

function acquireDiscussionChannel(supabase: AnySupabase): SharedChannel<DiscussionInsertPayload> {
  if (discussionChannel) {
    discussionChannel.refCount++
    return discussionChannel
  }
  const handlers = new Set<(p: DiscussionInsertPayload) => void>()
  const channel = supabase
    .channel('forum-feed:discussions')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'discussions' },
      (payload: DiscussionInsertPayload) => handlers.forEach(h => h(payload)),
    )
    .subscribe()
  discussionChannel = { channel, refCount: 1, handlers }
  return discussionChannel
}

function releaseDiscussionChannel(supabase: AnySupabase) {
  if (!discussionChannel)
    return
  discussionChannel.refCount--
  if (discussionChannel.refCount <= 0) {
    void supabase.removeChannel(discussionChannel.channel)
    discussionChannel = null
  }
}

function acquireTopicActivityChannel(supabase: AnySupabase): SharedChannel<TopicUpdatePayload> {
  if (topicActivityChannel) {
    topicActivityChannel.refCount++
    return topicActivityChannel
  }
  const handlers = new Set<(p: TopicUpdatePayload) => void>()
  const channel = supabase
    .channel('forum-feed:topic-activity')
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'discussion_topics' },
      (payload: TopicUpdatePayload) => handlers.forEach(h => h(payload)),
    )
    .subscribe()
  topicActivityChannel = { channel, refCount: 1, handlers }
  return topicActivityChannel
}

function releaseTopicActivityChannel(supabase: AnySupabase) {
  if (!topicActivityChannel)
    return
  topicActivityChannel.refCount--
  if (topicActivityChannel.refCount <= 0) {
    void supabase.removeChannel(topicActivityChannel.channel)
    topicActivityChannel = null
  }
}

// ---------------------------------------------------------------------------
// Composable
// ---------------------------------------------------------------------------

export function useRealtimeForumFeed({
  onReply,
  onDiscussion,
  onTopicActivity,
  onPendingSheet,
  discussionLookup,
  settings,
  visibleDiscussionIds,
  hiddenTopicIds,
}: UseRealtimeForumFeedOptions) {
  const supabase = useSupabaseClient<Database>()

  let subscribed = false

  function mapReply(row: ReplyRow): ActivityItem | null {
    if (row.discussion_id == null)
      return null

    // Respect forum reply flag - the feed only shows forum-mode replies
    if (row.is_forum_reply === false)
      return null

    if (row.is_deleted)
      return null

    if (row.is_offtopic)
      return null

    if ((row.markdown ?? '').trim().length === 0)
      return null

    if (!settings.value.show_nsfw_content && row.is_nsfw)
      return null

    if (!visibleDiscussionIds.value.has(row.discussion_id))
      return null

    const discussion = discussionLookup.value.get(row.discussion_id)

    if (!settings.value.show_nsfw_content && discussion?.is_nsfw)
      return null

    return {
      id: row.id,
      type: 'Reply',
      icon: 'ph:chats-circle',
      title: 'Reply',
      description: row.markdown ?? undefined,
      timestamp: dayjs(row.created_at).fromNow(),
      timestampRaw: row.created_at,
      user: row.created_by ?? '',
      discussionId: row.discussion_id,
      href: `/forum/${discussion?.slug ?? row.discussion_id}?comment=${row.id}`,
      isNsfw: row.is_nsfw ?? false,
      isOfftopic: row.is_offtopic ?? false,
    }
  }

  function mapDiscussion(row: DiscussionRow): ActivityItem | null {
    if (!settings.value.show_nsfw_content && row.is_nsfw)
      return null

    if (row.is_draft)
      return null

    if (row.discussion_topic_id != null && hiddenTopicIds.value.has(row.discussion_topic_id))
      return null

    if (!settings.value.show_forum_archived && row.is_archived)
      return null

    return {
      id: row.id,
      type: 'Discussion',
      typeLabel: 'Created Discussion',
      title: row.title ?? 'Discussion',
      description: row.description ?? undefined,
      timestamp: dayjs(row.created_at).fromNow(),
      timestampRaw: row.created_at,
      user: row.created_by ?? '',
      icon: 'ph:scroll',
      isNsfw: row.is_nsfw ?? false,
      isOfftopic: false,
      href: `/forum/${row.slug ?? row.id}`,
    }
  }

  // Per-instance handler refs so we can remove exactly this instance's handler on unsubscribe.
  let replyHandler: ((p: ReplyInsertPayload) => void) | null = null
  let discussionHandler: ((p: DiscussionInsertPayload) => void) | null = null
  let topicActivityHandler: ((p: TopicUpdatePayload) => void) | null = null

  function subscribe() {
    if (subscribed)
      return
    subscribed = true

    replyHandler = (payload: ReplyInsertPayload) => {
      const item = mapReply(payload.new)
      if (item == null)
        return
      onReply(item)
      onPendingSheet(1)
      window.__hivecomActivitySignal?.()
    }
    const rc = acquireReplyChannel(supabase)
    rc.handlers.add(replyHandler)

    discussionHandler = (payload: DiscussionInsertPayload) => {
      const item = mapDiscussion(payload.new)
      if (item == null)
        return
      onDiscussion(item)
      onPendingSheet(1)
      window.__hivecomActivitySignal?.()
    }
    const dc = acquireDiscussionChannel(supabase)
    dc.handlers.add(discussionHandler)

    topicActivityHandler = (payload: TopicUpdatePayload) => {
      const row = payload.new
      if (row.last_activity_at != null) {
        onTopicActivity?.(row.id, row.last_activity_at)
      }
    }
    const tc = acquireTopicActivityChannel(supabase)
    tc.handlers.add(topicActivityHandler)
  }

  function unsubscribe() {
    if (!subscribed)
      return
    subscribed = false

    if (replyHandler) {
      replyChannel?.handlers.delete(replyHandler)
      replyHandler = null
      releaseReplyChannel(supabase)
    }
    if (discussionHandler) {
      discussionChannel?.handlers.delete(discussionHandler)
      discussionHandler = null
      releaseDiscussionChannel(supabase)
    }
    if (topicActivityHandler) {
      topicActivityChannel?.handlers.delete(topicActivityHandler)
      topicActivityHandler = null
      releaseTopicActivityChannel(supabase)
    }
  }

  onScopeDispose(unsubscribe)

  return {
    subscribe,
    unsubscribe,
  }
}
