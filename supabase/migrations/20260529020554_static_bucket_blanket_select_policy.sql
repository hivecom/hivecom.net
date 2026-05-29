-- Replace per-folder SELECT policies on hivecom-content-static with a single
-- blanket policy. The bucket is public static content - everyone should be
-- able to read/list all objects. Write access remains controlled per-folder
-- by the existing INSERT/UPDATE/DELETE policies.

DROP POLICY IF EXISTS "Allow public SELECT games in storage"             ON storage.objects;
DROP POLICY IF EXISTS "Allow public SELECT project assets in storage"    ON storage.objects;
DROP POLICY IF EXISTS "Allow public SELECT announcement assets in storage" ON storage.objects;
DROP POLICY IF EXISTS "Allow public SELECT metric data in storage"       ON storage.objects;

CREATE POLICY "Allow public SELECT all static assets in storage"
  ON storage.objects
  FOR SELECT
  TO authenticated, anon
  USING (bucket_id = 'hivecom-content-static');
