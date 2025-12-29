-- Trigger-driven sync: set Storage avatar from social metadata on sign-in (if no avatar exists yet)
-- Ensure the pg_net extension is available for net.http_post
CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA "extensions";

CREATE OR REPLACE FUNCTION public.trigger_user_avatar_sync_from_auth()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
  AS $$
DECLARE
  project_url text;
  anon_key text;
  trigger_secret text;
  request_id bigint;
  avatar_url text;
  email_hash text;
  provider text;
BEGIN
  avatar_url := NULLIF(COALESCE(NEW.raw_user_meta_data ->> 'avatar_url', NEW.raw_user_meta_data ->> 'picture'), '');
  email_hash := CASE WHEN NEW.email IS NOT NULL
    AND BTRIM(NEW.email) <> '' THEN
    MD5(LOWER(BTRIM(NEW.email)))
  ELSE
    NULL
  END;
  -- Nothing to do if we have neither a social avatar URL nor an email for gravatar
  IF avatar_url IS NULL AND email_hash IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT
    decrypted_secret INTO project_url
  FROM
    vault.decrypted_secrets
  WHERE
    name = 'project_url';
  SELECT
    decrypted_secret INTO anon_key
  FROM
    vault.decrypted_secrets
  WHERE
    name = 'anon_key';
  SELECT
    decrypted_secret INTO trigger_secret
  FROM
    vault.decrypted_secrets
  WHERE
    name = 'system_trigger_secret';
  IF project_url IS NULL OR anon_key IS NULL OR trigger_secret IS NULL THEN
    RAISE NOTICE 'User avatar sync secrets not configured, skipping for user %', NEW.id;
    RETURN NEW;
  END IF;
  provider := NULLIF(NEW.raw_app_meta_data ->> 'provider', '');
  SELECT
    net.http_post(url := project_url || '/functions/v1/trigger-user-avatar-sync', headers := JSONB_BUILD_OBJECT('Content-Type', 'application/json', 'Authorization', 'Bearer ' || anon_key, 'System-Trigger-Secret', trigger_secret), body := JSONB_BUILD_OBJECT('userId', NEW.id, 'avatarUrl', avatar_url, 'gravatarEmailHash', email_hash, 'provider', provider, 'timestamp', NOW(), 'op', TG_OP)) INTO request_id;
  RAISE NOTICE 'User avatar sync initiated for user % (request_id: %)', NEW.id, request_id;
  RETURN NEW;
END;
$$;

-- Create triggers on auth.users
DROP TRIGGER IF EXISTS trigger_user_avatar_sync_insert ON auth.users;

CREATE TRIGGER trigger_user_avatar_sync_insert
  AFTER INSERT ON auth.users
  FOR EACH ROW
  WHEN(NEW.email IS NOT NULL OR COALESCE(NEW.raw_user_meta_data ->> 'avatar_url', NEW.raw_user_meta_data ->> 'picture') IS NOT NULL)
  EXECUTE FUNCTION public.trigger_user_avatar_sync_from_auth();

DROP TRIGGER IF EXISTS trigger_user_avatar_sync_signin ON auth.users;

CREATE TRIGGER trigger_user_avatar_sync_signin
  AFTER UPDATE OF last_sign_in_at,
  raw_user_meta_data ON auth.users
  FOR EACH ROW
  WHEN(NEW.last_sign_in_at IS DISTINCT FROM OLD.last_sign_in_at AND(NEW.email IS NOT NULL OR COALESCE(NEW.raw_user_meta_data ->> 'avatar_url', NEW.raw_user_meta_data ->> 'picture') IS NOT NULL))
  EXECUTE FUNCTION public.trigger_user_avatar_sync_from_auth();

GRANT EXECUTE ON FUNCTION public.trigger_user_avatar_sync_from_auth() TO authenticated;

GRANT EXECUTE ON FUNCTION public.trigger_user_avatar_sync_from_auth() TO service_role;

