-- Fix function bodies that still reference public.gameservers after the rename
-- to public.network_gameservers in migration 20260515160313.
--
-- Postgres carries triggers and indexes over on ALTER TABLE ... RENAME but does
-- NOT rewrite existing function bodies, so every function that hard-codes the
-- old table name is broken until recreated here.
--
-- Functions fixed:
--   1. notify_discord_new_complaint()
--   2. public.prevent_deleting_linked_discussions()
--   3. public.search_global(text, text[], int, boolean)
--   4. public.get_admin_discussions_paginated (overload without p_author_id)
--   5. public.get_admin_discussions_paginated (overload with p_author_id)

-- ----------------------------------------------------------------------------
-- 1. notify_discord_new_complaint
--    Source: 20260308206000_complaints_webhook_discussion_context.sql
--    Change: public.gameservers gs -> public.network_gameservers gs
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION notify_discord_new_complaint()
  RETURNS TRIGGER
  SECURITY DEFINER
  SET search_path = public
  LANGUAGE plpgsql
  AS $$
DECLARE
  webhook_url text;
  complaint_author text;
  context_info text := '';
  discord_payload jsonb;
  request_id bigint;
BEGIN
  -- Get the Discord webhook URL from vault
  SELECT
    decrypted_secret INTO webhook_url
  FROM
    vault.decrypted_secrets
  WHERE
    name = 'system_discord_notification_webhook_url';

  -- If no webhook URL is configured, skip notification
  IF webhook_url IS NULL OR webhook_url = 'REPLACE-ME' THEN
    RAISE NOTICE 'Discord webhook URL not configured, skipping notification';
    RETURN NEW;
  END IF;

  -- Get the complaint author's username
  SELECT
    COALESCE(p.username, 'Unknown User') INTO complaint_author
  FROM
    public.profiles p
  WHERE
    p.id = NEW.created_by;

  -- Build context information from all possible context columns.
  -- A complaint may reference multiple contexts (e.g. a discussion reply AND
  -- its parent discussion), so we concatenate all that apply.

  IF NEW.context_user IS NOT NULL THEN
    SELECT
      'About user: ' || COALESCE(p.username, 'Unknown User') INTO context_info
    FROM
      public.profiles p
    WHERE
      p.id = NEW.context_user;
  END IF;

  IF NEW.context_gameserver IS NOT NULL THEN
    DECLARE
      gs_name text;
    BEGIN
      SELECT
        COALESCE(gs.name, 'Unknown Server') INTO gs_name
      FROM
        public.network_gameservers gs
      WHERE
        gs.id = NEW.context_gameserver;

      IF context_info != '' THEN
        context_info := context_info || ' | ';
      END IF;
      context_info := context_info || 'About server: ' || gs_name;
    END;
  END IF;

  IF NEW.context_discussion IS NOT NULL THEN
    DECLARE
      disc_title text;
      disc_slug text;
    BEGIN
      SELECT
        COALESCE(d.title, 'Untitled discussion'),
        d.slug
      INTO disc_title, disc_slug
      FROM
        public.discussions d
      WHERE
        d.id = NEW.context_discussion;

      IF context_info != '' THEN
        context_info := context_info || ' | ';
      END IF;
      context_info := context_info || 'Discussion: ' || disc_title;

      -- Append a link hint using the slug if available, otherwise the UUID
      IF disc_slug IS NOT NULL THEN
        context_info := context_info || ' (/forum/' || disc_slug || ')';
      ELSE
        context_info := context_info || ' (/forum/' || NEW.context_discussion || ')';
      END IF;
    END;
  END IF;

  IF NEW.context_discussion_reply IS NOT NULL THEN
    DECLARE
      reply_preview text;
      reply_author text;
    BEGIN
      SELECT
        LEFT(COALESCE(r.markdown, ''), 120),
        COALESCE(p.username, 'Unknown User')
      INTO reply_preview, reply_author
      FROM
        public.discussion_replies r
        LEFT JOIN public.profiles p ON p.id = r.created_by
      WHERE
        r.id = NEW.context_discussion_reply;

      IF context_info != '' THEN
        context_info := context_info || ' | ';
      END IF;
      context_info := context_info || 'Reply by ' || reply_author || ': "' || reply_preview;

      -- Close the quote and add ellipsis if the preview was truncated
      IF LENGTH(reply_preview) >= 120 THEN
        context_info := context_info || '..."';
      ELSE
        context_info := context_info || '"';
      END IF;
    END;
  END IF;

  -- Build the Discord webhook payload
  discord_payload := jsonb_build_object(
    'content', '🚨 **New Complaint Submitted**',
    'embeds', jsonb_build_array(
      jsonb_build_object(
        'title', 'Complaint #' || NEW.id,
        'description', NEW.message,
        'color', 15158332, -- Red color (0xE74C3C)
        'fields', jsonb_build_array(
          jsonb_build_object(
            'name', 'Submitted by',
            'value', complaint_author,
            'inline', true
          ),
          jsonb_build_object(
            'name', 'Context',
            'value', CASE WHEN context_info = '' THEN 'None' ELSE context_info END,
            'inline', true
          ),
          jsonb_build_object(
            'name', 'Date',
            'value', to_char(NEW.created_at, 'YYYY-MM-DD HH24:MI:SS UTC'),
            'inline', true
          )
        ),
        'timestamp', to_char(NEW.created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
      )
    )
  );

  -- Send the webhook request asynchronously (fire and forget)
  SELECT
    net.http_post(
      url := webhook_url,
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body := discord_payload
    ) INTO request_id;

  -- Log that we initiated the request (no need to wait for response)
  RAISE NOTICE 'Discord webhook initiated for complaint #% (request_id: %)', NEW.id, request_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_notify_discord_new_complaint ON public.complaints;

CREATE TRIGGER trigger_notify_discord_new_complaint
  AFTER INSERT ON public.complaints
  FOR EACH ROW
  EXECUTE FUNCTION notify_discord_new_complaint();

-- ----------------------------------------------------------------------------
-- 2. public.prevent_deleting_linked_discussions
--    Source: 20260226000003_prevent_deleting_linked_discussions.sql
--    Change: FROM public.gameservers g -> FROM public.network_gameservers g
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.prevent_deleting_linked_discussions()
RETURNS TRIGGER AS $$
BEGIN
  IF num_nonnulls(
    OLD.event_id,
    OLD.referendum_id,
    OLD.profile_id,
    OLD.project_id,
    OLD.gameserver_id
  ) > 0 THEN
    IF (
      (OLD.event_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.events e WHERE e.id = OLD.event_id))
      OR (OLD.referendum_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.referendums r WHERE r.id = OLD.referendum_id))
      OR (OLD.profile_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = OLD.profile_id))
      OR (OLD.project_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.projects pr WHERE pr.id = OLD.project_id))
      OR (OLD.gameserver_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.network_gameservers g WHERE g.id = OLD.gameserver_id))
    ) THEN
      RAISE EXCEPTION 'Cannot delete discussions linked to an entity. Delete the entity instead.';
    END IF;
  END IF;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '';

