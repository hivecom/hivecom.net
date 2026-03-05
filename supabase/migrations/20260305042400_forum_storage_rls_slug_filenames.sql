-- Forum storage RLS: update filename regexes to allow the {uuid}--{slug}
-- naming pattern produced by RichTextImageMenu.vue's updateMedia() function.
--
-- The image context menu lets users attach alt-text (a "slug") to an already-
-- uploaded image.  When they hit Save the component:
--   1. downloads the existing file (staging/<uuid>.ext or <discussion>/<user>/<uuid>.ext)
--   2. removes the old file
--   3. re-uploads it under a new path: <same-prefix>/<new-uuid>--<slug>.ext
--
-- The double-dash separator was intentional (see the comment in
-- RichTextImageMenu.vue) to make slug-named files visually distinct from
-- plain UUID files.  However the INSERT policies for both the staging
-- directory and the user-scoped paths only accepted:
--
--   staging policy       : ^{uuid}(-[a-z0-9]+(?:-[a-z0-9]+)*)?$
--   user-scoped policy   : ^({uuid}|{slug})$
--
-- Neither permits "{uuid}--{slug}" because the staging regex expects a
-- single leading dash before the slug part, and the user-scoped regex
-- accepts a UUID or a slug but not a combined form.
--
-- Fix: replace both regexes so the UUID alternative may optionally be
-- followed by a double-dash and then a normal slug:
--
--   staging / update     : ^{uuid}(--[a-z0-9]+(?:-[a-z0-9]+)*)?$
--   user-scoped paths    : ^({uuid}(--[a-z0-9]+(?:-[a-z0-9]+)*)?|{slug})$
--
-- All three DML operations (INSERT, UPDATE, DELETE) that carry a filename
-- check are updated so that slug-named files can be uploaded, replaced, and
-- removed without hitting an RLS violation.

-- ============================================================
-- 1. Staging directory policies
-- ============================================================

DROP POLICY IF EXISTS "Allow authenticated uploads to forums staging directory"
  ON storage.objects;

CREATE POLICY "Allow authenticated uploads to forums staging directory"
  ON storage.objects
  AS permissive
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'hivecom-content-forums'
    AND array_length(storage.foldername(name), 1) = 1
    AND (storage.foldername(name))[1] = 'staging'
    AND split_part(storage.filename(name), '.', 1) ~*
        '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}(--[a-z0-9]+(?:-[a-z0-9]+)*)?$'
  );

DROP POLICY IF EXISTS "Allow authenticated updates in forums staging directory"
  ON storage.objects;

CREATE POLICY "Allow authenticated updates in forums staging directory"
  ON storage.objects
  AS permissive
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'hivecom-content-forums'
    AND public.has_permission('discussions.update'::public.app_permission)
    AND array_length(storage.foldername(name), 1) = 1
    AND (storage.foldername(name))[1] = 'staging'
    AND split_part(storage.filename(name), '.', 1) ~*
        '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}(--[a-z0-9]+(?:-[a-z0-9]+)*)?$'
  )
  WITH CHECK (
    bucket_id = 'hivecom-content-forums'
    AND public.has_permission('discussions.update'::public.app_permission)
    AND array_length(storage.foldername(name), 1) = 1
    AND (storage.foldername(name))[1] = 'staging'
    AND split_part(storage.filename(name), '.', 1) ~*
        '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}(--[a-z0-9]+(?:-[a-z0-9]+)*)?$'
  );

-- ============================================================
-- 2. User-scoped path policies  (<discussion_uuid>/<user_uuid>/…)
-- ============================================================

DROP POLICY IF EXISTS "Allow authenticated uploads to forums bucket with user-scoped paths"
  ON storage.objects;

CREATE POLICY "Allow authenticated uploads to forums bucket with user-scoped paths"
  ON storage.objects
  AS permissive
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'hivecom-content-forums'
    AND array_length(storage.foldername(name), 1) = 2
    AND (storage.foldername(name))[1] ~*
        '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    AND (storage.foldername(name))[2] = auth.uid()::text
    AND split_part(storage.filename(name), '.', 1) ~*
        '^([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}(--[a-z0-9]+(?:-[a-z0-9]+)*)?|[a-z0-9]+(?:-[a-z0-9]+)*)$'
  );

DROP POLICY IF EXISTS "Allow authenticated updates in forums bucket with user-scoped paths"
  ON storage.objects;

CREATE POLICY "Allow authenticated updates in forums bucket with user-scoped paths"
  ON storage.objects
  AS permissive
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'hivecom-content-forums'
    AND array_length(storage.foldername(name), 1) = 2
    AND (storage.foldername(name))[1] ~*
        '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    AND (storage.foldername(name))[2] = auth.uid()::text
    AND split_part(storage.filename(name), '.', 1) ~*
        '^([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}(--[a-z0-9]+(?:-[a-z0-9]+)*)?|[a-z0-9]+(?:-[a-z0-9]+)*)$'
  )
  WITH CHECK (
    bucket_id = 'hivecom-content-forums'
    AND array_length(storage.foldername(name), 1) = 2
    AND (storage.foldername(name))[1] ~*
        '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    AND (storage.foldername(name))[2] = auth.uid()::text
    AND split_part(storage.filename(name), '.', 1) ~*
        '^([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}(--[a-z0-9]+(?:-[a-z0-9]+)*)?|[a-z0-9]+(?:-[a-z0-9]+)*)$'
  );

DROP POLICY IF EXISTS "Allow authenticated deletes in forums bucket with user-scoped paths"
  ON storage.objects;

CREATE POLICY "Allow authenticated deletes in forums bucket with user-scoped paths"
  ON storage.objects
  AS permissive
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'hivecom-content-forums'
    AND array_length(storage.foldername(name), 1) = 2
    AND (storage.foldername(name))[1] ~*
        '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    AND (storage.foldername(name))[2] = auth.uid()::text
    AND split_part(storage.filename(name), '.', 1) ~*
        '^([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}(--[a-z0-9]+(?:-[a-z0-9]+)*)?|[a-z0-9]+(?:-[a-z0-9]+)*)$'
  );
