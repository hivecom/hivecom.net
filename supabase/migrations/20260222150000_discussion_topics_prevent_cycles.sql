-- Prevent circular parent relationships in discussion_topics
CREATE OR REPLACE FUNCTION public.prevent_discussion_topic_cycles()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  has_cycle boolean;
BEGIN
  -- Allow clearing parent
  IF NEW.parent_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Prevent direct self-reference
  IF NEW.parent_id = NEW.id THEN
    RAISE EXCEPTION 'discussion_topics parent_id cannot reference itself';
  END IF;

  -- Detect any ancestor chain that leads back to this topic
  WITH RECURSIVE ancestors AS (
    SELECT dt.id, dt.parent_id
    FROM public.discussion_topics dt
    WHERE dt.id = NEW.parent_id

    UNION ALL

    SELECT parent.id, parent.parent_id
    FROM public.discussion_topics parent
    JOIN ancestors a ON a.parent_id = parent.id
  )
  SELECT EXISTS (
    SELECT 1 FROM ancestors WHERE id = NEW.id
  )
  INTO has_cycle;

  IF has_cycle THEN
    RAISE EXCEPTION 'discussion_topics parent_id creates a circular dependency';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS discussion_topics_prevent_cycles ON public.discussion_topics;

CREATE TRIGGER discussion_topics_prevent_cycles
BEFORE INSERT OR UPDATE OF parent_id
ON public.discussion_topics
FOR EACH ROW
EXECUTE FUNCTION public.prevent_discussion_topic_cycles();
