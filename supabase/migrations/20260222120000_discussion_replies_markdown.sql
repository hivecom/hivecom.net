-- Rename discussion replies content column to markdown and update mention normalization trigger

BEGIN;

-- 1) Add new column
ALTER TABLE public.discussion_replies
  ADD COLUMN IF NOT EXISTS markdown text;

-- 2) Backfill from content
UPDATE public.discussion_replies
SET markdown = content
WHERE markdown IS NULL;

-- 3) Update mention normalization trigger to use markdown
CREATE OR REPLACE FUNCTION public.normalize_mentions_on_discussion_reply()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.markdown IS NOT DISTINCT FROM OLD.markdown THEN
    RETURN NEW;
  END IF;

  NEW.markdown := public.normalize_mentions(NEW.markdown);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS normalize_mentions_on_discussion_replies_content ON public.discussion_replies;

CREATE TRIGGER normalize_mentions_on_discussion_replies_markdown
BEFORE INSERT OR UPDATE ON public.discussion_replies
FOR EACH ROW
EXECUTE FUNCTION public.normalize_mentions_on_discussion_reply();

-- 4) Enforce not null and drop old column
ALTER TABLE public.discussion_replies
  ALTER COLUMN markdown SET NOT NULL;

ALTER TABLE public.discussion_replies
  DROP COLUMN IF EXISTS content;

COMMIT;
