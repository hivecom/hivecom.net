-- Add avatar.gif support to storage policies for user avatars

-- Drop and recreate the user self-service avatar CRUD policy
DROP POLICY IF EXISTS "Allow users to CRUD their avatar" ON storage.objects;

CREATE POLICY "Allow users to CRUD their avatar"
ON storage.objects
FOR ALL
USING (
  bucket_id = 'hivecom-content-users'
  AND (
    name = (auth.uid()::text || '/avatar.webp')
    OR name = (auth.uid()::text || '/avatar.gif')
    OR name = (auth.uid()::text || '/avatar.png')
    OR name = (auth.uid()::text || '/avatar.jpg')
    OR name = (auth.uid()::text || '/avatar.jpeg')
  )
);

-- Drop and recreate the admin avatar delete policy
DROP POLICY IF EXISTS "Allow authorized roles to DELETE user avatars in storage" ON storage.objects;

CREATE POLICY "Allow authorized roles to DELETE user avatars in storage"
ON storage.objects
FOR DELETE
USING (
  bucket_id = 'hivecom-content-users'
  AND (
    name LIKE '%/avatar.webp'
    OR name LIKE '%/avatar.gif'
    OR name LIKE '%/avatar.png'
    OR name LIKE '%/avatar.jpg'
    OR name LIKE '%/avatar.jpeg'
  )
  AND has_permission('profiles.delete'::app_permission)
);
