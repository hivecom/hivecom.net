-- Fix protect_reply_content_from_non_author and protect_reply_offtopic_field
-- trigger functions.
--
-- Problem:
--   Both functions call authorize(...) without the public. schema qualifier and
--   have no SET search_path, so they inherit the session search_path at call
--   time. PostgREST in production sets search_path = '', which means the
--   unqualified authorize() call cannot be resolved, producing:
--
--     ERROR 42883: function authorize(public.app_permission) does not exist
--
--   This surfaces when discussion_topic_id is changed on a discussion, because
--   sync_replies_is_forum_reply() fires and does:
--
--     UPDATE public.discussion_replies SET is_forum_reply = ...
--
--   ...which triggers every BEFORE UPDATE trigger on discussion_replies.
--   protect_reply_content_from_non_author always reaches the authorize() call
--   in this context because auth.uid() is NULL inside the SECURITY DEFINER
--   context of sync_replies_is_forum_reply (no JWT), so the author short-
--   circuit never fires.
--
-- Fix:
--   Add SET search_path TO '' and qualify all schema references explicitly.

CREATE OR REPLACE FUNCTION public.protect_reply_content_from_non_author()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  actor uuid;
  old_content jsonb;
  new_content jsonb;
BEGIN
  actor := auth.uid();

  -- Reply author can edit their own content freely
  IF actor = OLD.created_by THEN
    RETURN NEW;
  END IF;

  -- Admins / moderators can edit any reply content
  IF public.authorize('discussions.update'::public.app_permission) THEN
    RETURN NEW;
  END IF;

  -- Everyone else (e.g. discussion OP) may only change moderation fields.
  -- Compare the row minus moderation / audit / reaction / system columns.
  old_content := to_jsonb(OLD)
    - 'is_offtopic'
    - 'is_forum_reply'
    - 'reactions'
    - 'modified_at'
    - 'modified_by'
    - 'created_at'
    - 'created_by';

  new_content := to_jsonb(NEW)
    - 'is_offtopic'
    - 'is_forum_reply'
    - 'reactions'
    - 'modified_at'
    - 'modified_by'
    - 'created_at'
    - 'created_by';

  IF old_content IS DISTINCT FROM new_content THEN
    RAISE EXCEPTION 'You may only change moderation fields on replies you did not author';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.protect_reply_offtopic_field()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  discussion_author uuid;
BEGIN
  -- Nothing to guard if is_offtopic didn't change
  IF OLD.is_offtopic IS NOT DISTINCT FROM NEW.is_offtopic THEN
    RETURN NEW;
  END IF;

  -- Admins / moderators can always toggle
  IF public.authorize('discussions.update'::public.app_permission) THEN
    RETURN NEW;
  END IF;

  -- The discussion author (OP) can toggle on replies in their discussion
  SELECT d.created_by INTO discussion_author
  FROM public.discussions d
  WHERE d.id = NEW.discussion_id;

  IF auth.uid() = discussion_author THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Insufficient permissions to modify off-topic status on this reply';
END;
$$;
