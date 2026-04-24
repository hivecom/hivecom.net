-- Add avatar_extension column to profiles to eliminate storage list() calls on avatar lookup.
-- NULL means the user has no avatar. Set on upload, cleared on delete.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS avatar_extension text DEFAULT NULL;

COMMENT ON COLUMN public.profiles.avatar_extension IS
  'File extension of the stored avatar (e.g. webp, gif, png). NULL means no avatar. Set on upload, cleared on delete.';

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_avatar_extension_check
  CHECK (avatar_extension IS NULL OR avatar_extension IN ('webp', 'gif', 'png', 'jpg', 'jpeg'));
