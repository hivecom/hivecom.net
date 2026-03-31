-- ─────────────────────────────────────────────────────────────────────────────
-- Themes: RLS policy updates and role permissions
--
-- Part 2 of 2. Depends on the themes.* app_permission enum values added in
-- part 1 (themes_flags_enum_and_usage_view) being committed first.
--
-- Changes:
--   1. Seeds themes.{create,read,update,delete} for the admin role.
--   2. Replaces the user self-delete policy with an admin-only hard-delete.
--      Soft-disassociation is done by setting is_unmaintained = true via the
--      update policy; permanent removal is an admin action only.
--   3. Adds admin INSERT / UPDATE policies so admins operating under the
--      authenticated role (not service_role) can manage official themes.
--   4. Tightens the user INSERT and UPDATE policies to block is_official = true,
--      ensuring regular users can never create or promote official themes.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Role permissions ───────────────────────────────────────────────────────

INSERT INTO public.role_permissions (role, permission)
VALUES
  ('admin', 'themes.create'),
  ('admin', 'themes.read'),
  ('admin', 'themes.update'),
  ('admin', 'themes.delete')
ON CONFLICT (role, permission) DO NOTHING;

-- ── 2. DELETE: admin-only hard delete ─────────────────────────────────────────
-- Regular users can no longer hard-delete themes. Use is_unmaintained = true
-- via the UPDATE policy to soft-disassociate from a theme instead.

DROP POLICY IF EXISTS "Users can delete their own themes" ON public.themes;

CREATE POLICY "Admins can delete any theme"
  ON public.themes
  FOR DELETE TO authenticated
  USING (authorize('themes.delete'::public.app_permission));

-- ── 3. Admin INSERT / UPDATE policies ─────────────────────────────────────────
-- Covers the case where an admin is operating as an authenticated user (not
-- service_role). service_role already bypasses RLS entirely.

CREATE POLICY "Admins can create any theme"
  ON public.themes
  FOR INSERT TO authenticated
  WITH CHECK (authorize('themes.create'::public.app_permission));

CREATE POLICY "Admins can update any theme"
  ON public.themes
  FOR UPDATE TO authenticated
  USING    (authorize('themes.update'::public.app_permission))
  WITH CHECK (authorize('themes.update'::public.app_permission));

-- ── 4. Tighten user INSERT policy ─────────────────────────────────────────────
-- Guard is_official = false so a regular user can never insert an official
-- theme regardless of what they pass in the payload.

DROP POLICY IF EXISTS "Users can create their own themes" ON public.themes;

CREATE POLICY "Users can create their own themes"
  ON public.themes
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by IS NOT NULL
    AND public.is_owner(created_by)
    AND is_official = false
  );

-- ── 5. Tighten user UPDATE policy ─────────────────────────────────────────────
-- USING: users may only target non-official themes they own, preventing them
--        from updating official themes even if they somehow matched created_by.
-- WITH CHECK: prevents promoting a theme to official mid-update.

DROP POLICY IF EXISTS "Users can update their own themes" ON public.themes;

CREATE POLICY "Users can update their own themes"
  ON public.themes
  FOR UPDATE TO authenticated
  USING (
    created_by IS NOT NULL
    AND public.is_owner(created_by)
    AND is_official = false
  )
  WITH CHECK (
    created_by IS NOT NULL
    AND public.is_owner(created_by)
    AND is_official = false
  );
