import type { Comment, RawComment, ThreadNode } from '@/components/Discussions/Discussion.types'
import type { Tables } from '@/types/database.overrides'
import { useCacheDiscussion } from '@/composables/useCacheDiscussion'

/**
 * Manages all comment data for a discussion: fetching, modelling into the
 * flat/threaded structures, off-topic toggling, deletion, and the seen-marker.
 *
 * Returns reactive state and actions that Discussion.vue wires up via provide()
 * so descendant components can consume them through DISCUSSION_KEYS.
 */
export function useDiscussionComments(
  props: {
    id: string
    type: string
    model: 'comment' | 'forum'
    hash?: string
  },
  comments: Ref<RawComment[]>,
  discussion: Ref<Tables<'discussions'> | undefined>,
  userId: Ref<string | null | undefined>,
  onLoaded: (discussionId: string) => void,
  onDeleted?: (id: string) => void,
) {
  const supabase = useSupabaseClient()
  const discussionCache = useCacheDiscussion()

  const loading = ref(false)
  const error = ref<string>()

  // ── Data loading ────────────────────────────────────────────────────────────

  watch(
    () => props.id,
    async () => {
      loading.value = true

      let fetchedDiscussion: Tables<'discussions'> | null = null
      let fetchError: string | null = null

      if (props.type === 'discussion') {
        fetchedDiscussion = await discussionCache.fetchById(props.id)
        fetchError = discussionCache.error.value
      }
      else {
        fetchedDiscussion = await discussionCache.fetchByEntity(props.type, props.id)
        fetchError = discussionCache.error.value
      }

      if (fetchError != null) {
        loading.value = false
        error.value = fetchError
        return
      }

      if (fetchedDiscussion == null) {
        loading.value = false
        comments.value = []
        return
      }

      discussion.value = fetchedDiscussion

      void markDiscussionSeen(fetchedDiscussion.id)

      const commentQuery = supabase
        .from('discussion_replies')
        .select('*')
        .eq('discussion_id', fetchedDiscussion.id)

      if (props.hash != null) {
        commentQuery.eq('meta->>hash', props.hash)
      }

      const commentsResponse = await commentQuery.order('created_at', { ascending: props.model !== 'comment' })

      if (commentsResponse.error) {
        loading.value = false
        error.value = commentsResponse.error.message
        return
      }

      comments.value = commentsResponse.data as RawComment[]
      loading.value = false

      onLoaded(fetchedDiscussion.id)
    },
    { immediate: true },
  )

  // ── Seen marker ─────────────────────────────────────────────────────────────

  /**
   * Bump `last_seen_at` on the user's subscription (if any) and mark the
   * corresponding discussion-reply notification as read so the badge clears.
   *
   * Fire-and-forget - failures here should never block the discussion from
   * rendering.
   */
  async function markDiscussionSeen(discussionId: string) {
    if (userId.value == null)
      return

    await Promise.allSettled([
      supabase
        .from('discussion_subscriptions')
        .update({ last_seen_at: new Date().toISOString() })
        .eq('user_id', userId.value)
        .eq('discussion_id', discussionId),

      supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('user_id', userId.value)
        .eq('source', 'discussion_reply')
        .eq('source_id', discussionId)
        .eq('is_read', false),
    ])
  }

  // ── Comment modelling ───────────────────────────────────────────────────────

  /**
   * Flat list of comments with their `reply` object resolved.
   */
  const modelledComments = computed((): Comment[] => {
    const data = comments.value ?? []

    const lookup = new Map<string | number, RawComment>(
      data.map(item => [item.id, item]),
    )

    return data.map((item): Comment => {
      const foundReply = item.reply_to_id != null
        ? lookup.get(item.reply_to_id)
        : null

      return {
        ...item,
        reply: foundReply ?? null,
      }
    })
  })

  /**
   * Build a node map from the flat `modelledComments` list.
   * Maps comment.id → ThreadNode (comment + direct children).
   * Used both for threaded view roots and for flat-mode inline previews.
   */
  const threadNodeMap = computed((): Map<string, ThreadNode> => {
    const data = modelledComments.value
    const lookup = new Map<string, Comment>(data.map(c => [c.id, c]))
    const nodeMap = new Map<string, ThreadNode>(
      data.map(c => [c.id, { comment: c, children: [] }]),
    )

    for (const comment of data) {
      if (comment.reply_to_id != null && lookup.has(comment.reply_to_id)) {
        nodeMap.get(comment.reply_to_id)!.children.push(nodeMap.get(comment.id)!)
      }
    }

    return nodeMap
  })

  /**
   * Top-level thread roots for threaded view - only comments that are not a
   * child of another comment in this discussion. Orphaned replies (parent
   * deleted) are also treated as roots so nothing is silently hidden.
   */
  const threadRoots = computed((): ThreadNode[] => {
    const data = modelledComments.value
    const lookup = new Map<string, Comment>(data.map(c => [c.id, c]))
    return data
      .filter(c => c.reply_to_id == null || !lookup.has(c.reply_to_id))
      .map(c => threadNodeMap.value.get(c.id)!)
  })

  // ── Off-topic ───────────────────────────────────────────────────────────────

  async function toggleOfftopic(comment: Comment) {
    const nextValue = !comment.is_offtopic

    const { error: updateError } = await supabase
      .from('discussion_replies')
      .update({ is_offtopic: nextValue })
      .eq('id', comment.id)

    if (updateError)
      return

    // Optimistically cascade in the local list: mark all descendants too.
    const descendantIds = collectDescendantIds(comment.id)
    for (const c of comments.value) {
      if (c.id === comment.id || descendantIds.has(c.id)) {
        c.is_offtopic = nextValue
      }
    }
  }

  /** Collect all ids that are descendants of `parentId` in the flat list. */
  function collectDescendantIds(parentId: string): Set<string> {
    const result = new Set<string>()
    const queue = [parentId]
    while (queue.length > 0) {
      const current = queue.shift()!
      for (const c of comments.value) {
        if (c.reply_to_id === current) {
          result.add(c.id)
          queue.push(c.id)
        }
      }
    }
    return result
  }

  // ── Deletion ────────────────────────────────────────────────────────────────

  async function deleteComment(id: string): Promise<void> {
    const res = await supabase
      .from('discussion_replies')
      .delete()
      .eq('id', id)

    if (res.error) {
      throw new Error(res.error.message)
    }

    comments.value = comments.value.filter(c => c.id !== id)
    onDeleted?.(id)
  }

  const offtopicCount = computed(() =>
    comments.value.filter(c => c.is_offtopic).length,
  )

  return {
    loading,
    error,
    modelledComments,
    threadNodeMap,
    threadRoots,
    toggleOfftopic,
    deleteComment,
    offtopicCount,
  }
}
