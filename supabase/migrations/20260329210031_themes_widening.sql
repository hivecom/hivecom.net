-- Add widening column to themes
--
-- widening: integer 0-100 that controls how much wider the page container is
-- rendered beyond its default width. 0 = default (no change), 100 = full
-- available width, 50 = halfway between default and full width.

ALTER TABLE public.themes
  ADD COLUMN IF NOT EXISTS widening smallint NOT NULL DEFAULT 0;

ALTER TABLE public.themes
  ADD CONSTRAINT themes_widening_range
  CHECK (widening BETWEEN 0 AND 100);
