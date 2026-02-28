-- Allow users (and admins) to manage profile markdown media under {userId}/markdown/
DROP POLICY IF EXISTS "Allow users to INSERT profile markdown media" ON storage.objects;
DROP POLICY IF EXISTS "Allow users to UPDATE profile markdown media" ON storage.objects;
DROP POLICY IF EXISTS "Allow users to DELETE profile markdown media" ON storage.objects;

CREATE POLICY "Allow users to INSERT profile markdown media" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'hivecom-content-users'
    AND (
      name LIKE auth.uid()::text || '/markdown/%'
      OR (public.has_permission('profiles.update'::public.app_permission) AND name LIKE '%/markdown/%')
    )
  );

CREATE POLICY "Allow users to UPDATE profile markdown media" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'hivecom-content-users'
    AND (
      name LIKE auth.uid()::text || '/markdown/%'
      OR (public.has_permission('profiles.update'::public.app_permission) AND name LIKE '%/markdown/%')
    )
  );

CREATE POLICY "Allow users to DELETE profile markdown media" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'hivecom-content-users'
    AND (
      name LIKE auth.uid()::text || '/markdown/%'
      OR (public.has_permission('profiles.update'::public.app_permission) AND name LIKE '%/markdown/%')
    )
  );
