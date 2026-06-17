-- =============================================================================
-- profile_reservations
-- =============================================================================
-- Admin-managed reserved usernames. When a profile's username is set to a value
-- that matches a row here (case-insensitive), the change is rejected unless the
-- reservation is assigned to that exact profile. This guards the Hivecom/OIDC
-- username side: because custom_access_token_hook derives the IRC
-- preferred_username from profiles.username, blocking the username here also
-- blocks the legacy IRC nick from being claimed by a new account. NickServ-side
-- nick reservation is independent and unaffected.

CREATE TABLE "public"."profile_reservations" (
  "id" bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "username" text NOT NULL,
  "note" text,
  "assigned_to" uuid REFERENCES "public"."profiles" (id) ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "modified_at" timestamptz,
  "created_by" uuid DEFAULT auth.uid() REFERENCES "public"."profiles" (id) ON DELETE SET NULL
);

-- Case-insensitive uniqueness, matching profiles_username_unique.
CREATE UNIQUE INDEX profile_reservations_username_lower_key
  ON public.profile_reservations (lower(username));

CREATE INDEX profile_reservations_assigned_to_idx
  ON public.profile_reservations (assigned_to);

ALTER TABLE "public"."profile_reservations" ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.profile_reservations IS 'Admin-managed reserved usernames; blocks setting a profile username unless the reservation is assigned to that profile.';
COMMENT ON COLUMN public.profile_reservations.username IS 'Reserved username, matched case-insensitively against profiles.username.';
COMMENT ON COLUMN public.profile_reservations.note IS 'Admin context, e.g. the legacy IRC owner or why it is held.';
COMMENT ON COLUMN public.profile_reservations.assigned_to IS 'If set, only this profile may take the reserved username.';

-- Grants. RLS still restricts actual access to admins.
GRANT SELECT, INSERT, UPDATE, DELETE, REFERENCES, TRIGGER, TRUNCATE ON TABLE public.profile_reservations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE, REFERENCES, TRIGGER, TRUNCATE ON TABLE public.profile_reservations TO service_role;

-- Only admins (users.update) can manage reservations.
CREATE POLICY "Admins can SELECT profile reservations" ON public.profile_reservations
  FOR SELECT TO authenticated
    USING (authorize('users.update'::public.app_permission));

CREATE POLICY "Admins can INSERT profile reservations" ON public.profile_reservations
  FOR INSERT TO authenticated
    WITH CHECK (authorize('users.update'::public.app_permission));

CREATE POLICY "Admins can UPDATE profile reservations" ON public.profile_reservations
  FOR UPDATE TO authenticated
    USING (authorize('users.update'::public.app_permission))
    WITH CHECK (authorize('users.update'::public.app_permission));

CREATE POLICY "Admins can DELETE profile reservations" ON public.profile_reservations
  FOR DELETE TO authenticated
    USING (authorize('users.update'::public.app_permission));

-- Audit modified_at on update.
DROP TRIGGER IF EXISTS update_profile_reservations_audit_fields ON public.profile_reservations;
CREATE TRIGGER update_profile_reservations_audit_fields
  BEFORE UPDATE ON public.profile_reservations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_audit_fields();

-- Enforcement: reject setting a profile username that is reserved.
CREATE OR REPLACE FUNCTION public.enforce_profile_reservation()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $$
DECLARE
  v_assigned uuid;
BEGIN
  IF NEW.username IS NULL THEN
    RETURN NEW;
  END IF;

  -- Skip when the username is not actually changing (case-insensitive).
  IF TG_OP = 'UPDATE' AND lower(NEW.username) = lower(OLD.username) THEN
    RETURN NEW;
  END IF;

  SELECT pr.assigned_to
    INTO v_assigned
    FROM public.profile_reservations pr
   WHERE lower(pr.username) = lower(NEW.username)
   LIMIT 1;

  IF FOUND AND (v_assigned IS NULL OR v_assigned <> NEW.id) THEN
    RAISE EXCEPTION 'This username is reserved - contact an admin.'
      USING ERRCODE = 'HV001';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.enforce_profile_reservation() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS enforce_profile_reservation ON public.profiles;
CREATE TRIGGER enforce_profile_reservation
  BEFORE INSERT OR UPDATE OF username ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_profile_reservation();
