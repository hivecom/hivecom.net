-- Helper function: returns true if every element of an array matches ^[a-z0-9][a-z0-9-]*$
CREATE OR REPLACE FUNCTION public.array_elements_match_slug(arr text[])
  RETURNS boolean
  LANGUAGE sql
  IMMUTABLE
  SECURITY INVOKER
  SET search_path = ''
AS $$
  SELECT arr IS NULL
      OR (
        SELECT bool_and(elem ~ '^[a-z0-9][a-z0-9-]*[a-z0-9]$' OR elem ~ '^[a-z0-9]$')
        FROM unnest(arr) AS elem
      );
$$;

-- Each element of genre_tags must be a slug: lowercase alphanumeric + hyphens, no leading/trailing hyphens.
ALTER TABLE public.games
  ADD CONSTRAINT games_genre_tags_format
    CHECK (public.array_elements_match_slug(genre_tags));
