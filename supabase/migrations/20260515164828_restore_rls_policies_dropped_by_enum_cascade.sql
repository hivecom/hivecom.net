-- Restore RLS policies silently dropped by the DROP TYPE ... CASCADE in
-- 20260515164827_consolidate_permissions_step2_migrate_and_cleanup.sql.
--
-- When that migration recreates app_permission it renames the old type to
-- app_permission_old and then runs DROP TYPE public.app_permission_old CASCADE.
-- Postgres CASCADE drops every object whose expression contains a cast to the
-- old type, including RLS policies created in earlier migrations in this same
-- batch. Those migrations ran before 164827 and are not rerun, so their
-- policies are gone. They must be recreated here.
--
-- Affected policies (all reference ::app_permission which became ::app_permission_old):
--   1. "Everyone can view discussions"        ON public.discussions
--      (20260515055418_rls_performance_improvements.sql)
--   2. "Everyone can view replies"            ON public.discussion_replies
--      (20260515055418_rls_performance_improvements.sql)
--   3. "Allow authorized roles to UPDATE kvstore" ON public.kvstore
--      (20260515051057_kvstore_drop_created_by_nullable_modified_by_audit_trigger.sql)
--   4. "Admins can read all profile_points"   ON public.profile_points
--      (20260515163246_profile_points_admin_rls_and_kvstore_grants.sql)
--   5. "Admins can read all profile_point_history" ON public.profile_point_history
--      (20260515163246)
--   6. "Admins can read all profile_point_claims"  ON public.profile_point_claims
--      (20260515163246)

-- ─── 1 & 2. discussions + discussion_replies SELECT ──────────────────────────

DROP POLICY IF EXISTS "Everyone can view discussions" ON public.discussions;

CREATE POLICY "Everyone can view discussions"
  ON public.discussions
  FOR SELECT
  TO public
  USING (
    (is_draft = false AND is_nsfw = false)
    OR (auth.uid() IS NOT NULL AND is_draft = false)
    OR (auth.uid() = created_by)
    OR authorize('discussions.update'::app_permission)
  );

DROP POLICY IF EXISTS "Everyone can view replies" ON public.discussion_replies;

CREATE POLICY "Everyone can view replies"
  ON public.discussion_replies
  FOR SELECT
  TO public
  USING (
    EXISTS (
      SELECT 1
      FROM discussions d
      WHERE d.id = discussion_replies.discussion_id
        AND (
          d.is_draft = false
          OR (auth.uid() IS NOT NULL AND auth.uid() = d.created_by)
          OR authorize('discussions.update'::app_permission)
        )
    )
  );

-- ─── 3. kvstore UPDATE ───────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Allow authorized roles to UPDATE kvstore" ON public.kvstore;

CREATE POLICY "Allow authorized roles to UPDATE kvstore" ON public.kvstore
  FOR UPDATE TO authenticated
  USING (public.has_permission('kvstore.update'::public.app_permission))
  WITH CHECK (public.has_permission('kvstore.update'::public.app_permission));

-- ─── 4-6. profile_points* SELECT ─────────────────────────────────────────────

DROP POLICY IF EXISTS "Admins can read all profile_points" ON public.profile_points;

CREATE POLICY "Admins can read all profile_points"
  ON public.profile_points
  FOR SELECT
  TO authenticated
  USING (public.has_permission('profile_points.read'::public.app_permission));

DROP POLICY IF EXISTS "Admins can read all profile_point_history" ON public.profile_point_history;

CREATE POLICY "Admins can read all profile_point_history"
  ON public.profile_point_history
  FOR SELECT
  TO authenticated
  USING (public.has_permission('profile_points.read'::public.app_permission));

DROP POLICY IF EXISTS "Admins can read all profile_point_claims" ON public.profile_point_claims;

CREATE POLICY "Admins can read all profile_point_claims"
  ON public.profile_point_claims
  FOR SELECT
  TO authenticated
  USING (public.has_permission('profile_points.read'::public.app_permission));
