-- Tighten the broad SELECT policies on public storage buckets so that
-- clients can still fetch individual objects by URL but cannot enumerate
-- (list) the bucket contents.
-- The added condition (name IS NOT NULL AND name <> '') means PostgREST
-- list queries that omit a name filter will return 0 rows.

DROP POLICY "Allow public SELECT cms assets in storage" ON storage.objects;
CREATE POLICY "Allow public SELECT cms assets in storage"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'hivecom-cms'
    AND name IS NOT NULL
    AND name <> ''
  );

DROP POLICY "Allow public read for forums bucket" ON storage.objects;
CREATE POLICY "Allow public read for forums bucket"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'hivecom-content-forums'
    AND name IS NOT NULL
    AND name <> ''
  );

DROP POLICY "Allow users SELECT user content in storage" ON storage.objects;
CREATE POLICY "Allow users SELECT user content in storage"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'hivecom-content-users'
    AND name IS NOT NULL
    AND name <> ''
  );
