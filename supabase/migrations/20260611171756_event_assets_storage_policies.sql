-- Storage policies for event markdown media assets in hivecom-content-static.
-- Any authenticated user can INSERT under events/ (mirrors the events table RLS
-- which lets any non-banned user create non-official events).
-- UPDATE and DELETE are restricted to users with events.update / events.delete
-- permissions (admins and moderators).
-- SELECT is covered by the blanket "Allow public SELECT all static assets in storage"
-- policy added in 20260529020554_static_bucket_blanket_select_policy.sql.

DROP POLICY IF EXISTS "Allow authenticated users to INSERT event assets in storage" ON storage.objects;

CREATE POLICY "Allow authenticated users to INSERT event assets in storage" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'hivecom-content-static'
    AND name LIKE 'events/%'
  );

DROP POLICY IF EXISTS "Allow authorized roles to UPDATE event assets in storage" ON storage.objects;

CREATE POLICY "Allow authorized roles to UPDATE event assets in storage" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'hivecom-content-static'
    AND name LIKE 'events/%'
    AND public.has_permission('events.update'::public.app_permission)
  )
  WITH CHECK (
    bucket_id = 'hivecom-content-static'
    AND name LIKE 'events/%'
    AND public.has_permission('events.update'::public.app_permission)
  );

DROP POLICY IF EXISTS "Allow authorized roles to DELETE event assets in storage" ON storage.objects;

CREATE POLICY "Allow authorized roles to DELETE event assets in storage" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'hivecom-content-static'
    AND name LIKE 'events/%'
    AND public.has_permission('events.delete'::public.app_permission)
  );
