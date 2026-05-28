-- Create a reusable hex color validation function.
-- Accepts 6-digit (#rrggbb) or 8-digit (#rrggbbaa) hex strings, case-insensitive.
-- The '#' prefix is required. NULL is treated as valid (returns TRUE).
CREATE OR REPLACE FUNCTION "public"."is_valid_hex_color"(value text)
  RETURNS boolean
  LANGUAGE sql
  IMMUTABLE
  STRICT
  SET "search_path" TO ''
  AS $$
    SELECT value ~* '^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$'
  $$;

COMMENT ON FUNCTION "public"."is_valid_hex_color"(text) IS
  'Returns TRUE if the value is a valid 6- or 8-digit CSS hex color with a leading #. Returns NULL (treated as TRUE in CHECK constraints) when value is NULL.';

-- ── games.color ───────────────────────────────────────────────────────────────
ALTER TABLE "public"."games"
  ADD CONSTRAINT "games_color_hex_check"
  CHECK (public.is_valid_hex_color("color"));

-- ── themes: drop inline regex constraints and replace with function-based ones ─
DO $$
DECLARE
  col text;
  color_columns text[] := ARRAY[
    'dark_bg', 'dark_bg_medium', 'dark_bg_raised', 'dark_bg_lowered',
    'dark_text', 'dark_text_light', 'dark_text_lighter', 'dark_text_lightest', 'dark_text_invert',
    'dark_button_gray', 'dark_button_gray_hover', 'dark_button_fill', 'dark_button_fill_hover',
    'dark_text_red', 'dark_bg_red_lowered', 'dark_bg_red_raised',
    'dark_text_green', 'dark_bg_green_lowered', 'dark_bg_green_raised',
    'dark_text_yellow', 'dark_bg_yellow_lowered', 'dark_bg_yellow_raised',
    'dark_text_blue', 'dark_bg_blue_lowered', 'dark_bg_blue_raised',
    'dark_text_purple', 'dark_bg_purple_lowered', 'dark_bg_purple_raised',
    'dark_border', 'dark_border_strong', 'dark_border_weak',
    'dark_accent', 'dark_bg_accent_lowered', 'dark_bg_accent_raised',
    'light_bg', 'light_bg_medium', 'light_bg_raised', 'light_bg_lowered',
    'light_text', 'light_text_light', 'light_text_lighter', 'light_text_lightest', 'light_text_invert',
    'light_button_gray', 'light_button_gray_hover', 'light_button_fill', 'light_button_fill_hover',
    'light_text_red', 'light_bg_red_lowered', 'light_bg_red_raised',
    'light_text_green', 'light_bg_green_lowered', 'light_bg_green_raised',
    'light_text_yellow', 'light_bg_yellow_lowered', 'light_bg_yellow_raised',
    'light_text_blue', 'light_bg_blue_lowered', 'light_bg_blue_raised',
    'light_text_purple', 'light_bg_purple_lowered', 'light_bg_purple_raised',
    'light_border', 'light_border_strong', 'light_border_weak',
    'light_accent', 'light_bg_accent_lowered', 'light_bg_accent_raised'
  ];
BEGIN
  FOREACH col IN ARRAY color_columns LOOP
    -- Drop the old inline regex constraint
    EXECUTE format(
      'ALTER TABLE public.themes DROP CONSTRAINT IF EXISTS themes_%s_hex',
      col
    );
    -- Re-add using the shared function
    EXECUTE format(
      'ALTER TABLE public.themes ADD CONSTRAINT themes_%s_hex CHECK (public.is_valid_hex_color(%I))',
      col, col
    );
  END LOOP;
END;
$$;
