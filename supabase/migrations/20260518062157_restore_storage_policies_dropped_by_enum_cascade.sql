-- Restore storage policies that were silently dropped by the app_permission enum
-- recreation in 20260226000000_recreate_app_permission_enum.sql.
--
-- When ALTER TYPE ... RENAME TO is used to swap enums, Postgres drops all policies
-- whose qual/with_check expressions reference the old type at the catalog level.
-- The dynamic rebind loop in that migration only caught policies where the old type
-- name appeared as a literal string in pg_policies.qual / with_check, which excluded
-- policies that had already been cast at parse time. These were silently lost.
--
-- The following policy groups were affected:
--   - games storage (INSERT / UPDATE / DELETE) - hivecom-content-static
--   - cms assets (INSERT / UPDATE / DELETE)     - hivecom-cms
--   - user banner admin DELETE                  - hivecom-content-users
--   - profile markdown media (INSERT / UPDATE / DELETE) - hivecom-content-users

-- ============================================================
-- Games assets (hivecom-content-static / games/*)
-- ============================================================

DROP POLICY IF EXISTS "Allow authorized roles to INSERT games in storage" ON storage.objects;
CREATE POLICY "Allow authorized roles to INSERT games in storage" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'hivecom-content-static'
    AND name LIKE 'games/%'
    AND public.has_permission('games.create'::public.app_permission)
  );

DROP POLICY IF EXISTS "Allow authorized roles to UPDATE games in storage" ON storage.objects;
CREATE POLICY "Allow authorized roles to UPDATE games in storage" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'hivecom-content-static'
    AND name LIKE 'games/%'
    AND public.has_permission('games.update'::public.app_permission)
  );

DROP POLICY IF EXISTS "Allow authorized roles to DELETE games in storage" ON storage.objects;
CREATE POLICY "Allow authorized roles to DELETE games in storage" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'hivecom-content-static'
    AND name LIKE 'games/%'
    AND public.has_permission('games.delete'::public.app_permission)
  );

-- ============================================================
-- CMS assets (hivecom-cms)
-- ============================================================

DROP POLICY IF EXISTS "Allow authorized roles to INSERT cms assets in storage" ON storage.objects;
CREATE POLICY "Allow authorized roles to INSERT cms assets in storage" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'hivecom-cms'
    AND public.has_permission('assets.create'::public.app_permission)
  );

DROP POLICY IF EXISTS "Allow authorized roles to UPDATE cms assets in storage" ON storage.objects;
CREATE POLICY "Allow authorized roles to UPDATE cms assets in storage" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'hivecom-cms'
    AND public.has_permission('assets.update'::public.app_permission)
  )
  WITH CHECK (
    bucket_id = 'hivecom-cms'
    AND public.has_permission('assets.update'::public.app_permission)
  );

DROP POLICY IF EXISTS "Allow authorized roles to DELETE cms assets in storage" ON storage.objects;
CREATE POLICY "Allow authorized roles to DELETE cms assets in storage" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'hivecom-cms'
    AND public.has_permission('assets.delete'::public.app_permission)
  );

-- ============================================================
-- User banner admin delete (hivecom-content-users)
-- Last defined in 20260424194942_add_animated_banner_support.sql
-- ============================================================

DROP POLICY IF EXISTS "Allow authorized roles to DELETE user banners in storage" ON storage.objects;
CREATE POLICY "Allow authorized roles to DELETE user banners in storage" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'hivecom-content-users'
    AND (
      name LIKE '%/banner.webp'
      OR name LIKE '%/banner.webm'
      OR name LIKE '%/banner.gif'
    )
    AND public.has_permission('profiles.delete'::public.app_permission)
  );

-- ============================================================
-- Profile markdown media (hivecom-content-users / {userId}/markdown/*)
-- Last defined in 20260228200017_user_markdown_storage_policy.sql
-- ============================================================

DROP POLICY IF EXISTS "Allow users to INSERT profile markdown media" ON storage.objects;
CREATE POLICY "Allow users to INSERT profile markdown media" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'hivecom-content-users'
    AND (
      name LIKE auth.uid()::text || '/markdown/%'
      OR (public.has_permission('profiles.update'::public.app_permission) AND name LIKE '%/markdown/%')
    )
  );

DROP POLICY IF EXISTS "Allow users to UPDATE profile markdown media" ON storage.objects;
CREATE POLICY "Allow users to UPDATE profile markdown media" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'hivecom-content-users'
    AND (
      name LIKE auth.uid()::text || '/markdown/%'
      OR (public.has_permission('profiles.update'::public.app_permission) AND name LIKE '%/markdown/%')
    )
  );

DROP POLICY IF EXISTS "Allow users to DELETE profile markdown media" ON storage.objects;
CREATE POLICY "Allow users to DELETE profile markdown media" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'hivecom-content-users'
    AND (
      name LIKE auth.uid()::text || '/markdown/%'
      OR (public.has_permission('profiles.update'::public.app_permission) AND name LIKE '%/markdown/%')
    )
  );
