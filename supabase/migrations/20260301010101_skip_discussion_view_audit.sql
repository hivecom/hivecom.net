-- Adjust discussion audit trigger to ignore view_count-only updates.

CREATE OR REPLACE FUNCTION public.update_discussions_audit_fields()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
AS $function$
DECLARE
  actor uuid;
  new_payload jsonb;
  old_payload jsonb;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    new_payload := to_jsonb(NEW) - 'view_count' - 'modified_at' - 'modified_by' - 'created_at' - 'created_by';
    old_payload := to_jsonb(OLD) - 'view_count' - 'modified_at' - 'modified_by' - 'created_at' - 'created_by';

    -- Skip audit updates when only view_count changed.
    IF (NEW.view_count IS DISTINCT FROM OLD.view_count) AND new_payload = old_payload THEN
      NEW.modified_at = OLD.modified_at;
      NEW.modified_by = OLD.modified_by;
      NEW.created_at = OLD.created_at;
      NEW.created_by = OLD.created_by;
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

DROP TRIGGER IF EXISTS update_discussions_audit_fields ON public.discussions;

CREATE TRIGGER update_discussions_audit_fields
  BEFORE UPDATE ON public.discussions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_discussions_audit_fields();
