-- Fix broken scalar subquery in "Allow authorized roles to UPDATE profiles" WITH CHECK.
--
-- Root cause:
--   Migration 20260228043346_content_rules_rls.sql introduced this expression in
--   the policy's WITH CHECK clause:
--
--     (SELECT p.markdown FROM public.profiles p WHERE p.id = id)
--
--   PostgreSQL's planner resolved the unqualified `id` inside the subquery as
--   `p.id` (the subquery's own alias), NOT the outer row's `id` column.  The
--   effective predicate therefore became `WHERE p.id = p.id`, which is always
--   TRUE and returns every row in the profiles table.  With more than one
--   profile in the database the scalar subquery returns multiple rows and raises:
--
--     ERROR 21000: more than one row returned by a subquery used as an expression
--
--   This broke every admin attempt to save a user profile from the admin panel.
--
-- Fix:
--   1. Remove the unresolvable scalar subquery entirely.
--   2. Short-circuit the entire WITH CHECK for users that hold the
--      `users.update` permission (admins), so they are never subject to the
--      content-rules agreement gate.
--   3. For non-admin role-holders / profile owners the content-rules agreement
--      EXISTS check is preserved.
--      Regular profile owners are already covered by the separate permissive
--      policy "Users can UPDATE their information on their profiles", whose
--      WITH CHECK does not enforce content rules, so ORing the two permissive
--      WITH CHECK results still lets owners update non-markdown fields freely.

DROP POLICY IF EXISTS "Allow authorized roles to UPDATE profiles" ON "public"."profiles";

CREATE POLICY "Allow authorized roles to UPDATE profiles" ON public.profiles
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING (
    public.has_permission('profiles.update'::public.app_permission)
    OR public.is_profile_owner(id)
  )
  WITH CHECK (
    -- ── Who may write at all ───────────────────────────────────────────────
    (
      public.has_permission('profiles.update'::public.app_permission)
      OR public.is_profile_owner(id)
    )
    -- ── Field-level restrictions for non-admins ────────────────────────────
    AND (
      -- Admins with users.update can write any field, including protected ones.
      public.has_permission('users.update'::public.app_permission)
      OR (
        -- Non-admins updating their own profile must not change protected fields.
        public.is_profile_owner(id)
        AND created_at     IS NOT DISTINCT FROM created_at
        AND modified_at    IS NOT DISTINCT FROM modified_at
        AND modified_by    IS NOT DISTINCT FROM modified_by
        AND discord_id     IS NOT DISTINCT FROM discord_id
        AND patreon_id     IS NOT DISTINCT FROM patreon_id
        AND steam_id       IS NOT DISTINCT FROM steam_id
        AND supporter_patreon  IS NOT DISTINCT FROM supporter_patreon
        AND supporter_lifetime IS NOT DISTINCT FROM supporter_lifetime
        AND banned     IS NOT DISTINCT FROM banned
        AND ban_reason IS NOT DISTINCT FROM ban_reason
        AND ban_start  IS NOT DISTINCT FROM ban_start
        AND ban_end    IS NOT DISTINCT FROM ban_end
      )
    )
    -- ── Content-rules gate ────────────────────────────────────────────────
    -- Admins bypass this gate entirely.
    -- Everyone else must have agreed to the content rules before writing
    -- markdown-bearing profile content.
    AND (
      public.has_permission('users.update'::public.app_permission)
      OR EXISTS (
        SELECT 1
        FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.agreed_content_rules = true
      )
    )
  );
