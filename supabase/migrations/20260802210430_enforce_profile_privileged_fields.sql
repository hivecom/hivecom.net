-- Actually protect the privileged columns on profiles.
--
-- "Users can UPDATE profiles" tries to pin 13 columns with clauses shaped like
-- NOT (discord_id IS DISTINCT FROM discord_id). A WITH CHECK expression only
-- ever has the new row in scope, so that compares a column to itself: false,
-- negated to true, for every row. Same story one level down in
-- audit_fields_unchanged, whose body compares each parameter to itself and so
-- returns true for every caller.
--
-- Net effect: a signed-in user could PATCH their own row and set
-- supporter_lifetime, or repoint discord_id and steam_id at someone else's
-- account. Nothing else caught it - profiles has no column-level ACLs and no
-- trigger restoring these from OLD.
--
-- RLS can't express column immutability at all, since WITH CHECK has no OLD.
-- The working pattern is already in the schema: update_audit_fields is a
-- BEFORE UPDATE trigger doing NEW.created_at := OLD.created_at, and that is the
-- only reason created_at is genuinely safe today. This does the same for the
-- rest.

CREATE OR REPLACE FUNCTION public.trigger_protect_profile_privileged_fields()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO ''
AS $function$
BEGIN
  -- Edge functions and cron connect as service_role or postgres. They own most
  -- of these columns, so they pass through untouched.
  IF CURRENT_USER NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  -- Staff who can already edit anyone's profile keep the same reach they have
  -- under the WITH CHECK branch below.
  IF public.has_permission('users.update'::public.app_permission) THEN
    RETURN NEW;
  END IF;

  -- Patreon linkage and supporter status: cron-patreon-fetch owns these.
  NEW.patreon_id         := OLD.patreon_id;
  NEW.supporter_patreon  := OLD.supporter_patreon;
  NEW.supporter_lifetime := OLD.supporter_lifetime;

  -- Ban state: admin-user-ban owns these.
  NEW.banned     := OLD.banned;
  NEW.ban_reason := OLD.ban_reason;
  NEW.ban_start  := OLD.ban_start;
  NEW.ban_end    := OLD.ban_end;

  -- TeamSpeak identities are only ever written by teamspeak-verify-confirm and
  -- teamspeak-unlink.
  NEW.teamspeak_identities := OLD.teamspeak_identities;

  -- The three link fields are clear-only. Settings > Connections disconnects by
  -- writing NULL straight from the client and that has to keep working, but
  -- setting or repointing one has to go through the verify function that proves
  -- you own the account.
  IF NEW.discord_id IS NOT NULL AND NEW.discord_id IS DISTINCT FROM OLD.discord_id THEN
    NEW.discord_id := OLD.discord_id;
  END IF;

  IF NEW.steam_id IS NOT NULL AND NEW.steam_id IS DISTINCT FROM OLD.steam_id THEN
    NEW.steam_id := OLD.steam_id;
  END IF;

  IF NEW.lastfm_username IS NOT NULL AND NEW.lastfm_username IS DISTINCT FROM OLD.lastfm_username THEN
    NEW.lastfm_username := OLD.lastfm_username;
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.trigger_protect_profile_privileged_fields()
  FROM public, anon, authenticated;

DROP TRIGGER IF EXISTS protect_profile_privileged_fields ON public.profiles;

CREATE TRIGGER protect_profile_privileged_fields
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_protect_profile_privileged_fields();

-- has_banner and banner_extension stay client-writable on purpose. ProfileForm
-- and BannerEditor set them straight from the browser after an upload, and they
-- only mirror whether a storage object exists.

-- Now drop the clauses that were only pretending. Every one of them evaluates
-- to a constant true, so removing them changes nothing at runtime - it just
-- stops the policy from reading like it enforces something. created_at and
-- created_by stay covered by update_profiles_audit_fields.
DROP POLICY IF EXISTS "Users can UPDATE profiles" ON public.profiles;

CREATE POLICY "Users can UPDATE profiles"
  ON public.profiles AS permissive
  FOR UPDATE
  USING (
    public.has_permission('profiles.update'::public.app_permission)
    OR (
      (SELECT auth.uid()) = id
      AND public.is_not_banned()
      AND public.is_aal2_if_mfa()
    )
  )
  WITH CHECK (
    public.has_permission('users.update'::public.app_permission)
    OR (
      (SELECT auth.uid()) = id
      AND public.is_not_banned()
      AND public.is_aal2_if_mfa()
    )
  );

-- Leaving audit_fields_unchanged in place. It's a no-op, but it's still
-- referenced by the UPDATE policies on events, funding_expenses, games, motds,
-- network_servers and referendums, and all six of those tables carry
-- update_audit_fields too, so created_at and created_by are already held down
-- by trigger there. Ripping it out of six more policies is a separate change.
