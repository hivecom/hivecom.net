-- Drop audit_fields_unchanged and the six policies that still call it.
--
-- Follow-up to 20260802210430, which took it out of the profiles policy. The
-- function compares each parameter to itself:
--
--   SELECT (NOT (created_at IS DISTINCT FROM created_at))
--      AND (NOT (created_by IS DISTINCT FROM created_by));
--
-- so it returns true for every caller, and a WITH CHECK expression only has the
-- new row in scope anyway. It never guarded anything. What actually keeps
-- created_at and created_by pinned is update_audit_fields, the BEFORE UPDATE
-- trigger that assigns them straight from OLD, and all six of these tables
-- carry it.
--
-- Every policy below is recreated with the call removed and nothing else
-- touched. Since the call was a constant true, runtime behaviour is unchanged.
-- Note that events and referendums are TO PUBLIC while the other four are
-- TO authenticated; that split is preserved.

-- events
DROP POLICY IF EXISTS "Users can UPDATE events" ON public.events;

CREATE POLICY "Users can UPDATE events"
  ON public.events AS permissive
  FOR UPDATE
  USING (
    public.has_permission('events.update'::public.app_permission)
    OR (
      created_by = (SELECT auth.uid())
      AND public.is_not_banned()
    )
  )
  WITH CHECK (
    public.has_permission('events.update'::public.app_permission)
    OR (
      created_by = (SELECT auth.uid())
      AND is_official = false
      AND public.is_not_banned()
      AND public.has_agreed_content_rules()
    )
  );

-- funding_expenses
DROP POLICY IF EXISTS "Allow authorized roles to UPDATE expenses" ON public.funding_expenses;

CREATE POLICY "Allow authorized roles to UPDATE expenses"
  ON public.funding_expenses AS permissive
  FOR UPDATE TO authenticated
  USING (public.has_permission('funding.update'::public.app_permission))
  WITH CHECK (public.has_permission('funding.update'::public.app_permission));

-- games
DROP POLICY IF EXISTS "Allow authorized roles to UPDATE games" ON public.games;

CREATE POLICY "Allow authorized roles to UPDATE games"
  ON public.games AS permissive
  FOR UPDATE TO authenticated
  USING (public.has_permission('games.update'::public.app_permission))
  WITH CHECK (public.has_permission('games.update'::public.app_permission));

-- motds
DROP POLICY IF EXISTS "Allow authorized roles to UPDATE motds" ON public.motds;

CREATE POLICY "Allow authorized roles to UPDATE motds"
  ON public.motds AS permissive
  FOR UPDATE TO authenticated
  USING (public.has_permission('motds.update'::public.app_permission))
  WITH CHECK (public.has_permission('motds.update'::public.app_permission));

-- network_servers
DROP POLICY IF EXISTS "Allow authorized roles to UPDATE servers" ON public.network_servers;

CREATE POLICY "Allow authorized roles to UPDATE servers"
  ON public.network_servers AS permissive
  FOR UPDATE TO authenticated
  USING (public.has_permission('network.update'::public.app_permission))
  WITH CHECK (public.has_permission('network.update'::public.app_permission));

-- referendums
DROP POLICY IF EXISTS "Admins or owners can UPDATE referendums" ON public.referendums;

CREATE POLICY "Admins or owners can UPDATE referendums"
  ON public.referendums AS permissive
  FOR UPDATE
  USING (
    public.has_permission('referendums.update'::public.app_permission)
    OR (
      created_by = (SELECT auth.uid())
      AND public.is_not_banned()
      AND public.is_aal2_if_mfa()
    )
  )
  WITH CHECK (
    public.has_permission('referendums.update'::public.app_permission)
    OR (
      created_by = (SELECT auth.uid())
      AND public.is_not_banned()
      AND public.is_aal2_if_mfa()
      AND is_public = false
    )
  );

-- Nothing references it now: no policy, no other function body, no constraint,
-- no default, no view.
DROP FUNCTION IF EXISTS public.audit_fields_unchanged(timestamp with time zone, uuid);
