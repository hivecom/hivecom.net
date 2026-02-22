-- Forum storage RLS: allow authenticated uploads to staging directory.
-- This enables assets to land before a discussion exists.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Allow authenticated uploads to forums staging directory'
  ) THEN
    DROP POLICY "Allow authenticated uploads to forums staging directory"
      ON storage.objects;
  END IF;
END
$$;

CREATE POLICY "Allow authenticated uploads to forums staging directory"
  ON storage.objects
  AS permissive
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'hivecom-content-forums'
    AND array_length(storage.foldername(name), 1) = 1
    AND (storage.foldername(name))[1] = 'staging'
    AND split_part(storage.filename(name), '.', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}(-[a-z0-9]+(?:-[a-z0-9]+)*)?$'
  );

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Allow authenticated updates in forums staging directory'
  ) THEN
    DROP POLICY "Allow authenticated updates in forums staging directory"
      ON storage.objects;
  END IF;
END
$$;

CREATE POLICY "Allow authenticated updates in forums staging directory"
  ON storage.objects
  AS permissive
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'hivecom-content-forums'
    AND authorize('discussions.update'::public.app_permission)
    AND array_length(storage.foldername(name), 1) = 1
    AND (storage.foldername(name))[1] = 'staging'
    AND split_part(storage.filename(name), '.', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}(-[a-z0-9]+(?:-[a-z0-9]+)*)?$'
  )
  WITH CHECK (
    bucket_id = 'hivecom-content-forums'
    AND authorize('discussions.update'::public.app_permission)
    AND array_length(storage.foldername(name), 1) = 1
    AND (storage.foldername(name))[1] = 'staging'
    AND split_part(storage.filename(name), '.', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}(-[a-z0-9]+(?:-[a-z0-9]+)*)?$'
  );

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Allow authenticated deletes in forums staging directory'
  ) THEN
    DROP POLICY "Allow authenticated deletes in forums staging directory"
      ON storage.objects;
  END IF;
END
$$;

CREATE POLICY "Allow authenticated deletes in forums staging directory"
  ON storage.objects
  AS permissive
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'hivecom-content-forums'
    AND authorize('discussions.delete'::public.app_permission)
    AND array_length(storage.foldername(name), 1) = 1
    AND (storage.foldername(name))[1] = 'staging'
  );
