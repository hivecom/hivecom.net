-- Allow any authenticated user to delete their own staged media.
--
-- The staging path structure is flat: staging/<filename>
-- There is no user segment in the path, so we cannot scope by folder name.
-- Instead we use the storage.objects.owner column, which Supabase automatically
-- sets to auth.uid() at upload time.
--
-- Before this migration, the only staging DELETE policy required the
-- discussions.delete permission, meaning ordinary users could upload media to
-- staging but were blocked from deleting it. This broke two flows in
-- RichTextImageMenu for any user without that elevated permission:
--
--   1. "Delete media" - calls remove() on the staged file directly.
--   2. "Save" (update alt text) - downloads the old file, removes it, then
--      re-uploads it under a new slug-based path. The remove() step failed,
--      leaving orphaned objects and making the upload appear to succeed while
--      the old file remained.

DROP POLICY IF EXISTS "Allow authenticated deletes in forums staging directory"
  ON storage.objects;

CREATE POLICY "Allow authenticated deletes in forums staging directory"
  ON storage.objects
  AS permissive
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'hivecom-content-forums'
    AND array_length(storage.foldername(name), 1) = 1
    AND (storage.foldername(name))[1] = 'staging'
    AND (
      -- Any user may delete staging files they originally uploaded.
      owner = auth.uid()
      -- Privileged users (moderators / admins) retain blanket delete access.
      OR public.has_permission('discussions.delete'::public.app_permission)
    )
  );
