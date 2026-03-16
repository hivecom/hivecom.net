-- Change search_profiles() return type from SETOF public.profiles
-- to a lightweight TABLE(id, username) projection.
--
-- Before: returns the full profiles row (30+ columns including markdown,
--         teamspeak_identities, badges, etc.) for every match, even though
--         every caller only uses id and username for autocomplete.
--
-- After:  returns only TABLE(id uuid, username text). Network payload shrinks
--         dramatically on every search keystroke. Large text columns are never
--         materialized or transferred.
--
-- Callers: app/components/Editor/plugins/mentions.ts already does
--   .rpc('search_profiles', { search_term }).select('username, id')
-- so the projected columns are unchanged. No call-site changes needed.
--
-- Note: changing the return type requires DROP + recreate (Postgres does not
-- allow ALTER FUNCTION to change the return type). The DROP is safe here
-- because the original migration already used DROP FUNCTION IF EXISTS before
-- creating it.

DROP FUNCTION IF EXISTS public.search_profiles(text);

CREATE OR REPLACE FUNCTION public.search_profiles(search_term text)
RETURNS TABLE(id uuid, username text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, extensions
AS $$
BEGIN
  -- For very short search terms (1-2 chars), trigram scores are unreliable.
  -- Use a simple prefix match (ILIKE) instead.
  IF length(search_term) < 3 THEN
    RETURN QUERY
    SELECT p.id, p.username
      FROM public.profiles p
     WHERE p.username ILIKE (search_term || '%')
     ORDER BY p.username ASC
     LIMIT 10;
  ELSE
    RETURN QUERY
    SELECT p.id, p.username
      FROM public.profiles p
     WHERE extensions.similarity(p.username, search_term) > 0.3
     ORDER BY extensions.similarity(p.username, search_term) DESC
     LIMIT 10;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.search_profiles(text) IS
  'Fuzzy username search for autocomplete. Returns only (id, username) - '
  'callers that previously received full profile rows should project the '
  'columns they need; this function no longer returns any other fields. '
  'Short terms (<3 chars) use ILIKE prefix match; longer terms use pg_trgm '
  'similarity with a 0.3 threshold.';

GRANT EXECUTE ON FUNCTION public.search_profiles(text) TO anon;
GRANT EXECUTE ON FUNCTION public.search_profiles(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_profiles(text) TO service_role;
