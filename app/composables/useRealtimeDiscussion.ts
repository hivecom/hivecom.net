import type { RealtimeChannel, RealtimePostgresDeletePayload, RealtimePostgresInsertPayload, RealtimePostgresUpdatePayload } from '@supabase/supabase-js'
import type { RawComment } from '@/components/Discussions/Discussion.types'
import type { Tables } from '@/types/database.overrides'
import { useDiscussionCache } from '@/composables/useDiscussionCache'
import { useDiscussionRepliesCache } from '@/composables/useDiscussionRepliesCache'

/**
 * Manages the Supabase realtime channel for a discussion's replies and the
 * discussion row itself.
 *
 * Handles reply INSERT (pending banner), UPDATE (edits, offtopic, soft-deletes),
 * and DELETE (hard deletes) events, patching the shared `comments` ref in place.
 * Also subscribes to UPDATE events on the `discussions` row for reaction and
 * metadata sync (lock, archive, title, etc.).
 *
 * The channels are automatically torn down on scope dispose.
 */
export function useRealtimeDiscussion(
  comments: Ref<RawComment[]>,
  discussion: Ref<{ id: string, slug: string | null } | undefined>,
  model: Ref<'comment' | 'forum'>,
) {
  const supabase = useSupabaseClient()
  const discussionCache = useDiscussionCache()
  const repliesCache = useDiscussionRepliesCache()

  const pendingReplyCount = ref(0)
  const pendingLoading = ref(false)

  let replyChannel: RealtimeChannel | null = null
  let discussionChannel: RealtimeChannel | null = null
  let subscribedDiscussionId: string | null = null

  /**
   * The `created_at` timestamp of the most recently loaded reply, used to
   * fetch only replies that arrived after the current set.
   */
  const latestCommentTime = computed((): string | null => {
    if (comments.value.length === 0)
      return null
    const first: string = (comments.value[0] as RawComment).created_at
    return comments.value.reduce((latest: string, c: RawComment) =>
      c.created_at > latest ? c.created_at : latest, first)
  })

  async function loadPendingReplies() {
    if (!discussion.value || pendingLoading.value)
      return

    pendingLoading.value = true

    try {
      const query = supabase
        .from('discussion_replies')
        .select('*')
        .eq('discussion_id', discussion.value.id)
        .eq('is_deleted', false)
        .order('created_at', { ascending: model.value !== 'comment' })

      if (latestCommentTime.value != null) {
        query.gt('created_at', latestCommentTime.value)
      }

      const { data, error: fetchError } = await query

      if (fetchError != null || data == null)
        return

      // Filter out any IDs already in the local list (e.g. own posts pushed
      // optimistically by submitReply) to avoid duplicates.
      const existingIds = new Set(comments.value.map(c => c.id))
      const newReplies = (data as RawComment[]).filter(r => !existingIds.has(r.id))

      if (model.value === 'comment')
        comments.value = [...newReplies, ...comments.value]
      else
        comments.value = [...comments.value, ...newReplies]

      pendingReplyCount.value = 0

      // Invalidate both caches - reply_count has changed server-side and the
      // replies list is now stale (we just extended it above).
      discussionCache.invalidate(discussion.value.id, discussion.value.slug)
      repliesCache.legacySet(discussion.value.id, comments.value, model.value !== 'comment')
    }
    finally {
      pendingLoading.value = false
    }
  }

  function subscribe(discussionId: string) {
    // No-op if already subscribed to this discussion - avoids redundant channel
    // recreation when the watch fires without the id actually changing.
    if (replyChannel != null && subscribedDiscussionId === discussionId)
      return

    void unsubscribe()

    replyChannel = supabase
      .channel(`discussion-replies:${discussionId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'discussion_replies',
          filter: `discussion_id=eq.${discussionId}`,
        },
        (payload: RealtimePostgresInsertPayload<RawComment>) => {
          const newReply = payload.new
          // Skip replies already present in the local list - this covers the
          // case where submitReply pushed the reply optimistically in this tab.
          // We cannot skip by author ID because the same user may have the
          // thread open in another tab, where the optimistic push didn't happen.
          const alreadyLoaded = comments.value.some(c => c.id === newReply.id)
          if (alreadyLoaded)
            return

          // Invalidate the replies cache - the list is now stale.
          repliesCache.invalidate(discussionId)
          pendingReplyCount.value++
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'discussion_replies',
          filter: `discussion_id=eq.${discussionId}`,
        },
        (payload: RealtimePostgresUpdatePayload<RawComment>) => {
          const updated = payload.new
          const idx = comments.value.findIndex(c => c.id === updated.id)
          if (idx === -1)
            return

          // Patch in place - reactive so the template updates automatically.
          // This covers edits (markdown, is_nsfw), soft deletes (is_deleted),
          // and offtopic toggles (is_offtopic, and cascaded descendants).
          comments.value[idx] = updated

          // Keep the replies cache in sync with the patched list.
          repliesCache.legacySet(discussionId, comments.value, model.value !== 'comment')
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'discussion_replies',
          filter: `discussion_id=eq.${discussionId}`,
        },
        (payload: RealtimePostgresDeletePayload<RawComment>) => {
          const deletedId = payload.old.id
          comments.value = comments.value.filter(c => c.id !== deletedId)

          // Keep the replies cache in sync with the pruned list.
          repliesCache.legacySet(discussionId, comments.value, model.value !== 'comment')
        },
      )
      .subscribe()

    // Subscribe to the discussions table for this discussion - picks up
    // reactions, title/markdown edits, lock/archive/sticky status changes,
    // and reply_count bumps from other sessions. Patching the discussion ref
    // in place keeps the forum/[id].vue Reactions component and toolbar in sync
    // without a full page reload, and also updates useDiscussionCache so that
    // any other component reading the same cache key sees the fresh data.
    discussionChannel = supabase
      .channel(`discussion:${discussionId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'discussions',
          filter: `id=eq.${discussionId}`,
        },
        (payload: RealtimePostgresUpdatePayload<Tables<'discussions'>>) => {
          const updated = payload.new

          // Patch the local discussion ref in place.
          if (discussion.value != null) {
            discussion.value = { ...discussion.value, ...updated }
          }

          // Update the discussion cache so back-navigation gets the fresh row.
          discussionCache.set(updated)
        },
      )
      .subscribe()

    subscribedDiscussionId = discussionId
  }

  async function unsubscribe() {
    const channels: Promise<void>[] = []

    if (replyChannel != null) {
      const ch = replyChannel
      replyChannel = null
      channels.push(supabase.removeChannel(ch).then(() => undefined))
    }

    if (discussionChannel != null) {
      const ch = discussionChannel
      discussionChannel = null
      channels.push(supabase.removeChannel(ch).then(() => undefined))
    }

    subscribedDiscussionId = null

    await Promise.allSettled(channels)
  }

  onScopeDispose(() => {
    void unsubscribe()
  })

  return {
    pendingReplyCount,
    pendingLoading,
    subscribe,
    unsubscribe,
    loadPendingReplies,
  }
}
