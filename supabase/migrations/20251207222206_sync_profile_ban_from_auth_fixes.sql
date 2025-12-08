-- RPC helper to purge a user's auth sessions and refresh tokens using a security definer
DROP FUNCTION IF EXISTS public.admin_delete_user_sessions(uuid);

CREATE OR REPLACE FUNCTION public.admin_delete_user_sessions(target_user uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, auth
AS $$
	-- Sign the user out everywhere by removing active sessions (auth.sessions.user_id is uuid)
	DELETE FROM auth.sessions WHERE user_id = target_user;
	-- Remove refresh tokens (auth.refresh_tokens.user_id is text)
	DELETE FROM auth.refresh_tokens WHERE user_id = target_user::text;
$$;

REVOKE ALL ON FUNCTION public.admin_delete_user_sessions(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_delete_user_sessions(uuid) TO service_role;

-- Rebuild sync_profile_ban_from_auth with safer metadata parsing (empty strings caused cast errors)
DROP TRIGGER IF EXISTS trigger_sync_profile_ban_from_auth ON auth.users;
DROP FUNCTION IF EXISTS public.sync_profile_ban_from_auth();

CREATE OR REPLACE FUNCTION public.sync_profile_ban_from_auth()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
	meta jsonb := COALESCE(NEW.raw_user_meta_data, '{}'::jsonb);
	ban_reason_meta text;
	ban_start_value text;
	ban_end_value text;
	ban_start_ts timestamptz;
	ban_end_ts timestamptz;
	effective_ban_end timestamptz;
	is_banned boolean;
BEGIN
	ban_reason_meta := NULLIF(meta->>'ban_reason', '');
	ban_start_value := NULLIF(meta->>'ban_start', '');
	ban_end_value := NULLIF(meta->>'ban_end', '');

	IF ban_start_value IS NOT NULL THEN
		BEGIN
			ban_start_ts := ban_start_value::timestamptz;
		EXCEPTION WHEN others THEN
			ban_start_ts := NULL;
		END;
	END IF;

	IF ban_end_value IS NOT NULL THEN
		BEGIN
			ban_end_ts := ban_end_value::timestamptz;
		EXCEPTION WHEN others THEN
			ban_end_ts := NULL;
		END;
	END IF;

	-- Prefer auth.users.banned_until as the source of truth; fall back to metadata value
	effective_ban_end := COALESCE(NEW.banned_until, ban_end_ts);
	is_banned := effective_ban_end IS NOT NULL AND effective_ban_end > NOW();

	UPDATE public.profiles p
	SET banned = is_banned,
			ban_reason = CASE WHEN is_banned THEN ban_reason_meta ELSE NULL END,
			ban_start = CASE WHEN is_banned THEN COALESCE(ban_start_ts, p.ban_start, NOW()) ELSE NULL END,
			ban_end = CASE WHEN is_banned THEN effective_ban_end ELSE NULL END
	WHERE p.id = NEW.id;

	RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_sync_profile_ban_from_auth
AFTER UPDATE OF banned_until, raw_user_meta_data ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.sync_profile_ban_from_auth();
