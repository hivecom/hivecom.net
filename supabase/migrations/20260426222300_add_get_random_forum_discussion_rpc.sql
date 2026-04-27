CREATE OR REPLACE FUNCTION public.get_random_forum_discussion()
RETURNS TABLE(id uuid, slug text, title text)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    d.id,
    d.slug,
    d.title
  FROM public.discussions d
  WHERE
    d.discussion_topic_id IS NOT NULL
    AND d.is_archived = false
    AND d.is_draft = false
  ORDER BY random()
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_random_forum_discussion() TO anon;
GRANT EXECUTE ON FUNCTION public.get_random_forum_discussion() TO authenticated;
