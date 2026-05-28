-- Add profile_points.read permission and admin RLS policies for profile_points tables.
-- Fix kvstore missing INSERT/UPDATE/DELETE grants for authenticated role.

BEGIN;

-- 1. Add profile_points.read to the app_permission enum
ALTER TYPE public.app_permission ADD VALUE IF NOT EXISTS 'profile_points.read';

COMMIT;

-- Enum value must be committed before use in subsequent statements.

BEGIN;

-- 2. Grant profile_points.read to admin role
INSERT INTO public.role_permissions (role, permission)
VALUES ('admin', 'profile_points.read')
ON CONFLICT DO NOTHING;

-- 3. Admin SELECT policies for profile_points tables
CREATE POLICY "Admins can read all profile_points"
  ON public.profile_points
  FOR SELECT
  TO authenticated
  USING (public.has_permission('profile_points.read'::public.app_permission));

CREATE POLICY "Admins can read all profile_point_history"
  ON public.profile_point_history
  FOR SELECT
  TO authenticated
  USING (public.has_permission('profile_points.read'::public.app_permission));

CREATE POLICY "Admins can read all profile_point_claims"
  ON public.profile_point_claims
  FOR SELECT
  TO authenticated
  USING (public.has_permission('profile_points.read'::public.app_permission));

-- 4. Grant INSERT/UPDATE/DELETE on kvstore to authenticated role.
--    The existing RLS policies already gate these operations via has_permission;
--    the table-level grant was simply missing.
GRANT INSERT, UPDATE, DELETE ON TABLE public.kvstore TO authenticated;

COMMIT;
