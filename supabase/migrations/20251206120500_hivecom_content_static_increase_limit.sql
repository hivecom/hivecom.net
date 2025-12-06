-- Increase the hivecom-content-static bucket max file size to 5 MB.
UPDATE
  storage.buckets
SET
  file_size_limit = 5242880
WHERE
  id = 'hivecom-content-static';

