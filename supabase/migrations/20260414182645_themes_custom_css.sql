-- ─────────────────────────────────────────────────────────────────────────────
-- Themes: custom_css column
--
-- Allows theme authors to attach a custom CSS snippet that consumers can
-- optionally apply (gated by the user-level allow_custom_css setting).
--
-- Length is the only structural constraint here. Dangerous construct
-- sanitization (@import, javascript:, expression(), etc.) is enforced
-- server-side via the sanitize_theme_custom_css trigger (see migration
-- themes_custom_css_sanitize_trigger), which runs before every insert/update
-- regardless of how the request arrived. The client-side sanitizer in
-- app/lib/theme.ts is a UX convenience only and must not be relied on as a
-- security boundary.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.themes
  ADD COLUMN IF NOT EXISTS "custom_css" text NOT NULL DEFAULT '';

-- Hard cap: 16 KiB of CSS ought to be plenty for cosmetic overrides.
ALTER TABLE public.themes
  ADD CONSTRAINT "themes_custom_css_length"
  CHECK (char_length(custom_css) <= 16384);
