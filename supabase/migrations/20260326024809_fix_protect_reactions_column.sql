-- Fix protect_reactions_column trigger function.
--
-- Problem:
--   The function references 'discussions.manage'::public.app_permission, which
--   was removed from the app_permission enum in migration
--   20260226000000_recreate_app_permission_enum.sql. Casting to a non-existent
--   enum value would throw an error if the admin bypass branch is ever reached.
--
--   The function also has no SET search_path, which is inconsistent with the
--   other trigger functions fixed in migrations 20260327000002/0003.
--
-- Fix:
--   Replace discussions.manage with discussions.update (the current permission
--   for admin/moderator actions on discussions) and add SET search_path TO ''.

CREATE OR REPLACE FUNCTION public.protect_reactions_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  -- Only fire when reactions is actually being changed.
  IF OLD.reactions IS NOT DISTINCT FROM NEW.reactions THEN
    RETURN NEW;
  END IF;

  -- Allow writes that originate from inside toggle_reaction.
  -- The RPC sets this local GUC at the start of its transaction; it is
  -- automatically cleared when the transaction ends so it cannot leak.
  IF pg_catalog.current_setting('app.reactions_rpc_active', true) = 'true' THEN
    RETURN NEW;
  END IF;

  -- Allow admins and moderators to modify reactions directly (e.g. to remove
  -- an abusive reaction during moderation).
  IF public.authorize('discussions.update'::public.app_permission) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION
    'Direct writes to the reactions column are not permitted. '
    'Use the toggle_reaction RPC instead.'
    USING ERRCODE = 'insufficient_privilege';
END;
$$;
