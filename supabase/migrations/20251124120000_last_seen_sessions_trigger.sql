-- Update last_seen automation to rely on auth.sessions inserts instead of auth.users updates
-- Supabase no longer updates auth.users.last_sign_in_at on each login, so the previous trigger never fired.
-- This migration swaps the trigger over to auth.sessions so every successful sign-in updates profiles.last_seen.
-- Clean up the old auth.users trigger and function (safe if they do not exist yet)
DROP TRIGGER IF EXISTS "on_auth_user_sign_in" ON "auth"."users";

DROP FUNCTION IF EXISTS "public"."update_last_seen_on_sign_in"();

-- Ensure we do not leave stale session triggers laying around when re-running migrations locally
DROP TRIGGER IF EXISTS "on_auth_session_created" ON "auth"."sessions";

DROP FUNCTION IF EXISTS "public"."update_last_seen_on_session"();

-- New trigger function that executes whenever a session row is inserted (i.e. user signs in)
CREATE OR REPLACE FUNCTION "public"."update_last_seen_on_session"()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
  AS $$
BEGIN
  -- Rely on the existing RPC helper so all bounds checks and permissions stay in one place
  PERFORM
    public.update_user_last_seen(NEW.user_id);
  RETURN NEW;
END;
$$;

-- Trigger fires after every auth.sessions insert (successful sign-in)
CREATE TRIGGER "on_auth_session_created"
  AFTER INSERT ON "auth"."sessions"
  FOR EACH ROW
  EXECUTE FUNCTION "public"."update_last_seen_on_session"();

