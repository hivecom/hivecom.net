-- Normalize @username mentions into @{user_id} at the database level

CREATE OR REPLACE FUNCTION public.normalize_mentions(input_text text)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  mention_username text;
  user_id uuid;
BEGIN
  IF input_text IS NULL OR input_text = '' THEN
    RETURN input_text;
  END IF;

  -- Find @username mentions (letters, numbers, underscores; max 32 chars)
  FOR mention_username IN
    SELECT DISTINCT (regexp_matches(input_text, '@([A-Za-z0-9_]{1,32})', 'g'))[1]
  LOOP
    SELECT id
    INTO user_id
    FROM public.profiles
    WHERE lower(username) = lower(mention_username)
    LIMIT 1;

    IF user_id IS NOT NULL THEN
      input_text := regexp_replace(
        input_text,
        '@' || mention_username || '\\b',
        '@{' || user_id::text || '}',
        'gi'
      );
    END IF;
  END LOOP;

  RETURN input_text;
END;
$$;

CREATE OR REPLACE FUNCTION public.normalize_mentions_on_markdown()
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

-- Markdown tables
DROP TRIGGER IF EXISTS normalize_mentions_on_events_markdown ON public.events;
CREATE TRIGGER normalize_mentions_on_events_markdown
BEFORE INSERT OR UPDATE ON public.events
FOR EACH ROW
EXECUTE FUNCTION public.normalize_mentions_on_markdown();

DROP TRIGGER IF EXISTS normalize_mentions_on_projects_markdown ON public.projects;
CREATE TRIGGER normalize_mentions_on_projects_markdown
BEFORE INSERT OR UPDATE ON public.projects
FOR EACH ROW
EXECUTE FUNCTION public.normalize_mentions_on_markdown();

DROP TRIGGER IF EXISTS normalize_mentions_on_gameservers_markdown ON public.gameservers;
CREATE TRIGGER normalize_mentions_on_gameservers_markdown
BEFORE INSERT OR UPDATE ON public.gameservers
FOR EACH ROW
EXECUTE FUNCTION public.normalize_mentions_on_markdown();

DROP TRIGGER IF EXISTS normalize_mentions_on_profiles_markdown ON public.profiles;
CREATE TRIGGER normalize_mentions_on_profiles_markdown
BEFORE INSERT OR UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.normalize_mentions_on_markdown();

DROP TRIGGER IF EXISTS normalize_mentions_on_discussions_markdown ON public.discussions;
CREATE TRIGGER normalize_mentions_on_discussions_markdown
BEFORE INSERT OR UPDATE ON public.discussions
FOR EACH ROW
EXECUTE FUNCTION public.normalize_mentions_on_markdown();

-- Discussion replies markdown
DROP TRIGGER IF EXISTS normalize_mentions_on_discussion_replies_markdown ON public.discussion_replies;
CREATE TRIGGER normalize_mentions_on_discussion_replies_markdown
BEFORE INSERT OR UPDATE ON public.discussion_replies
FOR EACH ROW
EXECUTE FUNCTION public.normalize_mentions_on_markdown();
