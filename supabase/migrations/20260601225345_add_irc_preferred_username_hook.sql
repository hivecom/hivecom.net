-- Custom Access Token Hook: inject preferred_username for the Orbit IRC auth-bridge,
-- enforce account bans, and stamp the user_role claim.
--
-- After applying this migration, ensure the hook is enabled in the Supabase Dashboard:
--   Authentication > Hooks > Custom Access Token > select public.custom_access_token_hook
--
-- The hook reads the user's profile username, sanitizes it to a valid IRC nick
-- (prefix _ if starts with digit, truncate to Ergo's nicklen of 32), and injects
-- it as the preferred_username claim so the auth-bridge can map it to an account.

CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path = ''
AS $$
DECLARE
  claims           jsonb;
  user_role        public.app_role;
  profile_banned   boolean := false;
  profile_ban_end  timestamptz;
  profile_ban_reason text;
  active_ban       boolean := false;
  ban_message      text;
  raw_nick         text;
  irc_nick         text;
BEGIN
  -- Fetch application role for the JWT claim.
  SELECT role
    INTO user_role
    FROM public.user_roles
   WHERE user_id = (event ->> 'user_id')::uuid;

  -- Retrieve ban state and username in one round-trip.
  SELECT banned, ban_end, ban_reason, username
    INTO profile_banned, profile_ban_end, profile_ban_reason, raw_nick
    FROM public.profiles
   WHERE id = (event ->> 'user_id')::uuid;

  IF COALESCE(profile_banned, false) THEN
    IF profile_ban_end IS NULL OR profile_ban_end > now() THEN
      active_ban := true;
      ban_message := COALESCE(
        'Account suspended: ' || profile_ban_reason,
        'Account suspended. Please contact support.'
      );
    END IF;
  END IF;

  IF active_ban THEN
    RETURN jsonb_build_object(
      'error', jsonb_build_object(
        'http_code', 403,
        'message', ban_message
      )
    );
  END IF;

  claims := event -> 'claims';

  -- Stamp user_role.
  IF user_role IS NOT NULL THEN
    claims := jsonb_set(claims, '{user_role}', to_jsonb(user_role));
  ELSE
    claims := jsonb_set(claims, '{user_role}', 'null');
  END IF;

  -- Inject preferred_username for IRC/Orbit auth.
  -- IRC nicks must not start with a digit (RFC 1459 / Ergo PRECIS); prefix _ if so.
  -- Truncate to Ergo's configured nicklen of 32 characters.
  IF raw_nick IS NOT NULL THEN
    irc_nick := CASE
      WHEN raw_nick ~ '^[0-9]' THEN '_' || raw_nick
      ELSE raw_nick
    END;
    irc_nick := left(irc_nick, 32);
    claims := jsonb_set(claims, '{preferred_username}', to_jsonb(irc_nick));
  END IF;

  RETURN jsonb_set(event, '{claims}', claims);
END;
$$;

GRANT EXECUTE ON FUNCTION public.custom_access_token_hook TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook FROM authenticated, anon;
