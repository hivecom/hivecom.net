-- Restore topic icon storage RLS policies dropped by the app_permission enum
-- cascade (20260226000000_recreate_app_permission_enum.sql). The original
-- policies in 20260322222700_forum_topic_icon_storage_rls.sql used
-- authorize(...) which was silently dropped; recreated here with
-- public.has_permission(...) consistent with other restored storage policies.
--
-- Topic icons live at: hivecom-content-forums / topics/<topic_uuid>/icon.<ext>
-- Write access requires discussion_topics.update permission.
-- Public read is handled by the existing blanket SELECT policy.

-- ── INSERT ────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Allow topic icon uploads in forums bucket" ON storage.objects;

CREATE POLICY "Allow topic icon uploads in forums bucket"
  ON storage.objects
  AS permissive
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'hivecom-content-forums'
    AND public.has_permission('discussion_topics.update'::public.app_permission)
    AND array_length(storage.foldername(name), 1) = 2
    AND (storage.foldername(name))[1] = 'topics'
    AND (storage.foldername(name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    AND storage.filename(name) ~* '^icon\.(webp|png|jpg|jpeg)$'
  );

-- ── UPDATE ────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Allow topic icon updates in forums bucket" ON storage.objects;

CREATE POLICY "Allow topic icon updates in forums bucket"
  ON storage.objects
  AS permissive
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'hivecom-content-forums'
    AND public.has_permission('discussion_topics.update'::public.app_permission)
    AND array_length(storage.foldername(name), 1) = 2
    AND (storage.foldername(name))[1] = 'topics'
    AND (storage.foldername(name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    AND storage.filename(name) ~* '^icon\.(webp|png|jpg|jpeg)$'
  )
  WITH CHECK (
    bucket_id = 'hivecom-content-forums'
    AND public.has_permission('discussion_topics.update'::public.app_permission)
    AND array_length(storage.foldername(name), 1) = 2
    AND (storage.foldername(name))[1] = 'topics'
    AND (storage.foldername(name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    AND storage.filename(name) ~* '^icon\.(webp|png|jpg|jpeg)$'
  );

-- ── DELETE ────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Allow topic icon deletes in forums bucket" ON storage.objects;

CREATE POLICY "Allow topic icon deletes in forums bucket"
  ON storage.objects
  AS permissive
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'hivecom-content-forums'
    AND public.has_permission('discussion_topics.update'::public.app_permission)
    AND array_length(storage.foldername(name), 1) = 2
    AND (storage.foldername(name))[1] = 'topics'
    AND (storage.foldername(name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    AND storage.filename(name) ~* '^icon\.(webp|png|jpg|jpeg)$'
  );
