-- Migration: fix_update_user_last_seen_drop_arbitrary_uuid_param
--
-- update_user_last_seen(user_id uuid DEFAULT auth.uid()) allowed any
-- authenticated caller to pass an arbitrary UUID, letting them update
-- last_seen on any profile (griefing vector).
--
-- Fix: drop the parameter entirely and hardcode auth.uid() in the WHERE
-- clause so the function always acts on the calling user only.
--
-- Side-effect: update_last_seen_on_session trigger function previously
-- delegated to update_user_last_seen(NEW.user_id). Since auth.uid() is not
-- available in a trigger context, that function now does the UPDATE inline
-- using the known NEW.user_id from the session row.

-- Drop old signature (uuid param)
DROP FUNCTION IF EXISTS public.update_user_last_seen(uuid);

-- Recreate without param - always operates on the calling user
CREATE OR REPLACE FUNCTION public.update_user_last_seen()
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
AS $$
BEGIN
  UPDATE public.profiles
  SET last_seen = NOW()
  WHERE
    id = auth.uid()
    AND (
      last_seen IS NULL
      OR last_seen < NOW() - INTERVAL '60 seconds'
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_user_last_seen() TO authenticated;

-- Update the trigger function to do the UPDATE inline instead of delegating,
-- since auth.uid() is not set in a trigger execution context.
CREATE OR REPLACE FUNCTION public.update_last_seen_on_session()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles
  SET last_seen = NOW()
  WHERE
    id = NEW.user_id
    AND (
      last_seen IS NULL
      OR last_seen < NOW() - INTERVAL '60 seconds'
    );
  RETURN NEW;
END;
$$;
