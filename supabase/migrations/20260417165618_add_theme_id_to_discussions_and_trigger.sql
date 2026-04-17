-- Add theme_id column to discussions
ALTER TABLE public.discussions
  ADD COLUMN IF NOT EXISTS theme_id uuid
    REFERENCES public.themes(id)
    ON DELETE SET NULL;

COMMENT ON COLUMN public.discussions.theme_id IS
  'Theme ID this discussion is bound to (entity-linked, no topic assigned).';

-- Index for FK lookups
CREATE INDEX IF NOT EXISTS discussions_theme_id_idx
  ON public.discussions (theme_id)
  WHERE theme_id IS NOT NULL;

-- Auto-create a discussion when a theme is inserted
DROP TRIGGER IF EXISTS create_discussion_on_theme ON public.themes;
CREATE TRIGGER create_discussion_on_theme
  AFTER INSERT ON public.themes
  FOR EACH ROW
  EXECUTE FUNCTION public.create_discussion_for_entity('theme_id', NULL);
