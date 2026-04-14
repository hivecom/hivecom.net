-- ─────────────────────────────────────────────────────────────────────────────
-- Themes: server-side custom_css sanitization trigger
--
-- Strips dangerous CSS constructs from custom_css before every INSERT or
-- UPDATE, regardless of how the request arrived (API, direct psql, etc.).
-- The client-side sanitizer in app/lib/theme.ts is UX only; this is the
-- actual security boundary.
--
-- Sanitization steps (order matters):
--   1. Strip CSS block comments (/* ... */) - used to obfuscate patterns
--      e.g. java/**/script: would survive a naive regex without this step
--   2. Strip @import rules - prevents external resource loading / data exfil
--   3. Strip javascript: URI scheme - prevents JS execution via CSS
--   4. Strip expression() - legacy IE JS-in-CSS execution
--   5. Strip url() calls referencing data: or javascript: schemes -
--      prevents embedded resource injection
--
-- Note: null bytes are intentionally not stripped here. Postgres TEXT columns
-- reject null bytes at the wire protocol level before they reach the trigger,
-- so an explicit strip via chr(0) is both redundant and broken - Postgres
-- refuses to construct chr(0) in some configurations (SQLSTATE 54000).
--
-- External http/https URLs in url() are intentionally NOT blocked here.
-- The realistic exfiltration risk (attribute-selector beacon attacks) is low
-- for this app - sensitive values are not stored in plaintext DOM attributes.
-- Legitimate use cases (external fonts, decorative images) would be broken
-- by a blanket block, and theme authors have no way to self-host assets on
-- the platform anyway.
--
-- The planned inspect UI (ThemeCard CSS panel) should surface a warning when
-- external url() references are detected, so the user can make an informed
-- decision before applying the theme. That is the right layer for this check.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.sanitize_theme_custom_css()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
AS $$
DECLARE
  css text;
BEGIN
  css := NEW.custom_css;

  -- 1. Strip CSS block comments (non-greedy via regexp_replace with 'g' flag)
  --    This must run before pattern checks so comment-obfuscated constructs
  --    like java/**/script: are exposed before matching.
  css := regexp_replace(css, '/\*.*?\*/', '', 'g');

  -- 2. Strip @import rules (with optional whitespace variants)
  css := regexp_replace(css, '@import\s[^;]*;?', '', 'gi');

  -- 3. Strip javascript: URI scheme (with optional whitespace between tokens)
  css := regexp_replace(css, 'javascript\s*:', '', 'gi');

  -- 4. Strip expression() - legacy IE JS execution in CSS values
  css := regexp_replace(css, 'expression\s*\(', '', 'gi');

  -- 5. Strip url() referencing data: or javascript: schemes
  css := regexp_replace(css, 'url\s*\(\s*[''"]?\s*(data|javascript)\s*:', 'url(about:', 'gi');

  NEW.custom_css := css;
  RETURN NEW;
END;
$$;

CREATE TRIGGER sanitize_theme_custom_css
  BEFORE INSERT OR UPDATE OF custom_css
  ON public.themes
  FOR EACH ROW
  EXECUTE FUNCTION public.sanitize_theme_custom_css();
