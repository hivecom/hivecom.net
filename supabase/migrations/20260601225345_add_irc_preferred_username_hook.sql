-- Custom Access Token Hook: inject preferred_username for the Orbit IRC auth-bridge.
--
-- After applying this migration, enable the hook in the Supabase Dashboard:
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
  SET search_path = public
AS $$
DECLARE
  claims   jsonb;
  raw_nick text;
  irc_nick text;
BEGIN
  claims := event -> 'claims';

  SELECT username
  INTO raw_nick
  FROM public.profiles
  WHERE id = (event ->> 'user_id')::uuid;

  IF raw_nick IS NOT NULL THEN
    -- IRC nicks must not start with a digit (RFC 1459 / Ergo PRECIS).
    irc_nick := CASE
      WHEN raw_nick ~ '^[0-9]' THEN '_' || raw_nick
      ELSE raw_nick
    END;

    -- Truncate to Ergo's configured nicklen (32 chars).
    irc_nick := left(irc_nick, 32);

    claims := jsonb_set(claims, '{preferred_username}', to_jsonb(irc_nick));
  END IF;

  RETURN jsonb_set(event, '{claims}', claims);
END;
$$;

GRANT EXECUTE ON FUNCTION public.custom_access_token_hook TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook FROM authenticated, anon;
