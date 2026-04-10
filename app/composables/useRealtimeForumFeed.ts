import type { RealtimeChannel, RealtimePostgresInsertPayload } from '@supabase/supabase-js'
import type { ActivityItem } from '@/composables/useForumActivityFeed'
import type { Tables } from '@/types/database.overrides'
import type { Database } from '@/types/database.types'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'

dayjs.extend(relativeTime)

type ReplyRow = Tables<'discussion_replies'>
type DiscussionRow = Tables<'discussions'>

export interface UseRealtimeForumFeedOptions {
  /** Called when a new reply arrives - prepend it to the carousel feed */
  onReply: (item: ActivityItem) => void
  /** Called when a new discussion arrives - prepend it to the carousel feed */
  onDiscussion: (item: ActivityItem) => void
  /** Emits count of incoming items not yet reflected in the sheet feed */
  onPendingSheet: (delta: number) => void
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
 * Carousel items are pushed immediately via `onReply`/`onDiscussion`.
 * The sheet feed tracks a pending count via `onPendingSheet` - the caller
 * decides when to reload (e.g. user clicks a "N new" banner).
 */
export function useRealtimeForumFeed({
  onReply,
  onDiscussion,
  onPendingSheet,
  discussionLookup,
  settings,
  visibleDiscussionIds,
  hiddenTopicIds,
}: UseRealtimeForumFeedOptions) {
  const supabase = useSupabaseClient<Database>()

  let replyChannel: RealtimeChannel | null = null
  let discussionChannel: RealtimeChannel | null = null

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

  function subscribe() {
    if (replyChannel != null || discussionChannel != null)
      return

    replyChannel = supabase
      .channel('forum-feed:replies')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'discussion_replies',
        },
        (payload: RealtimePostgresInsertPayload<ReplyRow>) => {
          const item = mapReply(payload.new)
          if (item == null)
            return
          onReply(item)
          onPendingSheet(1)
        },
      )
      .subscribe()

    discussionChannel = supabase
      .channel('forum-feed:discussions')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'discussions',
        },
        (payload: RealtimePostgresInsertPayload<DiscussionRow>) => {
          const item = mapDiscussion(payload.new)
          if (item == null)
            return
          onDiscussion(item)
          onPendingSheet(1)
        },
      )
      .subscribe()
  }

  function unsubscribe() {
    if (replyChannel != null) {
      void supabase.removeChannel(replyChannel)
      replyChannel = null
    }
    if (discussionChannel != null) {
      void supabase.removeChannel(discussionChannel)
      discussionChannel = null
    }
  }

  onScopeDispose(unsubscribe)

  return {
    subscribe,
    unsubscribe,
  }
}
