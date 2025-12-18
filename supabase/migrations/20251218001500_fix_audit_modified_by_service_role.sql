-- Fix audit trigger to avoid clobbering modified_by during service-role/internal updates.
--
-- Problem:
-- - public.update_audit_fields() always sets NEW.modified_by = auth.uid().
-- - When updates are performed without a user JWT (e.g. service_role from edge functions),
--   auth.uid() resolves to NULL and overwrites the last human editor.
--
-- Solution:
-- - Only set modified_by when auth.uid() is present; otherwise preserve OLD.modified_by.

CREATE OR REPLACE FUNCTION public.update_audit_fields()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
AS $function$
DECLARE
  actor uuid;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    actor := auth.uid();

    -- Set modified_at to current timestamp (if column exists)
    BEGIN
      NEW.modified_at = NOW();
    EXCEPTION
      WHEN undefined_column THEN
        -- Column doesn't exist, skip
    END;

    -- Set modified_by to current authenticated user when available; otherwise preserve existing value
    BEGIN
      IF actor IS NOT NULL THEN
        NEW.modified_by = actor;
      ELSE
        NEW.modified_by = OLD.modified_by;
      END IF;
    EXCEPTION
      WHEN undefined_column THEN
        -- Column doesn't exist, skip
    END;

    -- Ensure created_at is never changed during updates (if column exists)
    BEGIN
      NEW.created_at = OLD.created_at;
    EXCEPTION
      WHEN undefined_column THEN
        -- Column doesn't exist, skip
    END;

    -- Ensure created_by is never changed during updates (if column exists)
    BEGIN
      NEW.created_by = OLD.created_by;
    EXCEPTION
      WHEN undefined_column THEN
        -- Column doesn't exist, skip
    END;
  END IF;

  RETURN NEW;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.update_audit_fields() TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_audit_fields() TO service_role;
