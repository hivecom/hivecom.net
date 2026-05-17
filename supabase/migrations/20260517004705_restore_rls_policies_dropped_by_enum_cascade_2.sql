-- Restore RLS policies silently dropped by DROP TYPE ... CASCADE in
-- 20260515164827_consolidate_permissions_step2_migrate_and_cleanup.sql
-- that were not caught by previous restore migrations.
--
-- The DROP TYPE public.app_permission_old CASCADE in that migration cascade-drops
-- every RLS policy whose expression contained a cast to the old type, including
-- policies on tables that were created or last updated before the cascade ran.
--
-- Affected policies:
--   games:       INSERT, UPDATE, DELETE  (20250610011143_rbac_rewrite_for_roles.sql)
--   motds:       INSERT, UPDATE, DELETE  (20251214032613_motd_and_kvstore.sql)
--   kvstore:     DELETE                  (20251214032613_motd_and_kvstore.sql)
--   alerts:      SELECT, UPDATE, DELETE  (20260308203000_alerts_table.sql)
--   themes:      INSERT, UPDATE, DELETE  (20260330231343_themes_rls_and_permissions.sql)
--   profiles:    DELETE (admin), "Allow admins to manage user bans" UPDATE
--                (20250610011143, 20260228043346_content_rules_rls.sql)
--   user_roles:  INSERT, UPDATE, DELETE  (20250610011143, 20251121221931)
--   referendums: INSERT, UPDATE, DELETE  (20250610011143_rbac_rewrite_for_roles.sql)
--   projects:    INSERT, UPDATE, DELETE  (20260228043346_content_rules_rls.sql)

-- ─── games ────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Allow authorized roles to INSERT games" ON public.games;
CREATE POLICY "Allow authorized roles to INSERT games" ON public.games AS permissive
  FOR INSERT TO authenticated
  WITH CHECK (public.has_permission('games.create'::public.app_permission));

DROP POLICY IF EXISTS "Allow authorized roles to UPDATE games" ON public.games;
CREATE POLICY "Allow authorized roles to UPDATE games" ON public.games AS permissive
  FOR UPDATE TO authenticated
  USING (public.has_permission('games.update'::public.app_permission))
  WITH CHECK (public.has_permission('games.update'::public.app_permission)
    AND public.audit_fields_unchanged(created_at, created_by));

DROP POLICY IF EXISTS "Allow authorized roles to DELETE games" ON public.games;
CREATE POLICY "Allow authorized roles to DELETE games" ON public.games AS permissive
  FOR DELETE TO authenticated
  USING (public.has_permission('games.delete'::public.app_permission));

-- ─── motds ────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Allow authorized roles to INSERT motds" ON public.motds;
CREATE POLICY "Allow authorized roles to INSERT motds" ON public.motds AS permissive
  FOR INSERT TO authenticated
  WITH CHECK (public.has_permission('motds.create'::public.app_permission));

DROP POLICY IF EXISTS "Allow authorized roles to UPDATE motds" ON public.motds;
CREATE POLICY "Allow authorized roles to UPDATE motds" ON public.motds AS permissive
  FOR UPDATE TO authenticated
  USING (public.has_permission('motds.update'::public.app_permission))
  WITH CHECK (public.has_permission('motds.update'::public.app_permission)
    AND public.audit_fields_unchanged(created_at, created_by));

DROP POLICY IF EXISTS "Allow authorized roles to DELETE motds" ON public.motds;
CREATE POLICY "Allow authorized roles to DELETE motds" ON public.motds AS permissive
  FOR DELETE TO authenticated
  USING (public.has_permission('motds.delete'::public.app_permission));

-- ─── kvstore ──────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Allow authorized roles to DELETE kvstore" ON public.kvstore;
CREATE POLICY "Allow authorized roles to DELETE kvstore" ON public.kvstore AS permissive
  FOR DELETE TO authenticated
  USING (public.has_permission('kvstore.delete'::public.app_permission));

-- ─── alerts ───────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Authorized roles can read alerts" ON public.alerts;
CREATE POLICY "Authorized roles can read alerts"
  ON public.alerts FOR SELECT
  TO authenticated
  USING (authorize('alerts.read'::public.app_permission));

DROP POLICY IF EXISTS "Authorized roles can update alerts" ON public.alerts;
CREATE POLICY "Authorized roles can update alerts"
  ON public.alerts FOR UPDATE
  TO authenticated
  USING (authorize('alerts.read'::public.app_permission));

DROP POLICY IF EXISTS "Authorized roles can delete alerts" ON public.alerts;
CREATE POLICY "Authorized roles can delete alerts"
  ON public.alerts FOR DELETE
  TO authenticated
  USING (authorize('alerts.read'::public.app_permission));

