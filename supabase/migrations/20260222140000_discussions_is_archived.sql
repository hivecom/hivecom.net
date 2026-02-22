-- Add is_archived column to discussions
ALTER TABLE public.discussions
  ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.discussions.is_archived IS 'Marks discussions as archived (read-only or hidden in listings).';
