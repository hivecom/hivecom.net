-- Fix protect_discussion_admin_fields trigger function.
--
-- Problem:
--   The function was defined without SET search_path TO '', so it runs with the
--   default search_path (["$user", "public", ...]). When it calls
--   authorize('discussions.update'::public.app_permission), Postgres cannot
--   resolve the unqualified function name 'authorize' to public.authorize in
--   all execution contexts (e.g. when called from within a SECURITY DEFINER
--   chain or after enum recreation changes type OIDs), producing:
--
--     ERROR 42883: function authorize(public.app_permission) does not exist
--
--   This surfaces as a 404 when any admin tries to update discussion fields
--   (e.g. reassigning discussion_topic_id on an archived discussion), because
--   the trigger fires on every UPDATE to the discussions table even when
--   is_locked and is_sticky are not changing.
--
-- Fix:
--   Recreate the function with SET search_path TO '' and fully-qualified
--   references to all schemas (public.authorize, auth.uid, public.app_permission).
--   Also drop and recreate the trigger binding to be explicit.

CREATE OR REPLACE FUNCTION public.protect_discussion_admin_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  -- Handle is_sticky changes: always requires discussions.update permission.
  IF (OLD.is_sticky IS DISTINCT FROM NEW.is_sticky) THEN
    IF NOT public.authorize('discussions.update'::public.app_permission) THEN
      RAISE EXCEPTION 'Insufficient permissions to modify sticky status';
    END IF;
  END IF;

  -- Handle is_locked changes.
  IF (OLD.is_locked IS DISTINCT FROM NEW.is_locked) THEN
    -- Admins / moderators (discussions.update permission) can lock and unlock freely.
    IF public.authorize('discussions.update'::public.app_permission) THEN
      RETURN NEW;
    END IF;

    -- Discussion authors may only lock (not unlock) their own discussion.
    IF auth.uid() = OLD.created_by AND NEW.is_locked = true THEN
      RETURN NEW;
    END IF;

    RAISE EXCEPTION 'Insufficient permissions to modify lock status';
  END IF;

  RETURN NEW;
END;
$$;

-- Re-attach the trigger explicitly so the binding always points to the
-- freshly replaced function body.
DROP TRIGGER IF EXISTS protect_discussion_fields_trigger ON public.discussions;

CREATE TRIGGER protect_discussion_fields_trigger
  BEFORE UPDATE ON public.discussions
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_discussion_admin_fields();

GRANT EXECUTE ON FUNCTION public.protect_discussion_admin_fields() TO authenticated;
GRANT EXECUTE ON FUNCTION public.protect_discussion_admin_fields() TO service_role;
