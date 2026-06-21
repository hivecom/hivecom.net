-- Composite index supporting cursor-based reply pagination.
--
-- The pagination RPCs (get_discussion_replies_page) and the deep-link cursor
-- RPC (get_discussion_reply_page_cursor) all filter discussion_replies by
-- discussion_id and ORDER BY (created_at, id). Before this index, the only
-- candidates were single-column indexes on discussion_id and created_at, plus a
-- partial (discussion_id, created_at DESC) WHERE is_deleted = false index. Since
-- the RPCs do NOT filter on is_deleted, that partial index can't be used, so the
-- cursor RPC's predecessor COUNT(*) and OFFSET pg*limit-1 scan ran O(N) per load.
--
-- A composite (discussion_id, created_at, id) index lets the planner satisfy both
-- the discussion_id equality filter and the (created_at, id) ordering from a
-- single index scan, in either direction (forum ascending / comment descending).

CREATE INDEX IF NOT EXISTS idx_discussion_replies_thread
  ON public.discussion_replies (discussion_id, created_at, id);

-- Partial variant for threaded-mode (root_only) pagination. The same RPCs add
-- "AND reply_to_id IS NULL" when paginating top-level replies only, and the full
-- index above can't be used efficiently for that predicate. This partial index
-- covers the root-only ordered scan and stays small (only top-level replies).
CREATE INDEX IF NOT EXISTS idx_discussion_replies_thread_roots
  ON public.discussion_replies (discussion_id, created_at, id)
  WHERE reply_to_id IS NULL;
