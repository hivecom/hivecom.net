-- Fix avatar storage policy to allow user-specific avatar paths with multiple extensions
-- Drop the existing policies
DROP POLICY IF EXISTS "Allow users to CRUD their avatar.png" ON storage.objects;

DROP POLICY IF EXISTS "Allow users to CRUD their avatar.webp" ON storage.objects;

-- Create the corrected avatar upload policy that allows {userId}/avatar.{extension} format
-- This supports WebP (new), PNG, JPG, and JPEG extensions for backward compatibility
CREATE POLICY "Allow users to CRUD their avatar" ON storage.objects
  FOR ALL TO authenticated
    USING (bucket_id = 'hivecom-content-users'
      AND (name =(auth.uid()::text || '/avatar.webp') OR name =(auth.uid()::text || '/avatar.png') OR name =(auth.uid()::text || '/avatar.jpg') OR name =(auth.uid()::text || '/avatar.jpeg')));

CREATE POLICY "Allow users SELECT user content in storage" ON storage.objects
  FOR SELECT TO authenticated
    USING (bucket_id = 'hivecom-content-users');

-- Drop the existing games storage policies
DROP POLICY IF EXISTS "Allow authorized roles to CRUD games in storage" ON storage.objects;

DROP POLICY IF EXISTS "Allow authorized roles to INSERT games in storage" ON storage.objects;

DROP POLICY IF EXISTS "Allow authorized roles to UPDATE games in storage" ON storage.objects;

DROP POLICY IF EXISTS "Allow authorized roles to DELETE games in storage" ON storage.objects;

DROP POLICY IF EXISTS "Allow public SELECT games in storage" ON storage.objects;

-- Add updated games storage policies with proper bucket scoping
-- These policies allow users with games.create/update/delete permissions to manage game assets
-- in the hivecom-content-static bucket under the games/ directory
-- Policy for inserting/uploading game assets
CREATE POLICY "Allow authorized roles to INSERT games in storage" ON storage.objects
  FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'hivecom-content-static' AND name LIKE 'games/%'
    AND public.has_permission('games.create'::public.app_permission));

-- Policy for updating game assets
CREATE POLICY "Allow authorized roles to UPDATE games in storage" ON storage.objects
  FOR UPDATE TO authenticated
    USING (bucket_id = 'hivecom-content-static' AND name LIKE 'games/%'
      AND public.has_permission('games.update'::public.app_permission));

-- Policy for deleting game assets
CREATE POLICY "Allow authorized roles to DELETE games in storage" ON storage.objects
  FOR DELETE TO authenticated
    USING (bucket_id = 'hivecom-content-static' AND name LIKE 'games/%'
      AND public.has_permission('games.delete'::public.app_permission));

-- Policy for selecting/reading game assets (needed for uploads and public access)
CREATE POLICY "Allow public SELECT games in storage" ON storage.objects
  FOR SELECT TO authenticated, anon
    USING (bucket_id = 'hivecom-content-static' AND name LIKE 'games/%');

-- Policy for admins to delete user profile images/avatars (supports multiple extensions)
CREATE POLICY "Allow authorized roles to DELETE user avatars in storage" ON storage.objects
  FOR DELETE TO authenticated
    USING (bucket_id = 'hivecom-content-users'
      AND (name LIKE '%/avatar.webp' OR name LIKE '%/avatar.png' OR name LIKE '%/avatar.jpg' OR name LIKE '%/avatar.jpeg')
      AND public.has_permission('profiles.delete'::public.app_permission));

