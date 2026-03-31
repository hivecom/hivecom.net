-- ─────────────────────────────────────────────────────────────────────────────
-- Themes: flags, CRUD permissions, usage view, owner-deleted trigger
--
-- Part 1 of 2. Part 2 (themes_rls_and_permissions) depends on the enum values
-- added here being committed first, so they live in a separate migration file.
--
-- Changes:
--   1. is_unmaintained — soft-disassociation flag; set manually by the author
--      or automatically when their account is deleted.
--   2. is_official — marks Hivecom-curated themes (e.g. accessibility presets).
--      Settable only via service_role or an admin (enforced in part 2 RLS).
--   3. app_permission gains themes.{create,read,update,delete} CRUD values.
--   4. theme_usage view — GROUP BY theme_id on profiles, backed by the existing
--      profiles_theme_id_idx. Consumers JOIN this to get per-theme user counts
--      without hitting profiles on every themes query.
--   5. handle_theme_owner_deleted trigger — when the FK nulls created_by on
--      user deletion, automatically flips is_unmaintained = true (unless the
--      theme is official, which has no owner by design).
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. New columns ────────────────────────────────────────────────────────────

ALTER TABLE public.themes
  ADD COLUMN IF NOT EXISTS is_unmaintained boolean NOT NULL DEFAULT false;

ALTER TABLE public.themes
  ADD COLUMN IF NOT EXISTS is_official boolean NOT NULL DEFAULT false;

-- ── 2. Extend app_permission enum ─────────────────────────────────────────────
-- These values are consumed by part 2 once this migration is committed.

ALTER TYPE public.app_permission ADD VALUE IF NOT EXISTS 'themes.create';
ALTER TYPE public.app_permission ADD VALUE IF NOT EXISTS 'themes.read';
ALTER TYPE public.app_permission ADD VALUE IF NOT EXISTS 'themes.update';
ALTER TYPE public.app_permission ADD VALUE IF NOT EXISTS 'themes.delete';

-- ── 3. theme_usage view ───────────────────────────────────────────────────────
-- Counts how many profiles are currently using each theme. Backed by
-- profiles_theme_id_idx so the GROUP BY is cheap. Join against this view when
-- fetching themes rather than doing ad-hoc subqueries.
--
-- Note: SELECT access on profiles is evaluated under the calling user's RLS
-- context. Authenticated users see all profiles (the authenticated SELECT policy
-- includes OR true), so counts are always accurate for logged-in users.

CREATE OR REPLACE VIEW public.theme_usage AS
  SELECT
    theme_id,
    COUNT(*) AS user_count
  FROM public.profiles
  WHERE theme_id IS NOT NULL
  GROUP BY theme_id;

GRANT SELECT ON public.theme_usage TO anon;
GRANT SELECT ON public.theme_usage TO authenticated;
GRANT ALL   ON public.theme_usage TO service_role;

-- ── 4. Trigger: auto-mark unmaintained on owner deletion ──────────────────────
-- The themes_created_by_fkey foreign key already sets created_by → NULL when
-- the referenced auth.users row is deleted. This BEFORE UPDATE trigger detects
-- that specific transition and simultaneously sets is_unmaintained = true, so
-- the theme is correctly labelled without a second update round-trip.
--
-- Official themes are exempt: they intentionally have no owner (created_by IS
-- NULL from the moment they are inserted) and must never be auto-unmaintained.

CREATE OR REPLACE FUNCTION public.handle_theme_owner_deleted()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
AS $$
BEGIN
  IF OLD.created_by IS NOT NULL
     AND NEW.created_by IS NULL
     AND NEW.is_official = false
  THEN
    NEW.is_unmaintained := true;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_theme_owner_deleted
  BEFORE UPDATE OF created_by
  ON public.themes
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_theme_owner_deleted();
