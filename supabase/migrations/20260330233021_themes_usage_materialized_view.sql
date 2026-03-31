-- Convert theme_usage from a regular view to a materialized view
--
-- A regular view re-runs the underlying query on every access. A materialized
-- view stores the result and serves it from cache, which is what was originally
-- intended when this was designed ("not hitting the database over and over to
-- do a rather expensive query").
--
-- The materialized view is refreshed by a trigger on profiles that fires after
-- any INSERT, UPDATE OF theme_id, or DELETE — keeping counts current without
-- any manual refresh step.
--
-- Note: REFRESH MATERIALIZED VIEW CONCURRENTLY cannot run inside a transaction
-- block, and triggers always execute within the triggering transaction. The
-- non-concurrent form is used instead. It takes a brief ACCESS EXCLUSIVE lock
-- on the view for the duration of the refresh, which is negligible given the
-- view is a single GROUP BY on an indexed column.

-- ── 1. Drop the regular view ──────────────────────────────────────────────────

DROP VIEW IF EXISTS public.theme_usage;

-- ── 2. Materialized view ──────────────────────────────────────────────────────

CREATE MATERIALIZED VIEW public.theme_usage AS
  SELECT
    theme_id,
    COUNT(*) AS user_count
  FROM public.profiles
  WHERE theme_id IS NOT NULL
  GROUP BY theme_id;

-- Unique index on theme_id for fast lookups and JOIN performance.
CREATE UNIQUE INDEX theme_usage_theme_id_idx
  ON public.theme_usage (theme_id);

GRANT SELECT ON public.theme_usage TO anon;
GRANT SELECT ON public.theme_usage TO authenticated;
GRANT ALL   ON public.theme_usage TO service_role;

-- ── 3. Refresh function ───────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.refresh_theme_usage()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW public.theme_usage;
  RETURN NULL;
END;
$$;

-- ── 4. Trigger on profiles ────────────────────────────────────────────────────
-- Fires after any operation that could change which theme a profile is using.
-- FOR EACH STATEMENT avoids redundant refreshes on bulk operations.

CREATE TRIGGER on_profile_theme_changed
  AFTER INSERT OR UPDATE OF theme_id OR DELETE
  ON public.profiles
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.refresh_theme_usage();
