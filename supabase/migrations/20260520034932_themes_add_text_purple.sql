-- Add text_purple semantic color columns to themes, following the same pattern
-- as text_red, text_green, text_yellow, and text_blue.
-- NOTE: hex constraints are applied via is_valid_hex_color() by the
-- 20260520034931_hex_color_validation_function migration.

ALTER TABLE "public"."themes"
  ADD COLUMN "dark_text_purple"       text NOT NULL DEFAULT '#C176FF',
  ADD COLUMN "dark_bg_purple_lowered" text NOT NULL DEFAULT '#481C76',
  ADD COLUMN "dark_bg_purple_raised"  text NOT NULL DEFAULT '#622C9E',
  ADD COLUMN "light_text_purple"      text NOT NULL DEFAULT '#C176FF',
  ADD COLUMN "light_bg_purple_lowered" text NOT NULL DEFAULT '#481C76',
  ADD COLUMN "light_bg_purple_raised"  text NOT NULL DEFAULT '#622C9E';

COMMENT ON COLUMN "public"."themes"."dark_text_purple"       IS 'Semantic purple text color for dark palette';
COMMENT ON COLUMN "public"."themes"."dark_bg_purple_lowered" IS 'Semantic purple background (lowered) for dark palette';
COMMENT ON COLUMN "public"."themes"."dark_bg_purple_raised"  IS 'Semantic purple background (raised) for dark palette';
COMMENT ON COLUMN "public"."themes"."light_text_purple"      IS 'Semantic purple text color for light palette';
COMMENT ON COLUMN "public"."themes"."light_bg_purple_lowered" IS 'Semantic purple background (lowered) for light palette';
COMMENT ON COLUMN "public"."themes"."light_bg_purple_raised"  IS 'Semantic purple background (raised) for light palette';

-- ── Backfill existing rows with the official VUI purple values ──────────────
UPDATE "public"."themes" SET
  "dark_text_purple"       = '#C176FF',
  "dark_bg_purple_lowered" = '#481C76',
  "dark_bg_purple_raised"  = '#622C9E',
  "light_text_purple"      = '#C176FF',
  "light_bg_purple_lowered" = '#481C76',
  "light_bg_purple_raised"  = '#622C9E';

-- ── Update get_admin_themes_paginated to include the new columns ──────────────
DROP FUNCTION IF EXISTS public.get_admin_themes_paginated(text, text, text, integer, integer);
CREATE OR REPLACE FUNCTION public.get_admin_themes_paginated(
  p_search text DEFAULT ''::text,
  p_sort_col text DEFAULT 'created_at'::text,
  p_sort_dir text DEFAULT 'desc'::text,
  p_limit integer DEFAULT 10,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(
  id uuid,
  name text,
  description text,
  created_at timestamp with time zone,
  created_by uuid,
  modified_at timestamp with time zone,
  modified_by uuid,
  is_official boolean,
  is_unmaintained boolean,
  forked_from uuid,
  spacing smallint,
  rounding smallint,
  transitions smallint,
  widening smallint,
  dark_accent text,
  dark_bg_lowered text,
  dark_text_yellow text,
  dark_text_red text,
  dark_text_blue text,
  dark_text_purple text,
  dark_bg_purple_lowered text,
  dark_bg_purple_raised text,
  light_accent text,
  light_bg_lowered text,
  light_text_yellow text,
  light_text_red text,
  light_text_blue text,
  light_text_purple text,
  light_bg_purple_lowered text,
  light_bg_purple_raised text,
  custom_css text,
  total_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  has_access boolean;
BEGIN
  has_access := public.has_permission('themes.read'::public.app_permission);

  IF NOT has_access THEN
    RAISE EXCEPTION 'Insufficient permissions to view admin themes overview';
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT
      t.id,
      t.name,
      t.description,
      t.created_at,
      t.created_by,
      t.modified_at,
      t.modified_by,
      t.is_official,
      t.is_unmaintained,
      t.forked_from,
      t.spacing,
      t.rounding,
      t.transitions,
      t.widening,
      t.dark_accent,
      t.dark_bg_lowered,
      t.dark_text_yellow,
      t.dark_text_red,
      t.dark_text_blue,
      t.dark_text_purple,
      t.dark_bg_purple_lowered,
      t.dark_bg_purple_raised,
      t.light_accent,
      t.light_bg_lowered,
      t.light_text_yellow,
      t.light_text_red,
      t.light_text_blue,
      t.light_text_purple,
      t.light_bg_purple_lowered,
      t.light_bg_purple_raised,
      t.custom_css
    FROM public.themes AS t
    WHERE
      (
        p_search = ''
        OR t.name        ILIKE '%' || p_search || '%'
        OR t.description ILIKE '%' || p_search || '%'
      )
  )
  SELECT
    b.id,
    b.name,
    b.description,
    b.created_at,
    b.created_by,
    b.modified_at,
    b.modified_by,
    b.is_official,
    b.is_unmaintained,
    b.forked_from,
    b.spacing,
    b.rounding,
    b.transitions,
    b.widening,
    b.dark_accent,
    b.dark_bg_lowered,
    b.dark_text_yellow,
    b.dark_text_red,
    b.dark_text_blue,
    b.dark_text_purple,
    b.dark_bg_purple_lowered,
    b.dark_bg_purple_raised,
    b.light_accent,
    b.light_bg_lowered,
    b.light_text_yellow,
    b.light_text_red,
    b.light_text_blue,
    b.light_text_purple,
    b.light_bg_purple_lowered,
    b.light_bg_purple_raised,
    b.custom_css,
    COUNT(*) OVER () AS total_count
  FROM base AS b
  ORDER BY
    CASE WHEN p_sort_dir = 'asc' THEN
      CASE p_sort_col
        WHEN 'created_at'  THEN b.created_at
        WHEN 'modified_at' THEN b.modified_at
        ELSE NULL::timestamptz
      END
    END ASC NULLS LAST,
    CASE WHEN p_sort_dir = 'asc' THEN
      CASE p_sort_col
        WHEN 'name' THEN b.name
        ELSE NULL::text
      END
    END ASC NULLS LAST,
    CASE WHEN p_sort_dir = 'desc' THEN
      CASE p_sort_col
        WHEN 'created_at'  THEN b.created_at
        WHEN 'modified_at' THEN b.modified_at
        ELSE NULL::timestamptz
      END
    END DESC NULLS LAST,
    CASE WHEN p_sort_dir = 'desc' THEN
      CASE p_sort_col
        WHEN 'name' THEN b.name
        ELSE NULL::text
      END
    END DESC NULLS LAST,
    b.created_at DESC
  LIMIT  p_limit
  OFFSET p_offset;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_admin_themes_paginated(text, text, text, integer, integer) TO authenticated;
