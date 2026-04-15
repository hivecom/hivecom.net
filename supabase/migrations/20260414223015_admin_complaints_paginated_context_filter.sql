-- Migration: admin_complaints_paginated_context_filter
-- Adds a p_context filter parameter to get_admin_complaints_paginated.
-- Context values: 'user', 'gameserver', 'discussion', 'reply'

DROP FUNCTION IF EXISTS public.get_admin_complaints_paginated(text, text[], integer, integer);

CREATE OR REPLACE FUNCTION public.get_admin_complaints_paginated(
  p_search    text     DEFAULT '',
  p_status    text[]   DEFAULT '{}',
  p_context   text[]   DEFAULT '{}',
  p_limit     integer  DEFAULT 10,
  p_offset    integer  DEFAULT 0
)
RETURNS TABLE(
  id                       bigint,
  created_at               timestamp with time zone,
  created_by               uuid,
  message                  text,
  acknowledged             boolean,
  responded_at             timestamp with time zone,
  responded_by             uuid,
  response                 text,
  context_user             uuid,
  context_gameserver       bigint,
  context_discussion       uuid,
  context_discussion_reply uuid,
  total_count              bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  has_access boolean;
BEGIN
  has_access := public.has_permission('complaints.read'::public.app_permission);

  IF NOT has_access THEN
    RAISE EXCEPTION 'Insufficient permissions to view admin complaints';
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT
      c.id,
      c.created_at,
      c.created_by,
      c.message,
      c.acknowledged,
      c.responded_at,
      c.responded_by,
      c.response,
      c.context_user,
      c.context_gameserver,
      c.context_discussion,
      c.context_discussion_reply
    FROM public.complaints AS c
    WHERE
      -- Search filter: message text
      (
        p_search = ''
        OR c.message ILIKE '%' || p_search || '%'
      )
      -- Status filter (OR across selected statuses; empty = all)
      AND (
        array_length(p_status, 1) IS NULL
        OR (
          ('new'          = ANY(p_status) AND c.acknowledged = false AND c.response IS NULL)
          OR ('acknowledged' = ANY(p_status) AND c.acknowledged = true  AND c.response IS NULL)
          OR ('responded'    = ANY(p_status) AND c.response IS NOT NULL)
        )
      )
      -- Context filter (OR across selected contexts; empty = all)
      AND (
        array_length(p_context, 1) IS NULL
        OR (
          ('user'       = ANY(p_context) AND c.context_user             IS NOT NULL)
          OR ('gameserver' = ANY(p_context) AND c.context_gameserver      IS NOT NULL)
          OR ('discussion' = ANY(p_context) AND c.context_discussion      IS NOT NULL
                                            AND c.context_discussion_reply IS NULL)
          OR ('reply'      = ANY(p_context) AND c.context_discussion_reply IS NOT NULL)
        )
      )
  )
  SELECT
    b.id,
    b.created_at,
    b.created_by,
    b.message,
    b.acknowledged,
    b.responded_at,
    b.responded_by,
    b.response,
    b.context_user,
    b.context_gameserver,
    b.context_discussion,
    b.context_discussion_reply,
    COUNT(*) OVER ()                                                    AS total_count
  FROM base AS b
  ORDER BY b.created_at DESC
  LIMIT  p_limit
  OFFSET p_offset;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_admin_complaints_paginated(text, text[], text[], integer, integer) TO authenticated;
