-- Optimize get_metrics_bucketed for long ranges.
--
-- Selecting Last Year / Last 3 Years / All Time on the admin metrics page
-- scans the full raw window (~24k rows, 40 MB of jsonb) and the old query
-- shape made that far more expensive than it needed to be:
--
--   1. Every `m.data -> ...` expression detoasts the row's jsonb again. With
--      12 extractions that's ~12x the decompression work. Measured on prod:
--      one extraction over 3 years costs ~110 ms, all 12 cost ~1.4 s.
--   2. The shared `bucketed` CTE materialized every jsonb map per row into a
--      ~56 MB tuplestore that spilled to temp and was re-read by four
--      separate expansion CTEs (~220 MB of temp reads per call).
--   3. The planner picked sort-based grouping for the expansions, sorting
--      wide jsonb rows through external merges.
--
-- New shape:
--   - `x.d` binds `m.data || '{}'` in a LATERAL, forcing a single detoast
--     per row; all 12 extractions then read the in-memory copy.
--   - One narrow materialized pass (`src`) extracts scalars and the four map
--     objects once.
--   - The four per-key expansions collapse into a single pass that tags each
--     map ('ts'/'gs'/'game'/'steam'), expands with one jsonb_each, groups by
--     (bucket, tag, key), and pivots back to columns with FILTER.
--
-- Results are byte-identical to the previous implementation (verified on
-- prod data for 3y/168h and 7d/1h ranges). Temp I/O drops ~4x, which is what
-- matters when several chart queries run concurrently.

CREATE OR REPLACE FUNCTION public.get_metrics_bucketed(
  p_since timestamp with time zone,
  p_until timestamp with time zone,
  p_bucket_interval interval
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
  discussions_new_replies integer
)
LANGUAGE sql STABLE SET search_path TO ''
AS $function$
  WITH

  src AS MATERIALIZED (
    SELECT
      date_bin(p_bucket_interval, m.captured_at, TIMESTAMPTZ '2001-01-01') AS bucket,
      (x.d -> 'users'       ->> 'online')::numeric   AS users_online,
      (x.d -> 'users'       ->> 'total')::numeric    AS users_total,
      (x.d -> 'teamspeak'   ->> 'online')::numeric   AS teamspeak_online,
      (x.d -> 'gameservers' ->> 'players')::numeric  AS gameservers_players,
      (x.d -> 'discussions' ->> 'total')::numeric      AS discussions_total,
      (x.d -> 'discussions' ->> 'replies')::numeric    AS discussions_replies,
      (x.d -> 'discussions' ->> 'newTotal')::numeric   AS discussions_new_total,
      (x.d -> 'discussions' ->> 'newReplies')::numeric AS discussions_new_replies,
      (x.d -> 'teamspeak'   -> 'byServer')    AS ts_obj,
      (x.d -> 'gameservers' -> 'byServer')    AS gs_obj,
      (x.d -> 'users'       -> 'byGame')      AS game_obj,
      (x.d -> 'users'       -> 'bySteamGame') AS steam_obj
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
      SUM(discussions_new_replies)::int        AS discussions_new_replies
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
          WHEN maps.tag = 'gs' THEN
            CASE
              WHEN (kv.value ->> 'protocol') = 'minecraft'
              THEN (kv.value -> 'data' ->> 'numPlayers')::numeric
              ELSE (kv.value -> 'data' ->> 'players')::numeric
            END
          ELSE (kv.value #>> '{}')::numeric
        END
      ) AS max_val
    FROM src s
    CROSS JOIN LATERAL (
      VALUES
        ('ts',    s.ts_obj),
        ('gs',    s.gs_obj),
        ('game',  s.game_obj),
        ('steam', s.steam_obj)
    ) AS maps(tag, obj)
    CROSS JOIN LATERAL jsonb_each(maps.obj) AS kv(key, value)
    GROUP BY s.bucket, maps.tag, kv.key
  ),

  map_agg AS (
    SELECT
      bucket,
      jsonb_object_agg(key, max_val::int) FILTER (WHERE tag = 'ts')    AS ts_by_server,
      jsonb_object_agg(key, max_val::int) FILTER (WHERE tag = 'gs')    AS gs_by_server,
      jsonb_object_agg(key, max_val::int) FILTER (WHERE tag = 'game')  AS users_by_game,
      jsonb_object_agg(key, max_val::int) FILTER (WHERE tag = 'steam') AS users_by_steam_game
    FROM map_keyed
    GROUP BY bucket
  ),

  series AS (
    SELECT gs.bucket
    FROM generate_series(
      date_bin(p_bucket_interval, p_since + p_bucket_interval, TIMESTAMPTZ '2001-01-01'),
      date_bin(p_bucket_interval, p_until,                     TIMESTAMPTZ '2001-01-01'),
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
    sa.discussions_new_replies
  FROM series s
  LEFT JOIN scalar_agg sa ON sa.bucket = s.bucket
  LEFT JOIN map_agg    ma ON ma.bucket = s.bucket
  ORDER BY s.bucket;
$function$;
