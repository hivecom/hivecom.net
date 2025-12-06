-- Allow JSON and video metric snapshots to be uploaded to the hivecom-content-static bucket.
UPDATE
  storage.buckets AS b
SET
  allowed_mime_types =(
    SELECT
      ARRAY_AGG(mime ORDER BY mime)
    FROM ( SELECT DISTINCT
        mime
      FROM (
        SELECT
          UNNEST(COALESCE(b.allowed_mime_types, ARRAY[]::text[])) AS mime
        UNION ALL
        SELECT
          'application/json'
        UNION ALL
        SELECT
          'video/*') existing) dedup)
WHERE
  b.id = 'hivecom-content-static';

-- Ensure the hivecom-content-forums bucket exists with matching MIME support.
INSERT INTO storage.buckets(id, name, owner, created_at, updated_at, public, avif_autodetection, file_size_limit, allowed_mime_types, owner_id)
  VALUES ('hivecom-content-forums', 'hivecom-content-forums', NULL, NOW(), NOW(), TRUE, FALSE, 1048576, '{"image/*","video/*","application/json"}', NULL)
ON CONFLICT (id)
  DO UPDATE SET
    allowed_mime_types = '{"image/*","video/*","application/json"}';

