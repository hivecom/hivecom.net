-- Add is_archived to search_global return type and a p_show_archived filter param.
-- Non-forum result types (events, profiles, etc.) don't have an archived concept,
-- so they always return is_archived = false and are unaffected by the filter.
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
  url         text,
  score       float4,
  is_archived boolean
)
LANGUAGE sql
SECURITY INVOKER
STABLE
AS $$
  SELECT id, result_type, title, subtitle, url, score, is_archived
  FROM (
    -- discussion_topics
    SELECT
      dt.id::text,
      'discussion_topic'::text AS result_type,
      dt.name AS title,
      dt.description AS subtitle,
      (
        '/forum?activeTopicId=' || dt.id::text
        || CASE WHEN dt.slug IS NOT NULL AND dt.slug != ''
             THEN '&activeTopic=' || dt.slug
             ELSE ''
           END
      ) AS url,
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

    -- discussions: pure forum threads only (no entity FK set, must have a topic)
    SELECT
      d.id::text,
      'discussion'::text AS result_type,
      d.title AS title,
      d.description AS subtitle,
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
      AND d.event_id IS NULL
      AND d.referendum_id IS NULL
      AND d.profile_id IS NULL
      AND d.project_id IS NULL
      AND d.gameserver_id IS NULL
      AND (p_show_archived OR NOT d.is_archived)
      AND greatest(
            COALESCE(extensions.word_similarity(p_query, d.title), 0::real),
            COALESCE(extensions.word_similarity(p_query, d.description), 0::real)
          ) > 0.1

    UNION ALL

    -- profiles: public profiles for everyone; all non-banned profiles for authenticated users
    SELECT
      p.id::text,
      'profile'::text AS result_type,
      p.username AS title,
      p.introduction AS subtitle,
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

    -- gameservers
    SELECT
      gs.id::text,
      'gameserver'::text AS result_type,
      gs.name AS title,
      gs.description AS subtitle,
      '/servers/gameservers' AS url,
      greatest(
        extensions.word_similarity(p_query, gs.name),
        COALESCE(extensions.word_similarity(p_query, gs.description), 0::real)
      ) AS score,
      false AS is_archived
    FROM public.gameservers gs
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