-- ----------------------------------------------------------------------------
-- 3. public.search_global
--    Source: 20260407231450_search_global_gameserver_url_fix.sql
--    Change: FROM public.gameservers gs -> FROM public.network_gameservers gs
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.search_global(
  p_query         text,
  p_types         text[]  DEFAULT NULL,
  p_limit         int     DEFAULT 20,
  p_show_archived boolean DEFAULT true
)
RETURNS TABLE (
  id          text,
  result_type text,
  title       text,
  subtitle    text,
  topic_id    text,
  url         text,
  score       float4,
  is_archived boolean
)
LANGUAGE sql
SECURITY INVOKER
STABLE
AS $$
  SELECT id, result_type, title, subtitle, topic_id, url, score, is_archived
  FROM (
    -- discussion topics
    SELECT
      dt.id::text,
      'discussion_topic'::text AS result_type,
      dt.name AS title,
      dt.description AS subtitle,
      dt.parent_id::text AS topic_id,
      '/forum?topic=' || dt.slug AS url,
      greatest(
        extensions.word_similarity(p_query, dt.name),
        COALESCE(extensions.word_similarity(p_query, dt.description), 0::real)
      ) AS score,
      dt.is_archived
    FROM public.discussion_topics dt
    WHERE
      (p_types IS NULL OR 'discussion_topic' = ANY(p_types))
      AND (p_show_archived OR NOT dt.is_archived)
      AND greatest(
            extensions.word_similarity(p_query, dt.name),
            COALESCE(extensions.word_similarity(p_query, dt.description), 0::real)
          ) > 0.1

    UNION ALL

    -- discussions
    SELECT
      d.id::text,
      'discussion'::text AS result_type,
      d.title AS title,
      d.description AS subtitle,
      d.discussion_topic_id::text AS topic_id,
      '/forum/' || COALESCE(d.slug, d.id::text) AS url,
      greatest(
        COALESCE(extensions.word_similarity(p_query, d.title), 0::real),
        COALESCE(extensions.word_similarity(p_query, d.description), 0::real)
      ) AS score,
      d.is_archived
    FROM public.discussions d
    WHERE
      (p_types IS NULL OR 'discussion' = ANY(p_types))
      AND d.is_draft = false
      AND d.discussion_topic_id IS NOT NULL
      AND (p_show_archived OR NOT d.is_archived)
      AND greatest(
            COALESCE(extensions.word_similarity(p_query, d.title), 0::real),
            COALESCE(extensions.word_similarity(p_query, d.description), 0::real)
          ) > 0.1

    UNION ALL

    -- profiles
    SELECT
      p.id::text,
      'profile'::text AS result_type,
      p.username AS title,
      p.introduction AS subtitle,
      null::text AS topic_id,
      '/profile/' || p.username AS url,
      extensions.word_similarity(p_query, p.username) AS score,
      false AS is_archived
    FROM public.profiles p
    WHERE
      (p_types IS NULL OR 'profile' = ANY(p_types))
      AND (p.public = true OR auth.uid() IS NOT NULL)
      AND p.banned = false
      AND extensions.word_similarity(p_query, p.username) > 0.1

    UNION ALL

    -- events
    SELECT
      e.id::text,
      'event'::text AS result_type,
      e.title AS title,
      e.description AS subtitle,
      null::text AS topic_id,
      '/events/' || e.id::text AS url,
      greatest(
        extensions.word_similarity(p_query, e.title),
        COALESCE(extensions.word_similarity(p_query, e.description), 0::real)
      ) AS score,
      false AS is_archived
    FROM public.events e
    WHERE
      (p_types IS NULL OR 'event' = ANY(p_types))
      AND greatest(
            extensions.word_similarity(p_query, e.title),
            COALESCE(extensions.word_similarity(p_query, e.description), 0::real)
          ) > 0.1

    UNION ALL

    -- gameservers: URL points to the individual page, not the list
    SELECT
      gs.id::text,
      'gameserver'::text AS result_type,
      gs.name AS title,
      gs.description AS subtitle,
      null::text AS topic_id,
      '/servers/gameservers/' || gs.id::text AS url,
      greatest(
        extensions.word_similarity(p_query, gs.name),
        COALESCE(extensions.word_similarity(p_query, gs.description), 0::real)
      ) AS score,
      false AS is_archived
    FROM public.network_gameservers gs
    WHERE
      (p_types IS NULL OR 'gameserver' = ANY(p_types))
      AND greatest(
            extensions.word_similarity(p_query, gs.name),
            COALESCE(extensions.word_similarity(p_query, gs.description), 0::real)
          ) > 0.1

    UNION ALL

    -- projects
    SELECT
      pr.id::text,
      'project'::text AS result_type,
      pr.title AS title,
      pr.description AS subtitle,
      null::text AS topic_id,
      '/community/projects' AS url,
      greatest(
        extensions.word_similarity(p_query, pr.title),
        COALESCE(extensions.word_similarity(p_query, pr.description), 0::real)
      ) AS score,
      false AS is_archived
    FROM public.projects pr
    WHERE
      (p_types IS NULL OR 'project' = ANY(p_types))
      AND greatest(
            extensions.word_similarity(p_query, pr.title),
            COALESCE(extensions.word_similarity(p_query, pr.description), 0::real)
          ) > 0.1

  ) results
  ORDER BY score DESC
  LIMIT p_limit
