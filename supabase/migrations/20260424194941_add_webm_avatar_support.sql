-- Allow video/webm in the hivecom-content-users bucket
UPDATE storage.buckets
SET allowed_mime_types = array_append(allowed_mime_types, 'video/webm')
WHERE id = 'hivecom-content-users';

-- Drop and recreate the avatar_extension constraint to include 'webm'
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_avatar_extension_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_avatar_extension_check
  CHECK (avatar_extension IS NULL OR avatar_extension IN ('webp', 'gif', 'webm', 'png', 'jpg', 'jpeg'));

-- Update user CRUD avatar storage policy to include avatar.webm
DROP POLICY IF EXISTS "Allow users to CRUD their avatar" ON storage.objects;

CREATE POLICY "Allow users to CRUD their avatar"
ON storage.objects
FOR ALL
USING (
  bucket_id = 'hivecom-content-users'
  AND (
    name = (auth.uid()::text || '/avatar.webp')
    OR name = (auth.uid()::text || '/avatar.gif')
    OR name = (auth.uid()::text || '/avatar.webm')
    OR name = (auth.uid()::text || '/avatar.png')
    OR name = (auth.uid()::text || '/avatar.jpg')
    OR name = (auth.uid()::text || '/avatar.jpeg')
  )
);

-- Update admin delete avatar storage policy to include avatar.webm
DROP POLICY IF EXISTS "Allow authorized roles to DELETE user avatars in storage" ON storage.objects;

CREATE POLICY "Allow authorized roles to DELETE user avatars in storage"
ON storage.objects
FOR DELETE
USING (
  bucket_id = 'hivecom-content-users'
  AND (
    name LIKE '%/avatar.webp'
    OR name LIKE '%/avatar.gif'
    OR name LIKE '%/avatar.webm'
    OR name LIKE '%/avatar.png'
    OR name LIKE '%/avatar.jpg'
    OR name LIKE '%/avatar.jpeg'
  )
  AND public.has_permission('profiles.delete'::public.app_permission)
);
