CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

DROP FUNCTION IF EXISTS search_profiles(text);

CREATE OR REPLACE FUNCTION search_profiles(search_term text)
RETURNS SETOF public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  -- For very short search terms (1-2 chars), fuzzy matching (trigrams)
  -- often yields low scores. We use a simple prefix match (ILIKE) instead.
  IF length(search_term) < 3 THEN
    RETURN QUERY
    SELECT *
    FROM public.profiles
    WHERE username ILIKE (search_term || '%')
    ORDER BY username ASC
    LIMIT 10;
  ELSE
    RETURN QUERY
    SELECT *
    FROM public.profiles
    WHERE extensions.similarity(username, search_term) > 0.3
    ORDER BY extensions.similarity(username, search_term) DESC
    LIMIT 10;
  END IF;
END;
$$;