$$;

-- ----------------------------------------------------------------------------
-- 4. public.get_admin_discussions_paginated (without p_author_id)
--    Source: 20260417165620_admin_discussions_rpc_add_theme_context.sql
--    Change: LEFT JOIN public.gameservers -> LEFT JOIN public.network_gameservers
-- -------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_admin_discussions_paginated(text, text[], text[], text, text, integer, integer);

CREATE FUNCTION public.get_admin_discussions_paginated(
  p_search      text     DEFAULT '',
  p_status      text[]   DEFAULT '{}',
  p_context     text[]   DEFAULT '{}',
  p_sort_col    text     DEFAULT 'last_active',
  p_sort_dir    text     DEFAULT 'desc',
  p_limit       integer  DEFAULT 10,
  p_offset      integer  DEFAULT 0
)
RETURNS TABLE(
  id                    uuid,
  title                 text,
  description           text,
  slug                  text,
  created_at            timestamp with time zone,
  created_by            uuid,
  modified_at           timestamp with time zone,
  modified_by           uuid,
  is_locked             boolean,
  is_sticky             boolean,
  is_archived           boolean,
  is_draft              boolean,
  is_nsfw               boolean,
  reply_count           bigint,
  view_count            bigint,
  accepted_reply_id     uuid,
  discussion_topic_id   uuid,
  profile_id            uuid,
  project_id            bigint,
  event_id              bigint,
  gameserver_id         bigint,
  referendum_id         bigint,
  theme_id              uuid,
  created_by_username   text,
  profile_username      text,
  project_title         text,
  event_title           text,
  gameserver_name       text,
  referendum_title      text,
  discussion_topic_name text,
  theme_name            text,
  last_reply_at         timestamp with time zone,
  last_reply_by         uuid,
  total_count           bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  has_access boolean;
BEGIN
  has_access := public.has_permission('discussions.read'::public.app_permission);

  IF NOT has_access THEN
    RAISE EXCEPTION 'Insufficient permissions to view admin discussions overview';
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT
      d.id,
      d.title,
      d.description,
      d.slug,
      d.created_at,
      d.created_by,
      d.modified_at,
      d.modified_by,
      d.is_locked,
      d.is_sticky,
      d.is_archived,
      d.is_draft,
      d.is_nsfw,
      d.reply_count,
      d.view_count,
      d.accepted_reply_id,
      d.discussion_topic_id,
      d.profile_id,
      d.project_id,
      d.event_id,
      d.gameserver_id,
      d.referendum_id,
      d.theme_id,
      cbp.username::text                                              AS created_by_username,
      pfp.username::text                                              AS profile_username,
      projects.title::text                                            AS project_title,
      events.title::text                                              AS event_title,
      network_gameservers.name::text                                  AS gameserver_name,
      referendums.title::text                                         AS referendum_title,
      discussion_topics.name::text                                    AS discussion_topic_name,
      themes.name::text                                               AS theme_name,
      last_reply.created_at                                           AS last_reply_at,
      last_reply.created_by                                           AS last_reply_by
    FROM public.discussions AS d
    LEFT JOIN public.profiles AS cbp
      ON cbp.id = d.created_by
    LEFT JOIN public.profiles AS pfp
      ON pfp.id = d.profile_id
    LEFT JOIN public.projects
      ON projects.id = d.project_id
    LEFT JOIN public.events
      ON events.id = d.event_id
    LEFT JOIN public.network_gameservers
      ON network_gameservers.id = d.gameserver_id
    LEFT JOIN public.referendums
      ON referendums.id = d.referendum_id
    LEFT JOIN public.discussion_topics
      ON discussion_topics.id = d.discussion_topic_id
    LEFT JOIN public.themes
      ON themes.id = d.theme_id
    LEFT JOIN LATERAL (
      SELECT
        dr.created_at,
        dr.created_by
      FROM public.discussion_replies AS dr
      WHERE dr.discussion_id = d.id
        AND dr.is_deleted = false
      ORDER BY dr.created_at DESC
      LIMIT 1
    ) AS last_reply ON true
    WHERE
      (
        p_search = ''
        OR d.title       ILIKE '%' || p_search || '%'
        OR d.description ILIKE '%' || p_search || '%'
        OR d.slug        ILIKE '%' || p_search || '%'
      )
      AND (
        array_length(p_status, 1) IS NULL
        OR (
          ('open'     = ANY(p_status) AND NOT d.is_locked AND NOT d.is_archived AND NOT d.is_draft)
          OR ('locked'   = ANY(p_status) AND d.is_locked   = true)
          OR ('pinned'   = ANY(p_status) AND d.is_sticky   = true)
          OR ('archived' = ANY(p_status) AND d.is_archived = true)
          OR ('draft'    = ANY(p_status) AND d.is_draft    = true)
        )
      )
      AND (
        array_length(p_context, 1) IS NULL
        OR (
          (
            'general'     = ANY(p_context)
            AND d.discussion_topic_id IS NOT NULL
            AND d.profile_id    IS NULL
            AND d.project_id    IS NULL
            AND d.event_id      IS NULL
            AND d.gameserver_id IS NULL
            AND d.referendum_id IS NULL
          )
          OR ('profiles'    = ANY(p_context) AND d.profile_id    IS NOT NULL)
          OR ('projects'    = ANY(p_context) AND d.project_id    IS NOT NULL)
          OR ('events'      = ANY(p_context) AND d.event_id      IS NOT NULL)
          OR ('gameservers' = ANY(p_context) AND d.gameserver_id IS NOT NULL)
          OR ('referendums' = ANY(p_context) AND d.referendum_id IS NOT NULL)
          OR ('themes'      = ANY(p_context) AND d.theme_id      IS NOT NULL)
        )
      )
  )
  SELECT
    b.id,
    b.title,
    b.description,
    b.slug,
    b.created_at,
    b.created_by,
    b.modified_at,
    b.modified_by,
    b.is_locked,
    b.is_sticky,
    b.is_archived,
    b.is_draft,
    b.is_nsfw,
    b.reply_count,
    b.view_count,
    b.accepted_reply_id,
    b.discussion_topic_id,
    b.profile_id,
    b.project_id,
    b.event_id,
    b.gameserver_id,
    b.referendum_id,
    b.theme_id,
    b.created_by_username,
    b.profile_username,
    b.project_title,
    b.event_title,
    b.gameserver_name,
    b.referendum_title,
    b.discussion_topic_name,
    b.theme_name,
    b.last_reply_at,
    b.last_reply_by,
    COUNT(*) OVER ()                                                   AS total_count
  FROM base AS b
  ORDER BY
    CASE WHEN p_sort_dir = 'asc' THEN
      CASE p_sort_col
        WHEN 'last_active' THEN GREATEST(b.modified_at, b.last_reply_at, b.created_at)
        WHEN 'created_at'  THEN b.created_at
        ELSE NULL::timestamptz
      END
    END ASC NULLS LAST,
    CASE WHEN p_sort_dir = 'asc' THEN
      CASE p_sort_col
        WHEN 'title' THEN b.title
        ELSE NULL::text
      END
    END ASC NULLS LAST,
    CASE WHEN p_sort_dir = 'asc' THEN
      CASE p_sort_col
        WHEN 'replies' THEN b.reply_count
        WHEN 'views'   THEN b.view_count
        ELSE NULL::bigint
      END
    END ASC NULLS LAST,
    CASE WHEN p_sort_dir = 'desc' THEN
      CASE p_sort_col
        WHEN 'last_active' THEN GREATEST(b.modified_at, b.last_reply_at, b.created_at)
        WHEN 'created_at'  THEN b.created_at
        ELSE NULL::timestamptz
      END
    END DESC NULLS LAST,
    CASE WHEN p_sort_dir = 'desc' THEN
      CASE p_sort_col
        WHEN 'title' THEN b.title
        ELSE NULL::text
      END
    END DESC NULLS LAST,
    CASE WHEN p_sort_dir = 'desc' THEN
      CASE p_sort_col
        WHEN 'replies' THEN b.reply_count
        WHEN 'views'   THEN b.view_count
        ELSE NULL::bigint
      END
    END DESC NULLS LAST,
    b.created_at DESC
  LIMIT  p_limit
  OFFSET p_offset;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_admin_discussions_paginated(text, text[], text[], text, text, integer, integer) TO authenticated;

