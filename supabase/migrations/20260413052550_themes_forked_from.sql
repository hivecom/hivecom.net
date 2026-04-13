-- ─────────────────────────────────────────────────────────────────────────────
-- Themes: forked_from
--
-- Adds a self-referential nullable FK so that when a user copies a theme,
-- the new theme can record which theme it was forked from.
--
-- SET NULL on delete: if the source theme is removed, the fork survives
-- with forked_from = NULL (lineage lost, but the fork itself is unaffected).
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.themes
  ADD COLUMN IF NOT EXISTS "forked_from" uuid;

ALTER TABLE public.themes
  ADD CONSTRAINT "themes_forked_from_fkey"
  FOREIGN KEY (forked_from) REFERENCES public.themes(id)
  ON UPDATE CASCADE ON DELETE SET NULL NOT VALID;

ALTER TABLE public.themes VALIDATE CONSTRAINT "themes_forked_from_fkey";

-- A theme cannot be its own ancestor at the immediate level.
ALTER TABLE public.themes
  ADD CONSTRAINT "themes_forked_from_not_self" CHECK (forked_from <> id);

-- Index for reverse lookups: "which themes were forked from this one?"
CREATE INDEX IF NOT EXISTS themes_forked_from_idx ON public.themes USING btree(forked_from);
