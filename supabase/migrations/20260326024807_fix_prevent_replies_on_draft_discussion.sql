-- Fix prevent_replies_on_draft_discussion trigger function.
--
-- Problem:
--   The function calls authorize(...) without the public. schema qualifier and
--   has no SET search_path, so it inherits the session search_path at call time.
--   PostgREST in production sets search_path = '', which means the unqualified
--   authorize() call cannot be resolved, producing:
--
--     ERROR 42883: function authorize(public.app_permission) does not exist
--
--   This surfaces specifically when discussion_topic_id is changed, because
--   sync_replies_is_forum_reply() fires and does:
--
--     UPDATE public.discussion_replies SET is_forum_reply = ...
--
--   ...which triggers prevent_replies_on_draft_discussion on each reply row.
--
-- Fix:
--   Add SET search_path TO '' and qualify all schema references explicitly.

CREATE OR REPLACE FUNCTION public.prevent_replies_on_draft_discussion()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.discussions d
    WHERE d.id = NEW.discussion_id
      AND d.is_draft = true
      AND (
        auth.uid() IS NULL
        OR (
          d.created_by != auth.uid()
          AND NOT public.authorize('discussions.update'::public.app_permission)
        )
      )
  ) THEN
    RAISE EXCEPTION 'Cannot add replies to draft discussions';
  END IF;

  RETURN NEW;
END;
$$;
