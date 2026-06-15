-- Custom Access Token Hook: treat a passkey sign-in as AAL2.
--
-- Background
-- ----------
-- Supabase Auth (GoTrue) classifies a first-factor passkey sign-in
-- (auth.signInWithPasskey) as a conventional login and issues an `aal1`
-- session. Only a separate MFA factor challenge (TOTP / phone / the
-- `mfa/webauthn` MFA factor) promotes a session to `aal2`. As a result an
-- MFA-enrolled user who signs in with a passkey would still be forced through
-- the TOTP step, and would be blocked by our `is_aal2_if_mfa()` RLS gate until
-- they did so.
--
-- A user-verifying passkey is itself phishing-resistant and multi-factor
-- (possession of the device + biometric/PIN), so we treat it as satisfying our
-- strong-auth requirement. GoTrue records the first-factor passkey method as
-- "passkey" in the JWT `amr` claim (note: the WebAuthn *MFA factor* uses
-- "mfa/webauthn", which already yields aal2 natively and is unaffected here).
--
-- This hook rewrites the `aal` claim to `aal2` whenever the session's `amr`
-- contains a "passkey" method. Because every downstream gate (the
-- `is_aal2_if_mfa()` RLS helper, the edge-function `checkAssuranceLevel`
-- guard, and the client `getAuthenticatorAssuranceLevel` check) reads the
-- `aal` claim, this single change propagates everywhere with no other code
-- changes. Password / OAuth / magic-link logins are untouched and continue to
-- require the usual MFA step-up.
--
-- This migration re-creates the existing hook in full (ban enforcement,
-- user_role stamping, IRC preferred_username) and adds only the passkey AAL
-- elevation block before the final return.
--
-- After applying, ensure the hook remains enabled in the Supabase Dashboard:
--   Authentication > Hooks > Custom Access Token > select public.custom_access_token_hook

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
  has_passkey_amr  boolean := false;
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

  -- Treat a passkey-authenticated session as aal2 (see header comment).
  IF jsonb_typeof(claims -> 'amr') = 'array' THEN
    SELECT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(claims -> 'amr') AS amr_entry
      WHERE amr_entry ->> 'method' = 'passkey'
    )
    INTO has_passkey_amr;

    IF has_passkey_amr THEN
      claims := jsonb_set(claims, '{aal}', '"aal2"'::jsonb);
    END IF;
  END IF;

  RETURN jsonb_set(event, '{claims}', claims);
END;
$$;

GRANT EXECUTE ON FUNCTION public.custom_access_token_hook TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook FROM authenticated, anon;
