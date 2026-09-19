-- Let callers pick the bucket origin for get_metrics_bucketed.
--
-- Buckets were always cut from a fixed UTC origin, so a 24 hour bucket was a
-- UTC day. The day histograms label those buckets "today" and "yesterday" and
-- open a local midnight-to-midnight window on click. West of UTC the current
-- UTC day starts mid-afternoon, so "today" held the evening before and the
-- click window pointed at a day that hadn't started.
--
-- p_origin defaults to the old fixed origin. The app passes its local midnight
-- for day-sized buckets so a bar is a local day.
--
-- Adding a parameter changes the signature, so the old function is dropped
-- first and the grant reapplied. PostgREST resolves the three-argument call
-- through the default.

DROP FUNCTION IF EXISTS public.get_metrics_bucketed(timestamptz, timestamptz, interval);

CREATE OR REPLACE FUNCTION public.get_metrics_bucketed(
  p_since timestamp with time zone,
  p_until timestamp with time zone,
  p_bucket_interval interval,
  p_origin timestamp with time zone DEFAULT TIMESTAMPTZ '2001-01-01'
)
RETURNS TABLE(
  captured_at timestamp with time zone,
  users_online integer,
  users_total integer,
  teamspeak_online integer,
  gameservers_players integer,
  teamspeak_by_server jsonb,
  gameservers_by_server jsonb,
  users_by_game jsonb,
  users_by_steam_game jsonb,
  discussions_total integer,
  discussions_replies integer,
  discussions_new_total integer,
  discussions_new_replies integer,
  irc_online integer,
  irc_channels integer,
  irc_messages integer,
  irc_by_channel jsonb,
  irc_messages_by_channel jsonb
)
LANGUAGE sql STABLE SET search_path TO ''
AS $function$
  WITH

  src AS MATERIALIZED (
    SELECT
      date_bin(p_bucket_interval, m.captured_at, p_origin) AS bucket,
      (x.d -> 'users'       ->> 'online')::numeric   AS users_online,
      (x.d -> 'users'       ->> 'total')::numeric    AS users_total,
      (x.d -> 'teamspeak'   ->> 'online')::numeric   AS teamspeak_online,
      (x.d -> 'gameservers' ->> 'players')::numeric  AS gameservers_players,
      (x.d -> 'discussions' ->> 'total')::numeric      AS discussions_total,
      (x.d -> 'discussions' ->> 'replies')::numeric    AS discussions_replies,
      (x.d -> 'discussions' ->> 'newTotal')::numeric   AS discussions_new_total,
      (x.d -> 'discussions' ->> 'newReplies')::numeric AS discussions_new_replies,
      (x.d -> 'irc'         ->> 'online')::numeric     AS irc_online,
      (x.d -> 'irc'         ->> 'channels')::numeric   AS irc_channels,
      (x.d -> 'irc'         ->> 'messages')::numeric   AS irc_messages,
      (x.d -> 'teamspeak'   -> 'byServer')    AS ts_obj,
      (x.d -> 'gameservers' -> 'byServer')    AS gs_obj,
      (x.d -> 'users'       -> 'byGame')      AS game_obj,
      (x.d -> 'users'       -> 'bySteamGame') AS steam_obj,
      (x.d -> 'irc'         -> 'byChannel')         AS irc_chan_obj,
      (x.d -> 'irc'         -> 'messagesByChannel') AS irc_msg_obj
    FROM public.metrics m
    -- `||` yields a freshly built in-memory jsonb, so the extractions above
    -- detoast m.data once instead of once each.
    CROSS JOIN LATERAL (SELECT m.data || '{}'::jsonb AS d) x
    WHERE m.captured_at >= p_since
      AND m.captured_at <  p_until
  ),

  scalar_agg AS (
    SELECT
      bucket,
      MAX(users_online)::int                   AS users_online,
      ROUND(AVG(users_total))::int             AS users_total,
      MAX(teamspeak_online)::int               AS teamspeak_online,
      MAX(gameservers_players)::int            AS gameservers_players,
      ROUND(AVG(discussions_total))::int       AS discussions_total,
      ROUND(AVG(discussions_replies))::int     AS discussions_replies,
      SUM(discussions_new_total)::int          AS discussions_new_total,
      SUM(discussions_new_replies)::int        AS discussions_new_replies,
      MAX(irc_online)::int                     AS irc_online,
      MAX(irc_channels)::int                   AS irc_channels,
      SUM(irc_messages)::int                   AS irc_messages
    FROM src
    GROUP BY bucket
  ),

  map_keyed AS (
    SELECT
      s.bucket,
      maps.tag,
      kv.key,
      MAX(
        CASE
          WHEN maps.tag = 'gs' THEN public.metrics_gameserver_player_count(kv.value)
          ELSE (kv.value #>> '{}')::numeric
        END
      ) AS max_val,
      SUM(
        CASE
          WHEN maps.tag = 'ircmsg' THEN (kv.value #>> '{}')::numeric
          ELSE NULL
        END
      ) AS sum_val
    FROM src s
    CROSS JOIN LATERAL (
      VALUES
        ('ts',     s.ts_obj),
        ('gs',     s.gs_obj),
        ('game',   s.game_obj),
        ('steam',  s.steam_obj),
        ('irc',    s.irc_chan_obj),
        ('ircmsg', s.irc_msg_obj)
    ) AS maps(tag, obj)
    CROSS JOIN LATERAL jsonb_each(maps.obj) AS kv(key, value)
    GROUP BY s.bucket, maps.tag, kv.key
  ),

  map_agg AS (
    SELECT
      bucket,
      jsonb_object_agg(key, max_val::int) FILTER (WHERE tag = 'ts')     AS ts_by_server,
      jsonb_object_agg(key, max_val::int) FILTER (WHERE tag = 'gs')     AS gs_by_server,
      jsonb_object_agg(key, max_val::int) FILTER (WHERE tag = 'game')   AS users_by_game,
      jsonb_object_agg(key, max_val::int) FILTER (WHERE tag = 'steam')  AS users_by_steam_game,
      jsonb_object_agg(key, max_val::int) FILTER (WHERE tag = 'irc')    AS irc_by_channel,
      jsonb_object_agg(key, sum_val::int) FILTER (WHERE tag = 'ircmsg') AS irc_messages_by_channel
    FROM map_keyed
    GROUP BY bucket
  ),

  series AS (
    SELECT gs.bucket
    FROM generate_series(
      date_bin(p_bucket_interval, p_since + p_bucket_interval, p_origin),
      date_bin(p_bucket_interval, p_until,                     p_origin),
      p_bucket_interval
    ) AS gs(bucket)
  )

  SELECT
    s.bucket                                     AS captured_at,
    sa.users_online,
    sa.users_total,
    sa.teamspeak_online,
    sa.gameservers_players,
    ma.ts_by_server                              AS teamspeak_by_server,
    ma.gs_by_server                              AS gameservers_by_server,
    ma.users_by_game,
    ma.users_by_steam_game,
    sa.discussions_total,
    sa.discussions_replies,
    sa.discussions_new_total,
    sa.discussions_new_replies,
    sa.irc_online,
    sa.irc_channels,
    sa.irc_messages,
    ma.irc_by_channel,
    ma.irc_messages_by_channel
  FROM series s
  LEFT JOIN scalar_agg sa ON sa.bucket = s.bucket
  LEFT JOIN map_agg    ma ON ma.bucket = s.bucket
  ORDER BY s.bucket;
$function$;

GRANT EXECUTE ON FUNCTION public.get_metrics_bucketed(timestamptz, timestamptz, interval, timestamptz)
  TO anon, authenticated;
