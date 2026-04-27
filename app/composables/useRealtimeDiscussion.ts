import type { RealtimeChannel, RealtimePostgresDeletePayload, RealtimePostgresInsertPayload, RealtimePostgresUpdatePayload, SupabaseClient } from '@supabase/supabase-js'
import type { RawComment } from '@/components/Discussions/Discussion.types'
import type { Tables } from '@/types/database.overrides'
import { useDiscussionCache } from '@/composables/useDiscussionCache'
import { useDiscussionRepliesCache } from '@/composables/useDiscussionRepliesCache'

/**
 * Manages Supabase realtime channels for a discussion's replies and the
 * discussion row itself.
 *
 * Channels are shared at module level and ref-counted. Multiple Discussion
 * components on the same page (e.g. per-choice threads + general chat on the
 * votes detail page) all use the same underlying Supabase channel. Each
 * instance registers its own JS-side handler; the channel is only torn down
 * when the last subscriber releases it.
 *
 * This prevents "cannot add postgres_changes callbacks after subscribe()"
 * which occurs when supabase.channel() returns an already-subscribed instance
 * by name and a second caller tries to call .on() on it.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

// eslint-disable-next-line ts/no-explicit-any
type AnySupabase = SupabaseClient<any, any, any>

type InsertPayload = RealtimePostgresInsertPayload<RawComment>
type UpdateReplyPayload = RealtimePostgresUpdatePayload<RawComment>
type DeletePayload = RealtimePostgresDeletePayload<RawComment>
type UpdateDiscussionPayload = RealtimePostgresUpdatePayload<Tables<'discussions'>>

interface SharedReplyChannel {
  channel: RealtimeChannel
  refCount: number
  insertHandlers: Set<(p: InsertPayload) => void>
  updateHandlers: Set<(p: UpdateReplyPayload) => void>
  deleteHandlers: Set<(p: DeletePayload) => void>
}

interface SharedDiscussionChannel {
  channel: RealtimeChannel
  refCount: number
  updateHandlers: Set<(p: UpdateDiscussionPayload) => void>
}

// ---------------------------------------------------------------------------
// Module-level registry - one channel per discussion ID, shared across all
// composable instances that subscribe to the same discussion.
// ---------------------------------------------------------------------------

const replyChannels = new Map<string, SharedReplyChannel>()
const discussionChannels = new Map<string, SharedDiscussionChannel>()

function acquireReplyChannel(supabase: AnySupabase, discussionId: string): SharedReplyChannel {
  const existing = replyChannels.get(discussionId)
  if (existing) {
    existing.refCount++
    return existing
  }

  const insertHandlers = new Set<(p: InsertPayload) => void>()
  const updateHandlers = new Set<(p: UpdateReplyPayload) => void>()
  const deleteHandlers = new Set<(p: DeletePayload) => void>()

  const channel = supabase
    .channel(`discussion-replies:${discussionId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'discussion_replies', filter: `discussion_id=eq.${discussionId}` },
      (payload: InsertPayload) => insertHandlers.forEach(h => h(payload)),
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'discussion_replies', filter: `discussion_id=eq.${discussionId}` },
      (payload: UpdateReplyPayload) => updateHandlers.forEach(h => h(payload)),
    )
    .on(
      'postgres_changes',
      { event: 'DELETE', schema: 'public', table: 'discussion_replies', filter: `discussion_id=eq.${discussionId}` },
      (payload: DeletePayload) => deleteHandlers.forEach(h => h(payload)),
    )
    .subscribe()

  const entry: SharedReplyChannel = { channel, refCount: 1, insertHandlers, updateHandlers, deleteHandlers }
  replyChannels.set(discussionId, entry)
  return entry
}

function releaseReplyChannel(supabase: AnySupabase, discussionId: string) {
  const entry = replyChannels.get(discussionId)
  if (!entry)
    return
  entry.refCount--
  if (entry.refCount <= 0) {
    replyChannels.delete(discussionId)
    void supabase.removeChannel(entry.channel)
  }
}

function acquireDiscussionChannel(supabase: AnySupabase, discussionId: string): SharedDiscussionChannel {
  const existing = discussionChannels.get(discussionId)
  if (existing) {
    existing.refCount++
    return existing
  }

  const updateHandlers = new Set<(p: UpdateDiscussionPayload) => void>()

  const channel = supabase
    .channel(`discussion:${discussionId}`)
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'discussions', filter: `id=eq.${discussionId}` },
      (payload: UpdateDiscussionPayload) => updateHandlers.forEach(h => h(payload)),
    )
    .subscribe()

  const entry: SharedDiscussionChannel = { channel, refCount: 1, updateHandlers }
  discussionChannels.set(discussionId, entry)
  return entry
}

function releaseDiscussionChannel(supabase: AnySupabase, discussionId: string) {
  const entry = discussionChannels.get(discussionId)
  if (!entry)
    return
  entry.refCount--
  if (entry.refCount <= 0) {
    discussionChannels.delete(discussionId)
    void supabase.removeChannel(entry.channel)
  }
}

// ---------------------------------------------------------------------------
// Composable
// ---------------------------------------------------------------------------

export function useRealtimeDiscussion(
  comments: Ref<RawComment[]>,
  discussion: Ref<{ id: string, slug: string | null } | undefined>,
  model: Ref<'comment' | 'forum'>,
  hash?: string,
) {
  const supabase = useSupabaseClient()
  const discussionCache = useDiscussionCache()
  const repliesCache = useDiscussionRepliesCache()

  const pendingReplyCount = ref(0)
  const pendingLoading = ref(false)

  // Track which discussion this instance is currently subscribed to, and
  // the exact handler functions registered so we can remove only ours.
  let subscribedDiscussionId: string | null = null
  let myInsertHandler: ((p: InsertPayload) => void) | null = null
  let myUpdateReplyHandler: ((p: UpdateReplyPayload) => void) | null = null
  let myDeleteHandler: ((p: DeletePayload) => void) | null = null
  let myUpdateDiscussionHandler: ((p: UpdateDiscussionPayload) => void) | null = null

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

      if (latestCommentTime.value != null)
        query.gt('created_at', latestCommentTime.value)

      if (hash != null)
        query.eq('meta->>hash', hash)

      const { data, error: fetchError } = await query

      if (fetchError != null || data == null)
        return

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
    // No-op if already subscribed to this exact discussion.
    if (subscribedDiscussionId === discussionId)
      return

    // Drop any previous subscription first.
    unsubscribe()

    myInsertHandler = (payload: InsertPayload) => {
      const newReply = payload.new
      // Skip replies already present - covers optimistic inserts from this tab.
      if (comments.value.some(c => c.id === newReply.id))
        return

      // When a hash filter is active only count replies for this section.
      const replyHash = (newReply.meta as Record<string, unknown> | null)?.hash as string | undefined
      if (hash != null && replyHash !== hash)
        return

      repliesCache.invalidate(discussionId)
      pendingReplyCount.value++
    }

    myUpdateReplyHandler = (payload: UpdateReplyPayload) => {
      const updated = payload.new
      const idx = comments.value.findIndex(c => c.id === updated.id)
      if (idx === -1)
        return
      comments.value[idx] = updated
      repliesCache.legacySet(discussionId, comments.value, model.value !== 'comment')
    }

    myDeleteHandler = (payload: DeletePayload) => {
      const deletedId = payload.old.id
      comments.value = comments.value.filter(c => c.id !== deletedId)
      repliesCache.legacySet(discussionId, comments.value, model.value !== 'comment')
    }

    myUpdateDiscussionHandler = (payload: UpdateDiscussionPayload) => {
      const updated = payload.new
      if (discussion.value != null)
        discussion.value = { ...discussion.value, ...updated }
      discussionCache.set(updated)
    }

    const replyEntry = acquireReplyChannel(supabase, discussionId)
    replyEntry.insertHandlers.add(myInsertHandler)
    replyEntry.updateHandlers.add(myUpdateReplyHandler)
    replyEntry.deleteHandlers.add(myDeleteHandler)

    const discEntry = acquireDiscussionChannel(supabase, discussionId)
    discEntry.updateHandlers.add(myUpdateDiscussionHandler)

    subscribedDiscussionId = discussionId
  }

  function unsubscribe() {
    if (subscribedDiscussionId == null)
      return

    const discussionId = subscribedDiscussionId

    const replyEntry = replyChannels.get(discussionId)
    if (replyEntry) {
      if (myInsertHandler)
        replyEntry.insertHandlers.delete(myInsertHandler)
      if (myUpdateReplyHandler)
        replyEntry.updateHandlers.delete(myUpdateReplyHandler)
      if (myDeleteHandler)
        replyEntry.deleteHandlers.delete(myDeleteHandler)
      releaseReplyChannel(supabase, discussionId)
    }

    const discEntry = discussionChannels.get(discussionId)
    if (discEntry && myUpdateDiscussionHandler) {
      discEntry.updateHandlers.delete(myUpdateDiscussionHandler)
      releaseDiscussionChannel(supabase, discussionId)
    }

    myInsertHandler = null
    myUpdateReplyHandler = null
    myDeleteHandler = null
    myUpdateDiscussionHandler = null
    subscribedDiscussionId = null
  }

  onScopeDispose(unsubscribe)

  return {
    pendingReplyCount,
    pendingLoading,
    subscribe,
    unsubscribe,
    loadPendingReplies,
  }
}
