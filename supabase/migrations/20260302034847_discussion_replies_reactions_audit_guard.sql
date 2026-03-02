-- Guard audit trigger for discussion_replies so that toggling a reaction does
-- not corrupt modified_at / modified_by on the reply row.
--
-- Problem:
-- - toggle_reaction() does a plain UPDATE … SET reactions = $1 on
--   discussion_replies.
-- - The generic update_audit_fields() trigger fires on every UPDATE and sets
--   modified_at = NOW() and modified_by = auth.uid() (the person who reacted,
--   not the author).
-- - This causes the "Latest updates" bar to show the reactor's avatar instead
--   of the reply author's avatar, and incorrectly refreshes modified_at.
--
-- Solution:
-- - Replace the generic trigger on discussion_replies with a table-specific
--   function (mirroring update_discussions_audit_fields() introduced in
--   20260301015257) that compares the row payload minus audit columns AND
--   minus reactions.  When only reactions changed, all audit fields are
--   preserved from OLD.
--
-- This is the same pattern already applied to discussions and discussion_topics
-- in migration 20260301015257_forum_last_activity_at.sql.

CREATE OR REPLACE FUNCTION public.update_discussion_replies_audit_fields()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
AS $function$
DECLARE
  actor       uuid;
  new_payload jsonb;
  old_payload jsonb;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    -- Strip columns that are allowed to change without touching audit fields:
    --   reactions   – toggled by any authenticated user via toggle_reaction()
    --   modified_at / modified_by / created_at / created_by – audit fields themselves
    new_payload := to_jsonb(NEW)
      - 'reactions'
      - 'modified_at'
      - 'modified_by'
      - 'created_at'
      - 'created_by';

    old_payload := to_jsonb(OLD)
      - 'reactions'
      - 'modified_at'
      - 'modified_by'
      - 'created_at'
      - 'created_by';

    -- If the only columns that changed are reactions (and/or the audit fields
    -- themselves), preserve all audit values from the previous state and return
    -- immediately – no audit bump.
    IF new_payload = old_payload THEN
      NEW.modified_at = OLD.modified_at;
      NEW.modified_by = OLD.modified_by;
      NEW.created_at  = OLD.created_at;
      NEW.created_by  = OLD.created_by;
      RETURN NEW;
    END IF;

    -- A meaningful content change happened – update audit fields normally.
    actor := auth.uid();

    NEW.modified_at = NOW();

    IF actor IS NOT NULL THEN
      NEW.modified_by = actor;
    ELSE
      -- Preserve the last known human editor when called without a user JWT
      -- (e.g. service_role from an edge function).
      NEW.modified_by = OLD.modified_by;
    END IF;

    NEW.created_at = OLD.created_at;
    NEW.created_by = OLD.created_by;
  END IF;

  RETURN NEW;
END;
$function$;

-- Swap out the generic trigger that was installed by 20260115184044.
DROP TRIGGER IF EXISTS update_discussion_replies_audit_fields ON public.discussion_replies;

CREATE TRIGGER update_discussion_replies_audit_fields
  BEFORE UPDATE ON public.discussion_replies
  FOR EACH ROW
  EXECUTE FUNCTION public.update_discussion_replies_audit_fields();
