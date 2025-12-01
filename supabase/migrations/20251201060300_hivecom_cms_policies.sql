-- Seed CMS asset permissions, ensure the hivecom-cms bucket, and configure storage policies.
-- Grant CMS asset permissions to admin and moderator roles
INSERT INTO public.role_permissions(role, permission)
SELECT
  'admin',
  perms.permission
FROM (
  VALUES ('assets.create'::public.app_permission),
('assets.delete'::public.app_permission),
('assets.read'::public.app_permission),
('assets.update'::public.app_permission)) AS perms(permission)
WHERE
  NOT EXISTS (
    SELECT
      1
    FROM
      public.role_permissions rp
    WHERE
      rp.role = 'admin'
      AND rp.permission = perms.permission);

INSERT INTO public.role_permissions(role, permission)
SELECT
  'moderator',
  perms.permission
FROM (
  VALUES ('assets.create'::public.app_permission),
('assets.delete'::public.app_permission),
('assets.read'::public.app_permission),
('assets.update'::public.app_permission)) AS perms(permission)
WHERE
  NOT EXISTS (
    SELECT
      1
    FROM
      public.role_permissions rp
    WHERE
      rp.role = 'moderator'
      AND rp.permission = perms.permission);

-- Ensure the hivecom-cms bucket exists for CMS assets
INSERT INTO storage.buckets(id, name, owner, created_at, updated_at, public, avif_autodetection, file_size_limit, allowed_mime_types, owner_id)
  VALUES ('hivecom-cms', 'hivecom-cms', NULL, NOW(), NOW(), TRUE, FALSE, 5242880, '{"image/*"}', NULL)
ON CONFLICT (id)
  DO NOTHING;

-- Allow admin and moderator roles (via permissions) to manage CMS assets
DROP POLICY IF EXISTS "Allow authorized roles to INSERT cms assets in storage" ON storage.objects;

CREATE POLICY "Allow authorized roles to INSERT cms assets in storage" ON storage.objects
  FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'hivecom-cms'
    AND public.has_permission('assets.create'::public.app_permission));

DROP POLICY IF EXISTS "Allow authorized roles to UPDATE cms assets in storage" ON storage.objects;

CREATE POLICY "Allow authorized roles to UPDATE cms assets in storage" ON storage.objects
  FOR UPDATE TO authenticated
    USING (bucket_id = 'hivecom-cms'
      AND public.has_permission('assets.update'::public.app_permission))
      WITH CHECK (bucket_id = 'hivecom-cms'
      AND public.has_permission('assets.update'::public.app_permission));

DROP POLICY IF EXISTS "Allow authorized roles to DELETE cms assets in storage" ON storage.objects;

CREATE POLICY "Allow authorized roles to DELETE cms assets in storage" ON storage.objects
  FOR DELETE TO authenticated
    USING (bucket_id = 'hivecom-cms'
      AND public.has_permission('assets.delete'::public.app_permission));

DROP POLICY IF EXISTS "Allow public SELECT cms assets in storage" ON storage.objects;

CREATE POLICY "Allow public SELECT cms assets in storage" ON storage.objects
  FOR SELECT TO authenticated, anon
    USING (bucket_id = 'hivecom-cms');

