-- Drop the jsonb concat "fence" from get_metrics_bucketed.
--
-- 20260827165140 wrapped m.data in `|| '{}'::jsonb` through a LATERAL on the
-- theory that the concat would materialise one in-memory copy per row and the
-- extractions would share it. It never did. Postgres pulls up a LATERAL with no
-- FROM and no aggregate and substitutes the expression at every reference, and
-- it does no common-subexpression elimination across a target list, so the plan
-- carried 17 separate `(m.data || '{}'::jsonb)` calls in the Seq Scan output.
-- Each one detoasts the payload and builds a full fresh copy to pull one field.
--
-- Confirmed on prod with EXPLAIN (VERBOSE) against the function body, since the
-- function itself never inlines: a SQL function with a SET clause (this one sets
-- search_path) is excluded from inlining, so EXPLAIN on the RPC shows only a
-- Function Scan.
--
-- Reading m.data directly is what the code did before that migration. Signature
-- is unchanged, so CREATE OR REPLACE keeps the existing grants.

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
      (m.data -> 'users'       ->> 'online')::numeric   AS users_online,
      (m.data -> 'users'       ->> 'total')::numeric    AS users_total,
      (m.data -> 'teamspeak'   ->> 'online')::numeric   AS teamspeak_online,
      (m.data -> 'gameservers' ->> 'players')::numeric  AS gameservers_players,
      (m.data -> 'discussions' ->> 'total')::numeric      AS discussions_total,
      (m.data -> 'discussions' ->> 'replies')::numeric    AS discussions_replies,
      (m.data -> 'discussions' ->> 'newTotal')::numeric   AS discussions_new_total,
      (m.data -> 'discussions' ->> 'newReplies')::numeric AS discussions_new_replies,
      (m.data -> 'irc'         ->> 'online')::numeric     AS irc_online,
      (m.data -> 'irc'         ->> 'channels')::numeric   AS irc_channels,
      (m.data -> 'irc'         ->> 'messages')::numeric   AS irc_messages,
      (m.data -> 'teamspeak'   -> 'byServer')    AS ts_obj,
      (m.data -> 'gameservers' -> 'byServer')    AS gs_obj,
      (m.data -> 'users'       -> 'byGame')      AS game_obj,
      (m.data -> 'users'       -> 'bySteamGame') AS steam_obj,
      (m.data -> 'irc'         -> 'byChannel')         AS irc_chan_obj,
      (m.data -> 'irc'         -> 'messagesByChannel') AS irc_msg_obj
    FROM public.metrics m
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
