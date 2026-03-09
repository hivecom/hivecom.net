-- Extend the no-HTML guarantee that already exists on profiles.markdown to
-- every other column that holds user-authored or admin-authored markdown
-- content.  The contains_html_tags() function already exists from migration
-- 20250616000000_profile_no_html_constraints.sql so we reuse it here.
--
-- Columns covered:
--   discussion_replies.markdown  – direct user content (highest risk)
--   discussions.title            – forum thread titles written by users
--   discussions.description      – forum thread descriptions written by users
--   discussions.markdown         – synced from entity markdown (covered below)
--   events.markdown              – admin-authored
--   announcements.markdown       – admin-authored
--   projects.markdown            – admin-authored
--   gameservers.markdown         – admin-authored
--
-- All constraints use NOT VALID so the migration applies instantly without
-- scanning the entire table.  A follow-up VALIDATE can be run during a
-- maintenance window if desired.

-- ---------------------------------------------------------------------------
-- discussion_replies.markdown
-- ---------------------------------------------------------------------------
ALTER TABLE public.discussion_replies
  ADD CONSTRAINT discussion_replies_markdown_no_html
  CHECK (markdown IS NULL OR NOT public.contains_html_tags(markdown))
  NOT VALID;

COMMENT ON CONSTRAINT discussion_replies_markdown_no_html
  ON public.discussion_replies
  IS 'Prevents raw HTML tags in reply markdown content';

-- ---------------------------------------------------------------------------
-- discussions.title
-- ---------------------------------------------------------------------------
ALTER TABLE public.discussions
  ADD CONSTRAINT discussions_title_no_html
  CHECK (title IS NULL OR NOT public.contains_html_tags(title))
  NOT VALID;

COMMENT ON CONSTRAINT discussions_title_no_html
  ON public.discussions
  IS 'Prevents raw HTML tags in discussion title';

-- ---------------------------------------------------------------------------
-- discussions.description
-- ---------------------------------------------------------------------------
ALTER TABLE public.discussions
  ADD CONSTRAINT discussions_description_no_html
  CHECK (description IS NULL OR NOT public.contains_html_tags(description))
  NOT VALID;

COMMENT ON CONSTRAINT discussions_description_no_html
  ON public.discussions
  IS 'Prevents raw HTML tags in discussion description';

-- ---------------------------------------------------------------------------
-- discussions.markdown  (synced from entity markdown fields)
-- ---------------------------------------------------------------------------
ALTER TABLE public.discussions
  ADD CONSTRAINT discussions_markdown_no_html
  CHECK (markdown IS NULL OR NOT public.contains_html_tags(markdown))
  NOT VALID;

COMMENT ON CONSTRAINT discussions_markdown_no_html
  ON public.discussions
  IS 'Prevents raw HTML tags in discussion markdown (synced from entity)';

-- ---------------------------------------------------------------------------
-- events.markdown
-- ---------------------------------------------------------------------------
ALTER TABLE public.events
  ADD CONSTRAINT events_markdown_no_html
  CHECK (markdown IS NULL OR NOT public.contains_html_tags(markdown))
  NOT VALID;

COMMENT ON CONSTRAINT events_markdown_no_html
  ON public.events
  IS 'Prevents raw HTML tags in event markdown content';

-- ---------------------------------------------------------------------------
-- projects.markdown
-- ---------------------------------------------------------------------------
ALTER TABLE public.projects
  ADD CONSTRAINT projects_markdown_no_html
  CHECK (markdown IS NULL OR NOT public.contains_html_tags(markdown))
  NOT VALID;

COMMENT ON CONSTRAINT projects_markdown_no_html
  ON public.projects
  IS 'Prevents raw HTML tags in project markdown content';

-- ---------------------------------------------------------------------------
-- gameservers.markdown
-- ---------------------------------------------------------------------------
ALTER TABLE public.gameservers
  ADD CONSTRAINT gameservers_markdown_no_html
  CHECK (markdown IS NULL OR NOT public.contains_html_tags(markdown))
  NOT VALID;

COMMENT ON CONSTRAINT gameservers_markdown_no_html
  ON public.gameservers
  IS 'Prevents raw HTML tags in gameserver markdown content';
