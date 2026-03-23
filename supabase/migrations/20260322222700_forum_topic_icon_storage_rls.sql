-- Forum topic icon storage RLS
--
-- Topic icons are stored in the existing `hivecom-content-forums` bucket under:
--   topics/<topic_uuid>/icon.<ext>
--
-- Upload/update/delete restricted to users with `discussion_topics.update` permission.
-- Public read is already handled by the existing "Allow public read for forums bucket" policy.

-- ── INSERT ────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Allow topic icon uploads in forums bucket'
  ) THEN
    DROP POLICY "Allow topic icon uploads in forums bucket"
      ON storage.objects;
  END IF;
END
$$;

CREATE POLICY "Allow topic icon uploads in forums bucket"
  ON storage.objects
  AS permissive
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'hivecom-content-forums'
    AND authorize('discussion_topics.update'::public.app_permission)
    AND array_length(storage.foldername(name), 1) = 2
    AND (storage.foldername(name))[1] = 'topics'
    AND (storage.foldername(name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    AND storage.filename(name) ~* '^icon\.(webp|png|jpg|jpeg)$'
  );

-- ── UPDATE ────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Allow topic icon updates in forums bucket'
  ) THEN
    DROP POLICY "Allow topic icon updates in forums bucket"
      ON storage.objects;
  END IF;
END
$$;

CREATE POLICY "Allow topic icon updates in forums bucket"
  ON storage.objects
  AS permissive
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'hivecom-content-forums'
    AND authorize('discussion_topics.update'::public.app_permission)
    AND array_length(storage.foldername(name), 1) = 2
    AND (storage.foldername(name))[1] = 'topics'
    AND (storage.foldername(name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    AND storage.filename(name) ~* '^icon\.(webp|png|jpg|jpeg)$'
  )
  WITH CHECK (
    bucket_id = 'hivecom-content-forums'
    AND authorize('discussion_topics.update'::public.app_permission)
    AND array_length(storage.foldername(name), 1) = 2
    AND (storage.foldername(name))[1] = 'topics'
    AND (storage.foldername(name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    AND storage.filename(name) ~* '^icon\.(webp|png|jpg|jpeg)$'
  );

-- ── DELETE ────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Allow topic icon deletes in forums bucket'
  ) THEN
    DROP POLICY "Allow topic icon deletes in forums bucket"
      ON storage.objects;
  END IF;
END
$$;

CREATE POLICY "Allow topic icon deletes in forums bucket"
  ON storage.objects
  AS permissive
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'hivecom-content-forums'
    AND authorize('discussion_topics.update'::public.app_permission)
    AND array_length(storage.foldername(name), 1) = 2
    AND (storage.foldername(name))[1] = 'topics'
    AND (storage.foldername(name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    AND storage.filename(name) ~* '^icon\.(webp|png|jpg|jpeg)$'
  );
