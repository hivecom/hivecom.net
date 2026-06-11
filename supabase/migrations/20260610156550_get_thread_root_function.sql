-- Returns the ID of the topmost ancestor of a reply within a discussion.
-- Walks up the reply_to_id chain until it reaches a reply with no parent
-- (reply_to_id IS NULL), i.e. the root of the thread.
-- If the given reply_id is already a root, it returns itself.

CREATE OR REPLACE FUNCTION get_thread_root(p_reply_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  WITH RECURSIVE ancestors AS (
    SELECT id, reply_to_id
    FROM discussion_replies
    WHERE id = p_reply_id

    UNION ALL

    SELECT r.id, r.reply_to_id
    FROM discussion_replies r
    INNER JOIN ancestors a ON r.id = a.reply_to_id
  )
  SELECT id
  FROM ancestors
  WHERE reply_to_id IS NULL
  LIMIT 1;
$$;
