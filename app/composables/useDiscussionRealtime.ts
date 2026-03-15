import type { RealtimeChannel, RealtimePostgresDeletePayload, RealtimePostgresInsertPayload, RealtimePostgresUpdatePayload } from '@supabase/supabase-js'
import type { RawComment } from '@/components/Discussions/Discussion.types'
import { useCacheDiscussion } from '@/composables/useCacheDiscussion'

/**
 * Manages the Supabase realtime channel for a discussion's replies.
 *
 * Handles INSERT (pending banner), UPDATE (edits, offtopic, soft-deletes),
 * and DELETE (hard deletes) events, patching the shared `comments` ref
 * in place so all consumers see live updates without polling.
 *
 * The channel is automatically torn down on scope dispose.
 */
export function useDiscussionRealtime(
  comments: Ref<RawComment[]>,
  discussion: Ref<{ id: string, slug: string | null } | undefined>,
  model: Ref<'comment' | 'forum'>,
) {
  const supabase = useSupabaseClient()
  const discussionCache = useCacheDiscussion()

  const pendingReplyCount = ref(0)
  const pendingLoading = ref(false)

  let replyChannel: RealtimeChannel | null = null
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

      // Invalidate the cache - reply_count has changed server-side.
      discussionCache.invalidate(discussion.value.id, discussion.value.slug)
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

          // If the reply was soft-deleted via UPDATE, strip it from the list
          // so the UI stays consistent with what deleteComment does locally.
          if (updated.is_deleted) {
            comments.value = comments.value.filter(c => c.id !== updated.id)
          }
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
        },
      )
      .subscribe()

    subscribedDiscussionId = discussionId
  }

  async function unsubscribe() {
    if (replyChannel == null)
      return
    try {
      await supabase.removeChannel(replyChannel)
    }
    finally {
      replyChannel = null
      subscribedDiscussionId = null
    }
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
