-- Allow profile delete cleanup to null discussion created_by.

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
    -- Profile delete cleanup should not block created_by nulling.
    IF pg_catalog.current_setting('app.profile_delete_active', true) = 'true' THEN
      NEW.modified_at = OLD.modified_at;
      NEW.modified_by = OLD.modified_by;
      NEW.created_at  = OLD.created_at;

      -- Allow FK-driven nulling of created_by only.
      IF NOT (NEW.created_by IS NULL AND OLD.created_by IS NOT NULL) THEN
        NEW.created_by = OLD.created_by;
      END IF;

      RETURN NEW;
    END IF;

    -- Draft re-saves must not corrupt the visible "edited at" timestamp.
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
