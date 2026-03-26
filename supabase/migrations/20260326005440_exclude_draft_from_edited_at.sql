-- Migration: 20260324000000_exclude_draft_from_edited_at.sql
--
-- What: Adds an early-return guard inside update_discussions_audit_fields() so
--       that saving a discussion while it is still a draft (OLD.is_draft = TRUE
--       AND NEW.is_draft = TRUE) does NOT update modified_at / modified_by.
--
-- Why:  The "edited at" label that readers see after a discussion is published
--       is driven by modified_at.  Without this guard, every auto-save or
--       manual draft save was bumping modified_at, so the first thing readers
--       would see after publication was "edited N minutes ago" even though the
--       author had never touched the post once it went live.
--
--       Publishing (is_draft: TRUE → FALSE) still goes through the normal code
--       path and updates modified_at as expected.

CREATE OR REPLACE FUNCTION public.update_discussions_audit_fields()
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
    -- Draft re-saves must not corrupt the visible "edited at" timestamp.
    -- When a discussion is saved while still a draft (OLD.is_draft AND NEW.is_draft),
    -- preserve all audit fields so readers never see spurious "edited" labels
    -- once the discussion is eventually published.
    IF OLD.is_draft = TRUE AND NEW.is_draft = TRUE THEN
      NEW.modified_at = OLD.modified_at;
      NEW.modified_by = OLD.modified_by;
      NEW.created_at  = OLD.created_at;
      NEW.created_by  = OLD.created_by;
      RETURN NEW;
    END IF;

    new_payload := to_jsonb(NEW)
      - 'view_count'
      - 'last_activity_at'
      - 'reactions'
      - 'reply_count'
      - 'modified_at'
      - 'modified_by'
      - 'created_at'
      - 'created_by';

    old_payload := to_jsonb(OLD)
      - 'view_count'
      - 'last_activity_at'
      - 'reactions'
      - 'reply_count'
      - 'modified_at'
      - 'modified_by'
      - 'created_at'
      - 'created_by';

    IF new_payload = old_payload THEN
      NEW.modified_at = OLD.modified_at;
      NEW.modified_by = OLD.modified_by;
      NEW.created_at  = OLD.created_at;
      NEW.created_by  = OLD.created_by;
      RETURN NEW;
    END IF;

    actor := auth.uid();

    NEW.modified_at = NOW();

    IF actor IS NOT NULL THEN
      NEW.modified_by = actor;
    ELSE
      NEW.modified_by = OLD.modified_by;
    END IF;

    NEW.created_at = OLD.created_at;
    NEW.created_by = OLD.created_by;
  END IF;

  RETURN NEW;
END;
$function$;

-- Re-attach the trigger so it picks up the updated function body.
DROP TRIGGER IF EXISTS update_discussions_audit_fields ON public.discussions;

CREATE TRIGGER update_discussions_audit_fields
  BEFORE UPDATE ON public.discussions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_discussions_audit_fields();
