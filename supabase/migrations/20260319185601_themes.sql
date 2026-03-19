-- ─────────────────────────────────────────────────────────────────────────────
-- Themes table
--
-- Stores user-created color themes that map 1:1 to VUI's CSS custom property
-- palette. Every color column is NOT NULL so a theme is always complete and
-- can be applied without fallback logic.
--
-- The column names mirror VUI's `--color-*` variables with dots replaced by
-- underscores. Each theme stores overrides for BOTH the dark and light
-- palettes so a single theme works regardless of the user's mode preference.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE "public"."themes"(
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "created_at" timestamp with time zone NOT NULL DEFAULT NOW(),
  "created_by" uuid,
  "modified_at" timestamp with time zone,
  "modified_by" uuid,
  "name" text NOT NULL,
  "description" text NOT NULL DEFAULT '',

  -- ── Palette-independent knobs ─────────────────────────────────────────────
  -- Integer 0-100 scale; 50 is the neutral/VUI-default midpoint.
  "spacing" smallint NOT NULL DEFAULT 50,
  "rounding" smallint NOT NULL DEFAULT 50,
  "transitions" smallint NOT NULL DEFAULT 50,

  -- ── Dark palette ──────────────────────────────────────────────────────────
  -- Background
  "dark_bg" text NOT NULL,
  "dark_bg_medium" text NOT NULL,
  "dark_bg_raised" text NOT NULL,
  "dark_bg_lowered" text NOT NULL,

  -- Text
  "dark_text" text NOT NULL,
  "dark_text_light" text NOT NULL,
  "dark_text_lighter" text NOT NULL,
  "dark_text_lightest" text NOT NULL,
  "dark_text_invert" text NOT NULL,

  -- Buttons
  "dark_button_gray" text NOT NULL,
  "dark_button_gray_hover" text NOT NULL,
  "dark_button_fill" text NOT NULL,
  "dark_button_fill_hover" text NOT NULL,

  -- Semantic: red
  "dark_text_red" text NOT NULL,
  "dark_bg_red_lowered" text NOT NULL,
  "dark_bg_red_raised" text NOT NULL,

  -- Semantic: green
  "dark_text_green" text NOT NULL,
  "dark_bg_green_lowered" text NOT NULL,
  "dark_bg_green_raised" text NOT NULL,

  -- Semantic: yellow
  "dark_text_yellow" text NOT NULL,
  "dark_bg_yellow_lowered" text NOT NULL,
  "dark_bg_yellow_raised" text NOT NULL,

  -- Semantic: blue
  "dark_text_blue" text NOT NULL,
  "dark_bg_blue_lowered" text NOT NULL,
  "dark_bg_blue_raised" text NOT NULL,

  -- Borders
  "dark_border" text NOT NULL,
  "dark_border_strong" text NOT NULL,
  "dark_border_weak" text NOT NULL,

  -- Accent
  "dark_accent" text NOT NULL,
  "dark_bg_accent_lowered" text NOT NULL,
  "dark_bg_accent_raised" text NOT NULL,

  -- ── Light palette ─────────────────────────────────────────────────────────
  -- Background
  "light_bg" text NOT NULL,
  "light_bg_medium" text NOT NULL,
  "light_bg_raised" text NOT NULL,
  "light_bg_lowered" text NOT NULL,

  -- Text
  "light_text" text NOT NULL,
  "light_text_light" text NOT NULL,
  "light_text_lighter" text NOT NULL,
  "light_text_lightest" text NOT NULL,
  "light_text_invert" text NOT NULL,

  -- Buttons
  "light_button_gray" text NOT NULL,
  "light_button_gray_hover" text NOT NULL,
  "light_button_fill" text NOT NULL,
  "light_button_fill_hover" text NOT NULL,

  -- Semantic: red
  "light_text_red" text NOT NULL,
  "light_bg_red_lowered" text NOT NULL,
  "light_bg_red_raised" text NOT NULL,

  -- Semantic: green
  "light_text_green" text NOT NULL,
  "light_bg_green_lowered" text NOT NULL,
  "light_bg_green_raised" text NOT NULL,

  -- Semantic: yellow
  "light_text_yellow" text NOT NULL,
  "light_bg_yellow_lowered" text NOT NULL,
  "light_bg_yellow_raised" text NOT NULL,

  -- Semantic: blue
  "light_text_blue" text NOT NULL,
  "light_bg_blue_lowered" text NOT NULL,
  "light_bg_blue_raised" text NOT NULL,

  -- Borders
  "light_border" text NOT NULL,
  "light_border_strong" text NOT NULL,
  "light_border_weak" text NOT NULL,

  -- Accent
  "light_accent" text NOT NULL,
  "light_bg_accent_lowered" text NOT NULL,
  "light_bg_accent_raised" text NOT NULL
);

-- ── Palette-independent constraints ───────────────────────────────────────────
ALTER TABLE "public"."themes"
  ADD CONSTRAINT "themes_spacing_range" CHECK (spacing BETWEEN 0 AND 100);

ALTER TABLE "public"."themes"
  ADD CONSTRAINT "themes_rounding_range" CHECK (rounding BETWEEN 0 AND 100);

ALTER TABLE "public"."themes"
  ADD CONSTRAINT "themes_transitions_range" CHECK (transitions BETWEEN 0 AND 100);

