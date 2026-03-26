-- Add a trigger bypass for profile delete soft-delete cleanup.
--
-- This allows the system-triggered soft delete to update discussion replies
-- without being blocked by the non-author content protection trigger.

CREATE OR REPLACE FUNCTION public.soft_delete_replies_on_profile_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  -- Flag this transaction as a profile-delete cleanup so other triggers can allow it.
  PERFORM pg_catalog.set_config('app.profile_delete_active', 'true', true);

  UPDATE public.discussion_replies
  SET is_deleted = true,
      markdown = ''
  WHERE created_by = OLD.id
    AND is_deleted = false;

  RETURN OLD;
END;
$$;

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

  -- Allow system cleanup during profile deletion.
  IF pg_catalog.current_setting('app.profile_delete_active', true) = 'true' THEN
    RETURN NEW;
  END IF;

  -- Reply author can edit their own content freely.
  IF actor = OLD.created_by THEN
    RETURN NEW;
  END IF;

  -- Admins and moderators can edit any reply content.
  IF public.authorize('discussions.update'::public.app_permission) THEN
    RETURN NEW;
  END IF;

  -- Everyone else (e.g. discussion OP) may only change moderation fields.
  -- Compare the row minus moderation, audit, reaction, and system columns.
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