-- ----------------------------------------------------------------------------
-- 5. public.get_admin_discussions_paginated (with p_author_id)
--    Source: 20260424172504_fix_admin_discussions_orphaned_context_filter.sql
--    Change: LEFT JOIN public.gameservers -> LEFT JOIN public.network_gameservers
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_admin_discussions_paginated(
  p_search     text    DEFAULT ''::text,
  p_status     text[]  DEFAULT '{}'::text[],
  p_context    text[]  DEFAULT '{}'::text[],
  p_author_id  uuid    DEFAULT NULL::uuid,
  p_sort_col   text    DEFAULT 'last_active'::text,
  p_sort_dir   text    DEFAULT 'desc'::text,
  p_limit      integer DEFAULT 10,
  p_offset     integer DEFAULT 0
)
RETURNS TABLE(
  id                    uuid,
  title                 text,
  description           text,
  slug                  text,
  created_at            timestamptz,
  created_by            uuid,
  modified_at           timestamptz,
  modified_by           uuid,
  is_locked             boolean,
  is_sticky             boolean,
  is_archived           boolean,
  is_draft              boolean,
  is_nsfw               boolean,
  reply_count           bigint,
  view_count            bigint,
  accepted_reply_id     uuid,
  discussion_topic_id   uuid,
  profile_id            uuid,
  project_id            bigint,
  event_id              bigint,
  gameserver_id         bigint,
  referendum_id         bigint,
  theme_id              uuid,
  created_by_username   text,
  profile_username      text,
  project_title         text,
  event_title           text,
  gameserver_name       text,
  referendum_title      text,
  discussion_topic_name text,
  theme_name            text,
  last_reply_at         timestamptz,
  last_reply_by         uuid,
  total_count           bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  has_access boolean;
BEGIN
  has_access := public.has_permission('discussions.read'::public.app_permission);

  IF NOT has_access THEN
    RAISE EXCEPTION 'Insufficient permissions to view admin discussions overview';
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT
      d.id,
      d.title,
      d.description,
      d.slug,
      d.created_at,
      d.created_by,
      d.modified_at,
      d.modified_by,
      d.is_locked,
      d.is_sticky,
      d.is_archived,
      d.is_draft,
      d.is_nsfw,
      d.reply_count,
      d.view_count,
      d.accepted_reply_id,
      d.discussion_topic_id,
      d.profile_id,
      d.project_id,
      d.event_id,
      d.gameserver_id,
      d.referendum_id,
      d.theme_id,
      cbp.username::text                AS created_by_username,
      pfp.username::text                AS profile_username,
      projects.title::text              AS project_title,
      events.title::text                AS event_title,
      network_gameservers.name::text    AS gameserver_name,
      referendums.title::text           AS referendum_title,
      discussion_topics.name::text      AS discussion_topic_name,
      themes.name::text                 AS theme_name,
      last_reply.created_at             AS last_reply_at,
      last_reply.created_by             AS last_reply_by
    FROM public.discussions AS d
    LEFT JOIN public.profiles AS cbp        ON cbp.id = d.created_by
    LEFT JOIN public.profiles AS pfp        ON pfp.id = d.profile_id
    LEFT JOIN public.projects               ON projects.id = d.project_id
    LEFT JOIN public.events                 ON events.id = d.event_id
    LEFT JOIN public.network_gameservers    ON network_gameservers.id = d.gameserver_id
    LEFT JOIN public.referendums            ON referendums.id = d.referendum_id
    LEFT JOIN public.discussion_topics      ON discussion_topics.id = d.discussion_topic_id
    LEFT JOIN public.themes                 ON themes.id = d.theme_id
    LEFT JOIN LATERAL (
      SELECT dr.created_at, dr.created_by
      FROM public.discussion_replies AS dr
      WHERE dr.discussion_id = d.id
        AND dr.is_deleted = false
      ORDER BY dr.created_at DESC
      LIMIT 1
    ) AS last_reply ON true
    WHERE
      -- Search filter
      (
        p_search = ''
        OR d.title       ILIKE '%' || p_search || '%'
        OR d.description ILIKE '%' || p_search || '%'
        OR d.slug        ILIKE '%' || p_search || '%'
      )
      -- Status filter (OR across selected statuses; empty = all)
      AND (
        array_length(p_status, 1) IS NULL
        OR (
             ('open'     = ANY(p_status) AND NOT d.is_locked AND NOT d.is_archived AND NOT d.is_draft)
          OR ('locked'   = ANY(p_status) AND d.is_locked   = true)
          OR ('pinned'   = ANY(p_status) AND d.is_sticky   = true)
          OR ('archived' = ANY(p_status) AND d.is_archived = true)
          OR ('draft'    = ANY(p_status) AND d.is_draft    = true)
        )
      )
      -- Context filter (OR across selected contexts; empty = all)
      AND (
        array_length(p_context, 1) IS NULL
        OR (
          -- Forum: has a topic but no other context FK
          (
            'general' = ANY(p_context)
            AND d.discussion_topic_id IS NOT NULL
            AND d.profile_id    IS NULL
            AND d.project_id    IS NULL
            AND d.event_id      IS NULL
            AND d.gameserver_id IS NULL
            AND d.referendum_id IS NULL
          )
          OR ('profiles'    = ANY(p_context) AND d.profile_id    IS NOT NULL)
          OR ('projects'    = ANY(p_context) AND d.project_id    IS NOT NULL)
          OR ('events'      = ANY(p_context) AND d.event_id      IS NOT NULL)
          OR ('gameservers' = ANY(p_context) AND d.gameserver_id IS NOT NULL)
          OR ('referendums' = ANY(p_context) AND d.referendum_id IS NOT NULL)
          OR ('themes'      = ANY(p_context) AND d.theme_id      IS NOT NULL)
          -- Orphaned: all context FK columns are NULL
          OR (
            'other' = ANY(p_context)
            AND d.discussion_topic_id IS NULL
            AND d.profile_id          IS NULL
            AND d.project_id          IS NULL
            AND d.event_id            IS NULL
            AND d.gameserver_id       IS NULL
            AND d.referendum_id       IS NULL
            AND d.theme_id            IS NULL
          )
        )
      )
      -- Author filter (NULL = all authors)
      AND (
        p_author_id IS NULL
        OR d.created_by = p_author_id
      )
  )
  SELECT
    b.id,
    b.title,
    b.description,
    b.slug,
    b.created_at,
    b.created_by,
    b.modified_at,
    b.modified_by,
    b.is_locked,
    b.is_sticky,
    b.is_archived,
    b.is_draft,
    b.is_nsfw,
    b.reply_count,
    b.view_count,
    b.accepted_reply_id,
    b.discussion_topic_id,
    b.profile_id,
    b.project_id,
    b.event_id,
    b.gameserver_id,
    b.referendum_id,
    b.theme_id,
    b.created_by_username,
    b.profile_username,
    b.project_title,
    b.event_title,
    b.gameserver_name,
    b.referendum_title,
    b.discussion_topic_name,
    b.theme_name,
    b.last_reply_at,
    b.last_reply_by,
    COUNT(*) OVER () AS total_count
  FROM base AS b
  ORDER BY
    CASE WHEN p_sort_dir = 'asc' THEN
      CASE p_sort_col
        WHEN 'last_active' THEN GREATEST(b.modified_at, b.last_reply_at, b.created_at)
        WHEN 'created_at'  THEN b.created_at
        ELSE NULL::timestamptz
      END
    END ASC NULLS LAST,
    CASE WHEN p_sort_dir = 'asc' THEN
      CASE p_sort_col
        WHEN 'title' THEN b.title
        ELSE NULL::text
      END
    END ASC NULLS LAST,
    CASE WHEN p_sort_dir = 'asc' THEN
      CASE p_sort_col
        WHEN 'replies' THEN b.reply_count
        WHEN 'views'   THEN b.view_count
        ELSE NULL::bigint
      END
    END ASC NULLS LAST,
    CASE WHEN p_sort_dir = 'desc' THEN
      CASE p_sort_col
        WHEN 'last_active' THEN GREATEST(b.modified_at, b.last_reply_at, b.created_at)
        WHEN 'created_at'  THEN b.created_at
        ELSE NULL::timestamptz
      END
    END DESC NULLS LAST,
    CASE WHEN p_sort_dir = 'desc' THEN
      CASE p_sort_col
        WHEN 'title' THEN b.title
        ELSE NULL::text
      END
    END DESC NULLS LAST,
    CASE WHEN p_sort_dir = 'desc' THEN
      CASE p_sort_col
        WHEN 'replies' THEN b.reply_count
        WHEN 'views'   THEN b.view_count
        ELSE NULL::bigint
      END
    END DESC NULLS LAST,
    b.created_at DESC
  LIMIT  p_limit
  OFFSET p_offset;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_admin_discussions_paginated(text, text[], text[], uuid, text, text, integer, integer) TO authenticated;
