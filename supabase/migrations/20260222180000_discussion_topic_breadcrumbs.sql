CREATE OR REPLACE FUNCTION public.get_discussion_topic_breadcrumbs(target_topic_id uuid)
RETURNS TABLE (
  id uuid,
  name text,
  slug text,
  parent_id uuid
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  WITH RECURSIVE topic_path AS (
    SELECT
      dt.id,
      dt.name,
      dt.slug,
      dt.parent_id,
      1 AS depth
    FROM public.discussion_topics dt
    WHERE dt.id = target_topic_id

    UNION ALL

    SELECT
      parent.id,
      parent.name,
      parent.slug,
      parent.parent_id,
      tp.depth + 1
    FROM public.discussion_topics parent
    INNER JOIN topic_path tp
      ON tp.parent_id = parent.id
  )
  SELECT
    id,
    name,
    slug,
    parent_id
  FROM topic_path
  ORDER BY depth DESC;
$function$;