-- ─── themes ───────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Admins can delete any theme" ON public.themes;
CREATE POLICY "Admins can delete any theme"
  ON public.themes FOR DELETE TO authenticated
  USING (authorize('themes.delete'::public.app_permission));

DROP POLICY IF EXISTS "Admins can create any theme" ON public.themes;
CREATE POLICY "Admins can create any theme"
  ON public.themes FOR INSERT TO authenticated
  WITH CHECK (authorize('themes.create'::public.app_permission));

DROP POLICY IF EXISTS "Admins can update any theme" ON public.themes;
CREATE POLICY "Admins can update any theme"
  ON public.themes FOR UPDATE TO authenticated
  USING (authorize('themes.update'::public.app_permission))
  WITH CHECK (authorize('themes.update'::public.app_permission));

-- ─── profiles ─────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Allow authorized roles to DELETE profiles" ON public.profiles;
CREATE POLICY "Allow authorized roles to DELETE profiles" ON public.profiles AS permissive
  FOR DELETE TO authenticated
  USING (public.has_permission('profiles.delete'::public.app_permission));

DROP POLICY IF EXISTS "Allow admins to manage user bans" ON public.profiles;
CREATE POLICY "Allow admins to manage user bans" ON public.profiles AS permissive
  FOR UPDATE TO authenticated
  USING (public.has_permission('users.update'::public.app_permission))
  WITH CHECK (
    public.has_permission('users.update'::public.app_permission)
    AND public.audit_fields_unchanged(created_at, NULL)
  );

-- ─── user_roles ───────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Allow authorized roles to INSERT user roles" ON public.user_roles;
CREATE POLICY "Allow authorized roles to INSERT user roles" ON public.user_roles AS permissive
  FOR INSERT TO authenticated
  WITH CHECK (
    (public.has_permission('roles.create'::public.app_permission)
      OR public.has_permission('roles.update'::public.app_permission))
    AND (SELECT auth.uid()) != user_id
  );

DROP POLICY IF EXISTS "Allow authorized roles to UPDATE user roles" ON public.user_roles;
CREATE POLICY "Allow authorized roles to UPDATE user roles" ON public.user_roles AS permissive
  FOR UPDATE TO authenticated
  USING (public.has_permission('roles.update'::public.app_permission));

DROP POLICY IF EXISTS "Allow authorized roles to DELETE user roles" ON public.user_roles;
CREATE POLICY "Allow authorized roles to DELETE user roles" ON public.user_roles AS permissive
  FOR DELETE TO authenticated
  USING (public.has_permission('roles.delete'::public.app_permission));

-- ─── referendums ──────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Allow authorized roles to INSERT referendums" ON public.referendums;
CREATE POLICY "Allow authorized roles to INSERT referendums" ON public.referendums AS permissive
  FOR INSERT TO authenticated
  WITH CHECK (public.has_permission('referendums.create'::public.app_permission));

DROP POLICY IF EXISTS "Allow authorized roles to UPDATE referendums" ON public.referendums;
CREATE POLICY "Allow authorized roles to UPDATE referendums" ON public.referendums AS permissive
  FOR UPDATE TO authenticated
  USING (public.has_permission('referendums.update'::public.app_permission))
  WITH CHECK (public.has_permission('referendums.update'::public.app_permission)
    AND public.audit_fields_unchanged(created_at, created_by));

DROP POLICY IF EXISTS "Allow authorized roles to DELETE referendums" ON public.referendums;
CREATE POLICY "Allow authorized roles to DELETE referendums" ON public.referendums AS permissive
  FOR DELETE TO authenticated
  USING (public.has_permission('referendums.delete'::public.app_permission));

-- ─── projects ─────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "projects_insert_policy" ON public.projects;
CREATE POLICY "projects_insert_policy" ON public.projects AS permissive
  FOR INSERT TO authenticated
  WITH CHECK (
    authorize('projects.create'::public.app_permission)
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.agreed_content_rules = true
    )
  );

DROP POLICY IF EXISTS "projects_update_policy" ON public.projects;
CREATE POLICY "projects_update_policy" ON public.projects AS permissive
  FOR UPDATE TO authenticated
  USING (
    authorize('projects.update'::public.app_permission)
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.agreed_content_rules = true
    )
  );

DROP POLICY IF EXISTS "projects_delete_policy" ON public.projects;
CREATE POLICY "projects_delete_policy" ON public.projects AS permissive
  FOR DELETE TO authenticated
  USING (authorize('projects.delete'::public.app_permission));
