-- Add banner_extension column to profiles to track animated banner formats.
-- NULL means no banner (or legacy webp where has_banner is true but extension unknown).
-- Set on upload, cleared on delete.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS banner_extension text DEFAULT NULL;

COMMENT ON COLUMN public.profiles.banner_extension IS
  'File extension of the stored banner (webp, webm, gif). NULL means no banner. Set on upload, cleared on delete.';

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_banner_extension_check
  CHECK (banner_extension IS NULL OR banner_extension IN ('webp', 'webm', 'gif'));

-- Protect banner_extension from self-modification (same pattern as has_banner).
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
      AND (NOT (banner_extension IS DISTINCT FROM banner_extension))
    );

-- Update user CRUD banner storage policy to include animated formats.
DROP POLICY IF EXISTS "Allow users to CRUD their banner" ON storage.objects;

CREATE POLICY "Allow users to CRUD their banner" ON storage.objects
  FOR ALL TO authenticated
    USING (
      bucket_id = 'hivecom-content-users'
      AND (
        name = (auth.uid()::text || '/banner.webp')
        OR name = (auth.uid()::text || '/banner.webm')
        OR name = (auth.uid()::text || '/banner.gif')
      )
    );

-- Update public SELECT policy to include animated formats.
DROP POLICY IF EXISTS "Allow public SELECT user banners in storage" ON storage.objects;

CREATE POLICY "Allow public SELECT user banners in storage" ON storage.objects
  FOR SELECT TO authenticated, anon
    USING (
      bucket_id = 'hivecom-content-users'
      AND (
        name LIKE '%/banner.webp'
        OR name LIKE '%/banner.webm'
        OR name LIKE '%/banner.gif'
      )
    );

-- Update admin delete policy to include animated formats.
DROP POLICY IF EXISTS "Allow authorized roles to DELETE user banners in storage" ON storage.objects;

CREATE POLICY "Allow authorized roles to DELETE user banners in storage" ON storage.objects
  FOR DELETE TO authenticated
    USING (
      bucket_id = 'hivecom-content-users'
      AND (
        name LIKE '%/banner.webp'
        OR name LIKE '%/banner.webm'
        OR name LIKE '%/banner.gif'
      )
      AND public.has_permission('profiles.delete'::public.app_permission)
    );
