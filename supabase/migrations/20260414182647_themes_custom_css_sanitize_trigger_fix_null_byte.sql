-- Fix: chr(0) is rejected by Postgres itself in some configurations.
-- Null bytes in text columns are already blocked at the wire protocol level
-- (Postgres TEXT type cannot store \x00), so the explicit strip is redundant.
-- Remove that step from the sanitizer.

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

  -- Null bytes are rejected by Postgres at the protocol level before reaching
  -- this trigger, so no explicit strip is needed here.

  -- 1. Strip CSS block comments (non-greedy, 'g' flag)
  --    Must run first to expose comment-obfuscated constructs like java/**/script:
  css := regexp_replace(css, '/\*.*?\*/', '', 'g');

  -- 2. Strip @import rules
  css := regexp_replace(css, '@import\s[^;]*;?', '', 'gi');

  -- 3. Strip javascript: URI scheme (with optional whitespace)
  css := regexp_replace(css, 'javascript\s*:', '', 'gi');

  -- 4. Strip expression() - legacy IE JS execution in CSS values
  css := regexp_replace(css, 'expression\s*\(', '', 'gi');

  -- 5. Strip url() referencing data: or javascript: schemes
  css := regexp_replace(css, 'url\s*\(\s*[''"]?\s*(data|javascript)\s*:', 'url(about:', 'gi');

  NEW.custom_css := css;
  RETURN NEW;
END;
$$;
