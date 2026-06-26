-- Forum bucket: allow audio and archive uploads, bump limit to 50 MB.
-- Previously {application/json, image/*, video/*, text/csv} at 10 MB, which
-- bounced MP3s and zip files server-side before they reached storage.
UPDATE storage.buckets
SET
  allowed_mime_types = '{"application/json","image/*","video/*","audio/*","text/csv","application/zip","application/x-zip-compressed","application/x-7z-compressed","application/vnd.rar","application/x-rar-compressed","application/x-tar","application/gzip","application/x-gzip"}',
  file_size_limit    = 52428800
WHERE id = 'hivecom-content-forums';
