-- Add INSERT, UPDATE, DELETE policies for project assets in hivecom-content-static bucket.
-- Previously only a SELECT policy existed, causing RLS violations on banner uploads.

CREATE POLICY "Allow authorized roles to INSERT project assets in storage"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'hivecom-content-static'
  AND name LIKE 'projects/%'
  AND has_permission('projects.create'::app_permission)
);

CREATE POLICY "Allow authorized roles to UPDATE project assets in storage"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'hivecom-content-static'
  AND name LIKE 'projects/%'
  AND has_permission('projects.update'::app_permission)
)
WITH CHECK (
  bucket_id = 'hivecom-content-static'
  AND name LIKE 'projects/%'
  AND has_permission('projects.update'::app_permission)
);

CREATE POLICY "Allow authorized roles to DELETE project assets in storage"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'hivecom-content-static'
  AND name LIKE 'projects/%'
  AND has_permission('projects.delete'::app_permission)
);
