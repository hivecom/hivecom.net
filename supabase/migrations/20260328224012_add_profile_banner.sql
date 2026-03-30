-- Add has_banner column to profiles
-- has_banner: whether the user has uploaded a banner image (stored in storage)

-- Add column
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS has_banner boolean NOT NULL DEFAULT false;

-- Users cannot self-modify has_banner (it is set programmatically when uploading/deleting a banner).
-- Update the profile UPDATE policy to protect the new has_banner column.
DROP POLICY IF EXISTS "Users can UPDATE their information on their profiles" ON public.profiles;

CREATE POLICY "Users can UPDATE their information on their profiles" ON public.profiles AS permissive
  FOR UPDATE TO authenticated
    USING ((auth.uid() = id))
    WITH CHECK (
      (auth.uid() = id)
      AND (NOT (created_at IS DISTINCT FROM created_at))
      AND (NOT (discord_id IS DISTINCT FROM discord_id))
      AND (NOT (patreon_id IS DISTINCT FROM patreon_id))
      AND (NOT (supporter_patreon IS DISTINCT FROM supporter_patreon))
      AND (NOT (supporter_lifetime IS DISTINCT FROM supporter_lifetime))
      AND (NOT (steam_id IS DISTINCT FROM steam_id))
      AND (NOT (badges IS DISTINCT FROM badges))
      AND (NOT (teamspeak_identities IS DISTINCT FROM teamspeak_identities))
      AND (NOT (has_banner IS DISTINCT FROM has_banner))
    );

-- Storage policy: allow users to CRUD their own banner.webp
-- Banners live at {userId}/banner.webp in the hivecom-content-users bucket,
-- right next to the existing avatar files.
CREATE POLICY "Allow users to CRUD their banner" ON storage.objects
  FOR ALL TO authenticated
    USING (
      bucket_id = 'hivecom-content-users'
      AND name = (auth.uid()::text || '/banner.webp')
    );

-- Allow anyone (including anonymous visitors) to read banner images.
-- Banners appear in forum posts which are publicly visible, so anon access is required.
-- Mirrors the "Allow public SELECT games in storage" pattern.
CREATE POLICY "Allow public SELECT user banners in storage" ON storage.objects
  FOR SELECT TO authenticated, anon
    USING (
      bucket_id = 'hivecom-content-users'
      AND name LIKE '%/banner.webp'
    );

-- Allow admins to delete user banners (mirrors the avatar admin policy)
CREATE POLICY "Allow authorized roles to DELETE user banners in storage" ON storage.objects
  FOR DELETE TO authenticated
    USING (
      bucket_id = 'hivecom-content-users'
      AND name LIKE '%/banner.webp'
      AND public.has_permission('profiles.delete'::public.app_permission)
    );
