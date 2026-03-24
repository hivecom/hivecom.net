-- Update forums bucket: add CSV support and set 10 MB limit.
UPDATE storage.buckets
SET
  allowed_mime_types = '{"application/json","image/*","video/*","text/csv"}',
  file_size_limit    = 10485760
WHERE id = 'hivecom-content-forums';

-- Update static bucket: add CSV support.
UPDATE storage.buckets
SET
  allowed_mime_types = '{"application/json","image/*","video/*","text/csv"}'
WHERE id = 'hivecom-content-static';

-- Update CMS bucket: allow all file types and set 50 MB limit.
UPDATE storage.buckets
SET
  allowed_mime_types = NULL,
  file_size_limit    = 52428800
WHERE id = 'hivecom-cms';