-- ── Hex color constraints ─────────────────────────────────────────────────────
-- Accepts 6-digit (#rrggbb) or 8-digit (#rrggbbaa) hex strings, case-insensitive.
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
    'dark_border', 'dark_border_strong', 'dark_border_weak',
    'dark_accent', 'dark_bg_accent_lowered', 'dark_bg_accent_raised',
    'light_bg', 'light_bg_medium', 'light_bg_raised', 'light_bg_lowered',
    'light_text', 'light_text_light', 'light_text_lighter', 'light_text_lightest', 'light_text_invert',
    'light_button_gray', 'light_button_gray_hover', 'light_button_fill', 'light_button_fill_hover',
    'light_text_red', 'light_bg_red_lowered', 'light_bg_red_raised',
    'light_text_green', 'light_bg_green_lowered', 'light_bg_green_raised',
    'light_text_yellow', 'light_bg_yellow_lowered', 'light_bg_yellow_raised',
    'light_text_blue', 'light_bg_blue_lowered', 'light_bg_blue_raised',
    'light_border', 'light_border_strong', 'light_border_weak',
    'light_accent', 'light_bg_accent_lowered', 'light_bg_accent_raised'
  ];
BEGIN
  FOREACH col IN ARRAY color_columns LOOP
    EXECUTE format(
      'ALTER TABLE public.themes ADD CONSTRAINT themes_%s_hex CHECK (%I ~* ''^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$'')',
      col, col
    );
  END LOOP;
END;
$$;

-- Enable RLS
ALTER TABLE "public"."themes" ENABLE ROW LEVEL SECURITY;

-- Primary key
CREATE UNIQUE INDEX themes_pkey ON public.themes USING btree(id);

ALTER TABLE "public"."themes"
  ADD CONSTRAINT "themes_pkey" PRIMARY KEY USING INDEX "themes_pkey";

-- Index on creator for "my themes" queries
CREATE INDEX themes_created_by_idx ON public.themes USING btree(created_by);

-- Foreign keys
ALTER TABLE "public"."themes"
  ADD CONSTRAINT "themes_created_by_fkey"
  FOREIGN KEY (created_by) REFERENCES auth.users(id)
  ON UPDATE CASCADE ON DELETE SET NULL NOT VALID;

ALTER TABLE "public"."themes" VALIDATE CONSTRAINT "themes_created_by_fkey";

ALTER TABLE "public"."themes"
  ADD CONSTRAINT "themes_modified_by_fkey"
  FOREIGN KEY (modified_by) REFERENCES auth.users(id)
  ON UPDATE CASCADE ON DELETE SET NULL NOT VALID;

ALTER TABLE "public"."themes" VALIDATE CONSTRAINT "themes_modified_by_fkey";

-- Name length constraint
ALTER TABLE "public"."themes"
  ADD CONSTRAINT "themes_name_length" CHECK (char_length(name) BETWEEN 1 AND 64);

-- Description length constraint
ALTER TABLE "public"."themes"
  ADD CONSTRAINT "themes_description_length" CHECK (char_length(description) <= 256);

-- ─────────────────────────────────────────────────────────────────────────────
-- Grants (standard Supabase pattern)
-- ─────────────────────────────────────────────────────────────────────────────

GRANT SELECT ON TABLE "public"."themes" TO "anon";
GRANT SELECT ON TABLE "public"."themes" TO "authenticated";

GRANT INSERT ON TABLE "public"."themes" TO "authenticated";
GRANT UPDATE ON TABLE "public"."themes" TO "authenticated";
GRANT DELETE ON TABLE "public"."themes" TO "authenticated";

GRANT ALL ON TABLE "public"."themes" TO "service_role";

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS policies
--
-- Themes are publicly readable. Only the creator can insert/update/delete
-- their own themes.
-- ─────────────────────────────────────────────────────────────────────────────

-- Anyone (including anon for public profiles) can read themes
CREATE POLICY "Themes are publicly readable" ON "public"."themes"
  FOR SELECT
    USING (true);

-- Authenticated users can create themes they own
-- created_by must be non-NULL and match the calling user; system themes
-- (created_by IS NULL) are inserted via service_role which bypasses RLS.
CREATE POLICY "Users can create their own themes" ON "public"."themes"
  FOR INSERT TO authenticated
    WITH CHECK (created_by IS NOT NULL AND public.is_owner(created_by));

-- Only the creator can update their theme; system themes (created_by IS NULL)
-- are not updatable by regular users.
CREATE POLICY "Users can update their own themes" ON "public"."themes"
  FOR UPDATE TO authenticated
    USING (created_by IS NOT NULL AND public.is_owner(created_by))
    WITH CHECK (created_by IS NOT NULL AND public.is_owner(created_by));

-- Only the creator can delete their theme; system themes are not deletable
-- by regular users.
CREATE POLICY "Users can delete their own themes" ON "public"."themes"
  FOR DELETE TO authenticated
    USING (created_by IS NOT NULL AND public.is_owner(created_by));

-- ─────────────────────────────────────────────────────────────────────────────
-- Add theme_id to profiles
--
-- Nullable FK - a user doesn't have to use a custom theme. When the
-- referenced theme is deleted, the profile's theme_id is set to NULL
-- (graceful fallback to VUI defaults).
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE "public"."profiles"
  ADD COLUMN "theme_id" uuid;

ALTER TABLE "public"."profiles"
  ADD CONSTRAINT "profiles_theme_id_fkey"
  FOREIGN KEY (theme_id) REFERENCES public.themes(id)
  ON UPDATE CASCADE ON DELETE SET NULL NOT VALID;

ALTER TABLE "public"."profiles" VALIDATE CONSTRAINT "profiles_theme_id_fkey";

CREATE INDEX profiles_theme_id_idx ON public.profiles USING btree(theme_id);
