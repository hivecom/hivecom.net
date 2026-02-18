CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

DROP FUNCTION IF EXISTS search_profiles(text);

CREATE OR REPLACE FUNCTION search_profiles(search_term text)
RETURNS SETOF public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  RETURN QUERY
  SELECT *
  FROM public.profiles
  WHERE extensions.similarity(username, search_term) > 0.3
  ORDER BY extensions.similarity(username, search_term) DESC
  LIMIT 10;
END;
$$;