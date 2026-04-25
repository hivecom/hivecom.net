-- Ensure video/webm is present in hivecom-content-users allowed MIME types.
-- This was previously added via array_append in 20260424194941 but the live
-- bucket only shows {"image/*"}, so we set the full list explicitly.
UPDATE storage.buckets
SET allowed_mime_types = '{"image/*","video/webm"}'
WHERE id = 'hivecom-content-users'
  AND NOT (allowed_mime_types @> ARRAY['video/webm']);
