-- Returns total descendant count (all depths) per comment for a given discussion.
-- Used to show accurate reply counts on collapsed thread nodes.
CREATE OR REPLACE FUNCTION get_discussion_reply_counts(p_discussion_id uuid)
RETURNS TABLE(comment_id uuid, descendant_count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  WITH RECURSIVE ancestors AS (
    -- Base: each non-deleted reply paired with its direct parent.
    SELECT
      r.id        AS reply_id,
      r.reply_to_id AS ancestor_id
    FROM discussion_replies r
    WHERE r.discussion_id = p_discussion_id
      AND r.reply_to_id IS NOT NULL
      AND r.is_deleted = false

    UNION ALL

    -- Recurse: walk the ancestor chain upward.
    SELECT
      a.reply_id,
      r.reply_to_id AS ancestor_id
    FROM ancestors a
    JOIN discussion_replies r ON r.id = a.ancestor_id
    WHERE r.reply_to_id IS NOT NULL
      AND r.discussion_id = p_discussion_id
  )
  SELECT
    ancestor_id          AS comment_id,
    COUNT(reply_id)      AS descendant_count
  FROM ancestors
  GROUP BY ancestor_id
$$;
